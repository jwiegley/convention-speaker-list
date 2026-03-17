import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader, JWTPayload } from '../utils/auth';
import logger from '../utils/logger';

// Extend Express Request type to include user
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JWTPayload;
      token?: string;
    }
  }
}

/**
 * Middleware to authenticate JWT tokens
 * Extracts and verifies the JWT token from the Authorization header
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'No token provided',
      });
      return;
    }

    // Verify token
    const decoded = verifyToken(token);

    if (!decoded) {
      res.status(401).json({
        error: 'Invalid token',
        message: 'Token verification failed',
      });
      return;
    }

    // Attach user info and token to request
    req.user = decoded;
    req.token = token;

    // Log authentication
    logger.debug(`User authenticated: ${decoded.userId} (${decoded.role})`);

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(401).json({
      error: 'Authentication failed',
      message: 'An error occurred during authentication',
    });
  }
}

/**
 * Middleware to require admin role
 * Must be used after authenticate middleware
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      error: 'Authentication required',
      message: 'User not authenticated',
    });
    return;
  }

  if (req.user.role !== 'admin') {
    logger.warn(`Access denied for user ${req.user.userId}: admin role required`);
    res.status(403).json({
      error: 'Access denied',
      message: 'Admin role required',
    });
    return;
  }

  next();
}

/**
 * Middleware to require spectator role or higher
 * Must be used after authenticate middleware
 */
export function requireSpectator(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      error: 'Authentication required',
      message: 'User not authenticated',
    });
    return;
  }

  if (req.user.role !== 'spectator' && req.user.role !== 'admin') {
    logger.warn(`Access denied for user ${req.user.userId}: spectator role required`);
    res.status(403).json({
      error: 'Access denied',
      message: 'Spectator or admin role required',
    });
    return;
  }

  next();
}

/**
 * Optional authentication middleware
 * Attempts to authenticate but doesn't fail if no token is provided
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        req.user = decoded;
        req.token = token;
      }
    }

    next();
  } catch (error) {
    // Silent failure - continue without authentication
    logger.debug('Optional auth failed, continuing without authentication');
    next();
  }
}

/**
 * Middleware to check if user owns the resource
 * Compares user ID from token with resource owner ID
 */
export function requireOwnership(resourceUserIdField: string = 'userId') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'User not authenticated',
      });
      return;
    }

    // Admin can access all resources
    if (req.user.role === 'admin') {
      next();
      return;
    }

    // Check ownership
    const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];

    if (!resourceUserId) {
      res.status(400).json({
        error: 'Bad request',
        message: 'Resource user ID not found',
      });
      return;
    }

    if (req.user.userId !== resourceUserId) {
      logger.warn(`Access denied for user ${req.user.userId}: not resource owner`);
      res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this resource',
      });
      return;
    }

    next();
  };
}

/**
 * Rate limiting middleware specific to authenticated users
 * Different limits for admin vs regular users
 */
export function authRateLimit(adminLimit: number = 1000, userLimit: number = 100) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next();
      return;
    }

    const userId = req.user.userId;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const limit = req.user.role === 'admin' ? adminLimit : userLimit;

    // Get or create user's request tracking
    let userRequests = requests.get(userId);

    if (!userRequests || now > userRequests.resetTime) {
      userRequests = {
        count: 0,
        resetTime: now + windowMs,
      };
      requests.set(userId, userRequests);
    }

    userRequests.count++;

    // Check if limit exceeded
    if (userRequests.count > limit) {
      const retryAfter = Math.ceil((userRequests.resetTime - now) / 1000);

      res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds`,
        retryAfter,
      });
      return;
    }

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limit.toString());
    res.setHeader('X-RateLimit-Remaining', (limit - userRequests.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(userRequests.resetTime).toISOString());

    next();
  };
}

/**
 * Session validation middleware
 * Checks if the user's session is still valid
 */
export async function validateSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user || !req.user.sessionId) {
    next();
    return;
  }

  try {
    // Import database connection
    const { Pool } = await import('pg');
    const { config } = await import('../config');

    const pool = new Pool({
      connectionString: config.database.url,
    });

    // Check if session exists and is not expired
    const result = await pool.query(
      `SELECT * FROM user_sessions 
       WHERE id = $1 
       AND user_id = $2 
       AND expires_at > NOW()`,
      [req.user.sessionId, req.user.userId]
    );

    if (result.rows.length === 0) {
      await pool.end();
      res.status(401).json({
        error: 'Session expired',
        message: 'Your session has expired. Please log in again.',
      });
      return;
    }

    // Update last activity
    await pool.query(
      `UPDATE user_sessions 
       SET last_activity = NOW() 
       WHERE id = $1`,
      [req.user.sessionId]
    );

    await pool.end();
    next();
  } catch (error) {
    logger.error('Session validation error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to validate session',
    });
  }
}
