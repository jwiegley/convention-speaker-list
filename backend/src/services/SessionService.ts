import { Pool } from 'pg';
import { config } from '../config';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Session Service
 * Manages user sessions with timeout and activity tracking
 */
export class SessionService {
  private pool: Pool;
  private sessionTimeout: number = 15 * 60 * 1000; // 15 minutes in milliseconds
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.pool = new Pool({
      connectionString: config.database.url
    });

    // Start automatic cleanup of expired sessions
    this.startCleanupInterval();
  }

  /**
   * Create a new session
   */
  async createSession(
    userId: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<string> {
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + this.sessionTimeout);

    await this.pool.query(
      `INSERT INTO user_sessions 
       (id, user_id, expires_at, last_activity, user_agent, ip_address)
       VALUES ($1, $2, $3, NOW(), $4, $5)`,
      [sessionId, userId, expiresAt, userAgent, ipAddress]
    );

    logger.info(`Created session ${sessionId} for user ${userId}`);
    return sessionId;
  }

  /**
   * Update session activity
   */
  async updateActivity(sessionId: string): Promise<boolean> {
    const expiresAt = new Date(Date.now() + this.sessionTimeout);
    
    const result = await this.pool.query(
      `UPDATE user_sessions 
       SET last_activity = NOW(), 
           expires_at = $2
       WHERE id = $1 
       AND expires_at > NOW()`,
      [sessionId, expiresAt]
    );

    return result.rowCount > 0;
  }

  /**
   * Check if session is valid and not expired
   */
  async validateSession(sessionId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT * FROM user_sessions 
       WHERE id = $1 
       AND expires_at > NOW()`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    // Check for inactivity timeout
    const session = result.rows[0];
    const lastActivity = new Date(session.last_activity);
    const inactiveTime = Date.now() - lastActivity.getTime();

    if (inactiveTime > this.sessionTimeout) {
      // Session has been inactive too long
      await this.invalidateSession(sessionId);
      return false;
    }

    // Update activity timestamp
    await this.updateActivity(sessionId);
    return true;
  }

  /**
   * Get session details
   */
  async getSession(sessionId: string): Promise<any | null> {
    const result = await this.pool.query(
      `SELECT 
         s.*,
         u.username,
         u.role
       FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = $1 
       AND s.expires_at > NOW()`,
      [sessionId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Invalidate a session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE user_sessions 
       SET expires_at = NOW() 
       WHERE id = $1`,
      [sessionId]
    );

    logger.info(`Invalidated session ${sessionId}`);
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateUserSessions(userId: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE user_sessions 
       SET expires_at = NOW() 
       WHERE user_id = $1 
       AND expires_at > NOW()`,
      [userId]
    );

    logger.info(`Invalidated ${result.rowCount} sessions for user ${userId}`);
    return result.rowCount;
  }

  /**
   * Get active sessions for a user
   */
  async getUserSessions(userId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM user_sessions 
       WHERE user_id = $1 
       AND expires_at > NOW()
       ORDER BY last_activity DESC`,
      [userId]
    );

    return result.rows;
  }

  /**
   * Get all active sessions (admin only)
   */
  async getAllActiveSessions(): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT 
         s.*,
         u.username,
         u.role
       FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.expires_at > NOW()
       ORDER BY s.last_activity DESC`
    );

    return result.rows;
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM user_sessions 
       WHERE expires_at <= NOW()
       RETURNING id`
    );

    if (result.rowCount > 0) {
      logger.info(`Cleaned up ${result.rowCount} expired sessions`);
    }

    return result.rowCount;
  }

  /**
   * Start automatic cleanup interval
   */
  private startCleanupInterval(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions().catch(error => {
        logger.error('Session cleanup failed:', error);
      });
    }, 5 * 60 * 1000);
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  public stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<any> {
    const result = await this.pool.query(
      `SELECT 
         COUNT(*) as total_active,
         COUNT(DISTINCT user_id) as unique_users,
         AVG(EXTRACT(EPOCH FROM (NOW() - last_activity)) / 60)::numeric(10,2) as avg_idle_minutes,
         MIN(last_activity) as oldest_activity,
         MAX(last_activity) as newest_activity
       FROM user_sessions
       WHERE expires_at > NOW()`
    );

    const roleStats = await this.pool.query(
      `SELECT 
         u.role,
         COUNT(*) as count
       FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.expires_at > NOW()
       GROUP BY u.role`
    );

    return {
      ...result.rows[0],
      byRole: roleStats.rows
    };
  }

  /**
   * Extend session timeout for a specific session
   */
  async extendSession(sessionId: string, additionalMinutes: number = 15): Promise<boolean> {
    const newExpiry = new Date(Date.now() + (additionalMinutes * 60 * 1000));
    
    const result = await this.pool.query(
      `UPDATE user_sessions 
       SET expires_at = $2
       WHERE id = $1 
       AND expires_at > NOW()`,
      [sessionId, newExpiry]
    );

    return result.rowCount > 0;
  }
}

// Export singleton instance
export default new SessionService();

// Export middleware for Express
export function sessionTimeoutMiddleware(req: any, res: any, next: any) {
  if (req.user && req.user.sessionId) {
    const sessionService = new SessionService();
    
    sessionService.validateSession(req.user.sessionId)
      .then(isValid => {
        if (!isValid) {
          res.status(401).json({
            error: 'Session expired',
            message: 'Your session has expired due to inactivity. Please log in again.'
          });
        } else {
          next();
        }
      })
      .catch(error => {
        logger.error('Session validation error:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to validate session'
        });
      });
  } else {
    next();
  }
}