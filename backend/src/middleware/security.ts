import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// Helmet configuration for security headers
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: 'same-origin' },
  xssFilter: true,
});

// Rate limiting configuration
export const createRateLimiter = (
  windowMs: number = 15 * 60 * 1000, // 15 minutes
  max: number = 100 // limit each IP to 100 requests per windowMs
) => {
  return rateLimit({
    windowMs,
    max,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        status: 'error',
        message: 'Too many requests, please try again later.',
      });
    },
  });
};

// Specific rate limiters for different endpoints
// In development, use much higher limits to accommodate polling
const isDevelopment = process.env.NODE_ENV === 'development';
export const apiLimiter = createRateLimiter(
  15 * 60 * 1000,
  isDevelopment ? 10000 : 100 // 10000 requests in dev, 100 in production
);
export const authLimiter = createRateLimiter(15 * 60 * 1000, 5);
export const bulkOperationLimiter = createRateLimiter(60 * 60 * 1000, 10);
