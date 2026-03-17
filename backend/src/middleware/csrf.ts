import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import logger from '../utils/logger';

/**
 * CSRF Protection Middleware
 * Implements Double Submit Cookie pattern for CSRF protection
 */

interface CSRFOptions {
  cookieName?: string;
  headerName?: string;
  cookieOptions?: any;
  excludePaths?: string[];
  sameSite?: 'strict' | 'lax' | 'none';
}

/**
 * Generate a CSRF token
 */
export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create CSRF protection middleware
 */
export function createCSRFProtection(options: CSRFOptions = {}) {
  const {
    cookieName = 'csrf-token',
    headerName = 'x-csrf-token',
    excludePaths = ['/api/v1/auth/login', '/api/v1/auth/refresh'],
    sameSite = 'strict',
    cookieOptions = {},
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip CSRF check for excluded paths
    if (excludePaths.some((path) => req.path.startsWith(path))) {
      next();
      return;
    }

    // Skip CSRF check for GET, HEAD, OPTIONS requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      // Generate and set token for GET requests
      if (!req.cookies[cookieName]) {
        const token = generateCSRFToken();
        res.cookie(cookieName, token, {
          httpOnly: false, // Must be readable by JavaScript
          secure: process.env.NODE_ENV === 'production',
          sameSite,
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          ...cookieOptions,
        });
      }
      next();
      return;
    }

    // For state-changing requests, verify CSRF token
    const cookieToken = req.cookies[cookieName];
    const headerToken = req.headers[headerName] as string;

    if (!cookieToken || !headerToken) {
      logger.warn(`CSRF token missing: cookie=${!!cookieToken}, header=${!!headerToken}`);
      res.status(403).json({
        error: 'Forbidden',
        message: 'CSRF token missing',
      });
      return;
    }

    if (cookieToken !== headerToken) {
      logger.warn('CSRF token mismatch');
      res.status(403).json({
        error: 'Forbidden',
        message: 'CSRF token invalid',
      });
      return;
    }

    // Rotate token after successful validation
    const newToken = generateCSRFToken();
    res.cookie(cookieName, newToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite,
      maxAge: 24 * 60 * 60 * 1000,
      ...cookieOptions,
    });

    // Add new token to response headers for client to use
    res.setHeader('X-CSRF-Token', newToken);

    next();
  };
}

/**
 * Security headers middleware
 * Adds various security headers to responses
 */
export function securityHeaders(options: any = {}) {
  const {
    contentSecurityPolicy = true,
    xContentTypeOptions = true,
    xFrameOptions = true,
    xXssProtection = true,
    strictTransportSecurity = true,
    referrerPolicy = true,
    permissionsPolicy = true,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Content-Security-Policy
    if (contentSecurityPolicy) {
      const cspDirectives = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Adjust as needed
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ];
      res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
    }

    // X-Content-Type-Options
    if (xContentTypeOptions) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    // X-Frame-Options
    if (xFrameOptions) {
      res.setHeader('X-Frame-Options', 'DENY');
    }

    // X-XSS-Protection
    if (xXssProtection) {
      res.setHeader('X-XSS-Protection', '1; mode=block');
    }

    // Strict-Transport-Security (HSTS)
    if (strictTransportSecurity && req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Referrer-Policy
    if (referrerPolicy) {
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    }

    // Permissions-Policy (formerly Feature-Policy)
    if (permissionsPolicy) {
      const permissions = [
        'accelerometer=()',
        'camera=()',
        'geolocation=()',
        'gyroscope=()',
        'magnetometer=()',
        'microphone=()',
        'payment=()',
        'usb=()',
      ];
      res.setHeader('Permissions-Policy', permissions.join(', '));
    }

    next();
  };
}

/**
 * Clickjacking protection middleware
 */
export function clickjackingProtection() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    next();
  };
}

/**
 * MIME sniffing protection
 */
export function mimeSniffingProtection() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  };
}

/**
 * XSS protection middleware
 */
export function xssProtection() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Basic XSS sanitization for common injection points
    ['body', 'query', 'params'].forEach((key) => {
      if (req[key as keyof Request]) {
        sanitizeObject(req[key as keyof Request] as any);
      }
    });

    next();
  };
}

/**
 * Sanitize object to prevent XSS
 */
function sanitizeObject(obj: any): void {
  if (typeof obj !== 'object' || obj === null) return;

  for (const key in obj) {
    if (typeof obj[key] === 'string') {
      // Remove script tags and event handlers
      obj[key] = obj[key]
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
        .replace(/on\w+\s*=\s*'[^']*'/gi, '')
        .replace(/javascript:/gi, '');
    } else if (typeof obj[key] === 'object') {
      sanitizeObject(obj[key]);
    }
  }
}

/**
 * Combined security middleware
 * Applies all security protections
 */
export function applySecurity(options: any = {}) {
  return [securityHeaders(options.headers), createCSRFProtection(options.csrf), xssProtection()];
}

/**
 * Nonce generator for inline scripts (CSP)
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Middleware to add nonce to res.locals for CSP
 */
export function nonceMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.locals.nonce = generateNonce();

    // Update CSP header with nonce
    const existingCSP = res.getHeader('Content-Security-Policy') as string;
    if (existingCSP) {
      const updatedCSP = existingCSP.replace(
        "script-src 'self'",
        `script-src 'self' 'nonce-${res.locals.nonce}'`
      );
      res.setHeader('Content-Security-Policy', updatedCSP);
    }

    next();
  };
}

export default {
  generateCSRFToken,
  createCSRFProtection,
  securityHeaders,
  clickjackingProtection,
  mimeSniffingProtection,
  xssProtection,
  applySecurity,
  generateNonce,
  nonceMiddleware,
};
