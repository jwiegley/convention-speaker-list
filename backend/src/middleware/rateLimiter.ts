import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Rate Limiting Middleware
 * Prevents abuse by limiting requests per time window
 */

interface RateLimitOptions {
  windowMs?: number;      // Time window in milliseconds
  maxRequests?: number;    // Maximum requests per window
  message?: string;        // Error message
  skipSuccessfulRequests?: boolean;  // Don't count successful requests
  skipFailedRequests?: boolean;      // Don't count failed requests
  keyGenerator?: (req: Request) => string;  // Custom key generator
  handler?: (req: Request, res: Response) => void;  // Custom handler
}

interface RequestRecord {
  count: number;
  resetTime: number;
}

/**
 * Create a rate limiter middleware with specified options
 */
export function createRateLimiter(options: RateLimitOptions = {}) {
  const {
    windowMs = 15 * 60 * 1000,  // 15 minutes default
    maxRequests = 100,           // 100 requests default
    message = 'Too many requests from this IP, please try again later.',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = (req) => req.ip || 'unknown',
    handler
  } = options;

  const requests = new Map<string, RequestRecord>();

  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of requests.entries()) {
      if (now > record.resetTime) {
        requests.delete(key);
      }
    }
  }, windowMs);

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();

    // Get or create request record
    let record = requests.get(key);
    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs
      };
      requests.set(key, record);
    }

    // Increment counter
    record.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count).toString());
    res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

    // Check if limit exceeded
    if (record.count > maxRequests) {
      res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000).toString());
      
      logger.warn(`Rate limit exceeded for ${key}: ${record.count}/${maxRequests}`);
      
      if (handler) {
        handler(req, res);
      } else {
        res.status(429).json({
          error: 'Too Many Requests',
          message,
          retryAfter: Math.ceil((record.resetTime - now) / 1000)
        });
      }
      return;
    }

    // Handle skip logic after response
    if (skipSuccessfulRequests || skipFailedRequests) {
      const originalSend = res.send;
      res.send = function(data: any) {
        if ((skipSuccessfulRequests && res.statusCode < 400) ||
            (skipFailedRequests && res.statusCode >= 400)) {
          record!.count--;
        }
        return originalSend.call(this, data);
      };
    }

    next();
  };
}

/**
 * API endpoint rate limiter
 * Stricter limits for API endpoints
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  maxRequests: 100,           // 100 requests per window
  message: 'Too many API requests, please try again later.'
});

/**
 * Authentication rate limiter
 * Very strict limits for auth endpoints
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  maxRequests: 5,             // Only 5 attempts per window
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true  // Don't count successful logins
});

/**
 * WebSocket rate limiter
 * For socket.io connections
 */
export const socketRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,       // 1 minute
  maxRequests: 20,            // 20 connections per minute
  message: 'Too many WebSocket connections, please try again later.'
});

/**
 * Global rate limiter
 * Applied to all routes
 */
export const globalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  maxRequests: 1000,          // 1000 requests per window
  message: 'Too many requests, please slow down.'
});

/**
 * Dynamic rate limiter based on user role
 * Different limits for different user types
 */
export function roleBasedRateLimiter(
  adminLimit: number = 1000,
  spectatorLimit: number = 500,
  guestLimit: number = 100
) {
  return createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: guestLimit,  // Default to guest limit
    keyGenerator: (req: any) => {
      // Use user ID if authenticated, otherwise IP
      if (req.user) {
        return `user:${req.user.userId}`;
      }
      return `ip:${req.ip || 'unknown'}`;
    },
    handler: (req: any, res: Response) => {
      // Determine the actual limit based on role
      let limit = guestLimit;
      if (req.user) {
        if (req.user.role === 'admin') {
          limit = adminLimit;
        } else if (req.user.role === 'spectator') {
          limit = spectatorLimit;
        }
      }

      const retryAfter = res.getHeader('Retry-After');
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Your limit is ${limit} requests per 15 minutes.`,
        retryAfter
      });
    }
  });
}

/**
 * IP-based rate limiter with whitelist/blacklist
 */
export class IPRateLimiter {
  private whitelist: Set<string> = new Set();
  private blacklist: Set<string> = new Set();
  private limiter: any;

  constructor(options: RateLimitOptions = {}) {
    this.limiter = createRateLimiter(options);
  }

  addToWhitelist(ip: string): void {
    this.whitelist.add(ip);
    this.blacklist.delete(ip);
  }

  addToBlacklist(ip: string): void {
    this.blacklist.add(ip);
    this.whitelist.delete(ip);
  }

  removeFromWhitelist(ip: string): void {
    this.whitelist.delete(ip);
  }

  removeFromBlacklist(ip: string): void {
    this.blacklist.delete(ip);
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = req.ip || 'unknown';

      // Check blacklist
      if (this.blacklist.has(ip)) {
        logger.warn(`Blocked request from blacklisted IP: ${ip}`);
        res.status(403).json({
          error: 'Forbidden',
          message: 'Your IP address has been blocked.'
        });
        return;
      }

      // Skip rate limiting for whitelisted IPs
      if (this.whitelist.has(ip)) {
        next();
        return;
      }

      // Apply rate limiting
      this.limiter(req, res, next);
    };
  }
}

/**
 * Distributed rate limiter using Redis
 * For use in clustered/multi-instance deployments
 */
export function createRedisRateLimiter(redisClient: any, options: RateLimitOptions = {}) {
  const {
    windowMs = 15 * 60 * 1000,
    maxRequests = 100,
    message = 'Too many requests, please try again later.',
    keyGenerator = (req) => req.ip || 'unknown'
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `rate_limit:${keyGenerator(req)}`;
    const now = Date.now();
    const window = Math.floor(now / windowMs);
    const redisKey = `${key}:${window}`;

    try {
      // Increment counter in Redis
      const count = await redisClient.incr(redisKey);
      
      // Set expiry on first request
      if (count === 1) {
        await redisClient.expire(redisKey, Math.ceil(windowMs / 1000));
      }

      // Set headers
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - count).toString());
      res.setHeader('X-RateLimit-Reset', new Date((window + 1) * windowMs).toISOString());

      // Check limit
      if (count > maxRequests) {
        const retryAfter = Math.ceil(((window + 1) * windowMs - now) / 1000);
        res.setHeader('Retry-After', retryAfter.toString());
        
        res.status(429).json({
          error: 'Too Many Requests',
          message,
          retryAfter
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Redis rate limiter error:', error);
      // Fail open - allow request if Redis is down
      next();
    }
  };
}

export default {
  createRateLimiter,
  apiRateLimiter,
  authRateLimiter,
  socketRateLimiter,
  globalRateLimiter,
  roleBasedRateLimiter,
  IPRateLimiter,
  createRedisRateLimiter
};