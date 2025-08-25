import { Pool } from 'pg';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * Audit Service
 * Tracks all admin actions for security and compliance
 */
export class AuditService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: config.database.url
    });
  }

  /**
   * Log an audit event
   */
  async logEvent(
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string | null,
    details: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO audit_logs 
         (user_id, action, resource_type, resource_id, details, ip_address, user_agent, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          userId,
          action,
          resourceType,
          resourceId,
          JSON.stringify(details),
          ipAddress,
          userAgent
        ]
      );
      
      logger.info(`Audit log: User ${userId} performed ${action} on ${resourceType}:${resourceId}`);
    } catch (error) {
      logger.error('Failed to log audit event:', error);
      // Don't throw - audit logging should not break the application
    }
  }

  /**
   * Log admin login
   */
  async logLogin(userId: string, role: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.logEvent(
      userId,
      'LOGIN',
      'authentication',
      null,
      { role, timestamp: new Date().toISOString() },
      ipAddress,
      userAgent
    );
  }

  /**
   * Log admin logout
   */
  async logLogout(userId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.logEvent(
      userId,
      'LOGOUT',
      'authentication',
      null,
      { timestamp: new Date().toISOString() },
      ipAddress,
      userAgent
    );
  }

  /**
   * Log queue modification
   */
  async logQueueAction(
    userId: string,
    action: string,
    queueId: string,
    details: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent(
      userId,
      `QUEUE_${action.toUpperCase()}`,
      'queue',
      queueId,
      details,
      ipAddress,
      userAgent
    );
  }

  /**
   * Log delegate modification
   */
  async logDelegateAction(
    userId: string,
    action: string,
    delegateId: string,
    details: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent(
      userId,
      `DELEGATE_${action.toUpperCase()}`,
      'delegate',
      delegateId,
      details,
      ipAddress,
      userAgent
    );
  }

  /**
   * Log settings change
   */
  async logSettingsChange(
    userId: string,
    settingName: string,
    oldValue: any,
    newValue: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent(
      userId,
      'SETTINGS_CHANGE',
      'settings',
      settingName,
      { oldValue, newValue },
      ipAddress,
      userAgent
    );
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    userId: string | null,
    eventType: string,
    details: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent(
      userId || 'system',
      `SECURITY_${eventType.toUpperCase()}`,
      'security',
      null,
      details,
      ipAddress,
      userAgent
    );
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(filters: {
    userId?: string;
    action?: string;
    resourceType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.userId) {
      query += ` AND user_id = $${paramIndex++}`;
      params.push(filters.userId);
    }

    if (filters.action) {
      query += ` AND action = $${paramIndex++}`;
      params.push(filters.action);
    }

    if (filters.resourceType) {
      query += ` AND resource_type = $${paramIndex++}`;
      params.push(filters.resourceType);
    }

    if (filters.startDate) {
      query += ` AND created_at >= $${paramIndex++}`;
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      query += ` AND created_at <= $${paramIndex++}`;
      params.push(filters.endDate);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(filters.limit);
    }

    if (filters.offset) {
      query += ` OFFSET $${paramIndex++}`;
      params.push(filters.offset);
    }

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get user activity summary
   */
  async getUserActivitySummary(userId: string, days: number = 30): Promise<any> {
    const result = await this.pool.query(
      `SELECT 
         action,
         COUNT(*) as count,
         MAX(created_at) as last_occurrence
       FROM audit_logs
       WHERE user_id = $1
         AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY action
       ORDER BY count DESC`,
      [userId]
    );

    return {
      userId,
      period: `${days} days`,
      activities: result.rows
    };
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM audit_logs
       WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
       RETURNING id`
    );

    logger.info(`Cleaned up ${result.rowCount} old audit logs`);
    return result.rowCount;
  }
}

// Export singleton instance
export default new AuditService();

// Export middleware for Express
export function auditMiddleware(action: string, resourceType: string) {
  return async (req: any, res: any, next: any) => {
    // Store original send function
    const originalSend = res.send;

    // Override send to capture response and log audit
    res.send = function(data: any) {
      // Log audit event if request was successful
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        const auditService = new AuditService();
        auditService.logEvent(
          req.user.userId,
          action,
          resourceType,
          req.params.id || null,
          {
            method: req.method,
            path: req.path,
            body: req.body,
            query: req.query
          },
          req.ip,
          req.headers['user-agent']
        ).catch(error => {
          logger.error('Audit middleware failed:', error);
        });
      }

      // Call original send
      return originalSend.call(this, data);
    };

    next();
  };
}