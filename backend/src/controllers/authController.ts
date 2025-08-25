import { Request, Response } from 'express';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import {
  comparePassword,
  generateTokenPair,
  verifyRefreshToken,
  validatePasswordStrength,
  hashPassword,
  JWTPayload
} from '../utils/auth';
import logger from '../utils/logger';

const pool = new Pool({
  connectionString: config.database.url
});

/**
 * Login endpoint
 * Authenticates user and returns JWT tokens
 */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({
        error: 'Bad request',
        message: 'Username and password are required'
      });
      return;
    }

    // Find user in database
    const userResult = await pool.query(
      'SELECT id, username, password_hash, role FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      logger.warn(`Login attempt for non-existent user: ${username}`);
      res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid username or password'
      });
      return;
    }

    const user = userResult.rows[0];

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password_hash);

    if (!isPasswordValid) {
      logger.warn(`Failed login attempt for user: ${username}`);
      res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid username or password'
      });
      return;
    }

    // Create session
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Generate tokens
    const payload: JWTPayload = {
      userId: user.id,
      role: user.role,
      sessionId
    };

    const tokens = generateTokenPair(payload);

    // Store session in database
    await pool.query(
      `INSERT INTO user_sessions (id, user_id, refresh_token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        sessionId,
        user.id,
        tokens.refreshToken,
        req.ip,
        req.headers['user-agent'],
        expiresAt
      ]
    );

    // Update last login
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Log successful login to audit log
    await pool.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user.id,
        'login',
        'user',
        user.id,
        req.ip,
        req.headers['user-agent']
      ]
    );

    logger.info(`User logged in: ${username} (${user.role})`);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      },
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during login'
    });
  }
}

/**
 * Logout endpoint
 * Invalidates the user's session
 */
export async function logout(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user || !req.user.sessionId) {
      res.status(400).json({
        error: 'Bad request',
        message: 'No active session found'
      });
      return;
    }

    // Delete session from database
    await pool.query(
      'DELETE FROM user_sessions WHERE id = $1 AND user_id = $2',
      [req.user.sessionId, req.user.userId]
    );

    // Log logout to audit log
    await pool.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user.userId,
        'logout',
        'user',
        req.user.userId,
        req.ip,
        req.headers['user-agent']
      ]
    );

    logger.info(`User logged out: ${req.user.userId}`);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during logout'
    });
  }
}

/**
 * Refresh token endpoint
 * Generates new access token using refresh token
 */
export async function refreshToken(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        error: 'Bad request',
        message: 'Refresh token is required'
      });
      return;
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    if (!decoded) {
      res.status(401).json({
        error: 'Invalid token',
        message: 'Refresh token verification failed'
      });
      return;
    }

    // Check if session exists and is valid
    const sessionResult = await pool.query(
      `SELECT * FROM user_sessions 
       WHERE id = $1 
       AND user_id = $2 
       AND refresh_token = $3
       AND expires_at > NOW()`,
      [decoded.sessionId, decoded.userId, refreshToken]
    );

    if (sessionResult.rows.length === 0) {
      res.status(401).json({
        error: 'Invalid session',
        message: 'Session not found or expired'
      });
      return;
    }

    // Generate new token pair
    const payload: JWTPayload = {
      userId: decoded.userId,
      role: decoded.role,
      sessionId: decoded.sessionId
    };

    const tokens = generateTokenPair(payload);

    // Update refresh token in database
    await pool.query(
      `UPDATE user_sessions 
       SET refresh_token = $1, last_activity = NOW()
       WHERE id = $2`,
      [tokens.refreshToken, decoded.sessionId]
    );

    logger.info(`Token refreshed for user: ${decoded.userId}`);

    res.json({
      success: true,
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      }
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during token refresh'
    });
  }
}

/**
 * Change password endpoint
 * Allows users to change their password
 */
export async function changePassword(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        error: 'Bad request',
        message: 'Current password and new password are required'
      });
      return;
    }

    // Validate new password strength
    const validation = validatePasswordStrength(newPassword);
    if (!validation.isValid) {
      res.status(400).json({
        error: 'Invalid password',
        message: validation.message
      });
      return;
    }

    // Get user's current password hash
    const userResult = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({
        error: 'User not found',
        message: 'User account not found'
      });
      return;
    }

    // Verify current password
    const isPasswordValid = await comparePassword(currentPassword, userResult.rows[0].password_hash);

    if (!isPasswordValid) {
      res.status(401).json({
        error: 'Authentication failed',
        message: 'Current password is incorrect'
      });
      return;
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password in database
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, req.user.userId]
    );

    // Invalidate all sessions except current one
    await pool.query(
      'DELETE FROM user_sessions WHERE user_id = $1 AND id != $2',
      [req.user.userId, req.user.sessionId]
    );

    // Log password change to audit log
    await pool.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user.userId,
        'change_password',
        'user',
        req.user.userId,
        req.ip,
        req.headers['user-agent']
      ]
    );

    logger.info(`Password changed for user: ${req.user.userId}`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while changing password'
    });
  }
}

/**
 * Get current user info
 * Returns information about the authenticated user
 */
export async function getCurrentUser(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated'
      });
      return;
    }

    // Get user info from database
    const userResult = await pool.query(
      'SELECT id, username, role, last_login, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({
        error: 'User not found',
        message: 'User account not found'
      });
      return;
    }

    const user = userResult.rows[0];

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        lastLogin: user.last_login,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    logger.error('Get current user error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching user information'
    });
  }
}

/**
 * List active sessions for admin
 * Returns all active user sessions
 */
export async function listActiveSessions(req: Request, res: Response): Promise<void> {
  try {
    // This endpoint should be admin-only
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({
        error: 'Access denied',
        message: 'Admin role required'
      });
      return;
    }

    // Get all active sessions
    const sessionsResult = await pool.query(
      `SELECT 
        s.id,
        s.user_id,
        u.username,
        u.role,
        s.ip_address,
        s.user_agent,
        s.last_activity,
        s.expires_at,
        s.created_at
       FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.expires_at > NOW()
       ORDER BY s.last_activity DESC`
    );

    res.json({
      sessions: sessionsResult.rows.map(session => ({
        id: session.id,
        userId: session.user_id,
        username: session.username,
        role: session.role,
        ipAddress: session.ip_address,
        userAgent: session.user_agent,
        lastActivity: session.last_activity,
        expiresAt: session.expires_at,
        createdAt: session.created_at
      }))
    });
  } catch (error) {
    logger.error('List sessions error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching sessions'
    });
  }
}

/**
 * Revoke session for admin
 * Allows admin to terminate any user session
 */
export async function revokeSession(req: Request, res: Response): Promise<void> {
  try {
    // This endpoint should be admin-only
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({
        error: 'Access denied',
        message: 'Admin role required'
      });
      return;
    }

    const { sessionId } = req.params;

    if (!sessionId) {
      res.status(400).json({
        error: 'Bad request',
        message: 'Session ID is required'
      });
      return;
    }

    // Delete session
    const result = await pool.query(
      'DELETE FROM user_sessions WHERE id = $1 RETURNING user_id',
      [sessionId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'Not found',
        message: 'Session not found'
      });
      return;
    }

    // Log session revocation to audit log
    await pool.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, ip_address, user_agent, new_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user.userId,
        'revoke_session',
        'session',
        sessionId,
        req.ip,
        req.headers['user-agent'],
        JSON.stringify({ revokedUserId: result.rows[0].user_id })
      ]
    );

    logger.info(`Session revoked by admin: ${sessionId}`);

    res.json({
      success: true,
      message: 'Session revoked successfully'
    });
  } catch (error) {
    logger.error('Revoke session error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while revoking session'
    });
  }
}