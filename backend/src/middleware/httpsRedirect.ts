import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Middleware to redirect HTTP requests to HTTPS
 */
export function httpsRedirect(req: Request, res: Response, next: NextFunction): void {
  // Skip in development unless explicitly enabled
  if (config.env === 'development' && process.env.FORCE_HTTPS !== 'true') {
    return next();
  }

  // Check if request is already secure
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    return next();
  }

  // Build HTTPS URL
  const httpsPort = process.env.HTTPS_PORT || '443';
  const host = req.headers.host?.split(':')[0] || 'localhost';

  let httpsUrl = `https://${host}`;

  // Add port if not default HTTPS port
  if (httpsPort !== '443') {
    httpsUrl += `:${httpsPort}`;
  }

  httpsUrl += req.url;

  // Redirect to HTTPS with 301 (permanent redirect)
  res.redirect(301, httpsUrl);
}

/**
 * Middleware to set security headers
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Strict Transport Security (HSTS)
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Content Security Policy
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' wss: https:",
    "font-src 'self'",
    "object-src 'none'",
    "media-src 'self'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ];

  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

  // Other security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy (formerly Feature Policy)
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');

  next();
}

/**
 * Certificate pinning middleware (for high-security environments)
 * WARNING: This can break your site if not configured correctly
 */
export function certificatePinning(pins: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (pins.length === 0) {
      return next();
    }

    // Only apply in production and over HTTPS
    if (
      config.env !== 'production' ||
      (!req.secure && req.headers['x-forwarded-proto'] !== 'https')
    ) {
      return next();
    }

    // Build Public-Key-Pins header
    const maxAge = 60 * 60 * 24 * 30; // 30 days
    const pinHeader = pins.map((pin) => `pin-sha256="${pin}"`).join('; ');

    res.setHeader('Public-Key-Pins', `${pinHeader}; max-age=${maxAge}; includeSubDomains`);

    next();
  };
}

/**
 * Expect-CT header for Certificate Transparency
 */
export function expectCT(req: Request, res: Response, next: NextFunction): void {
  // Only apply over HTTPS
  if (!req.secure && req.headers['x-forwarded-proto'] !== 'https') {
    return next();
  }

  res.setHeader('Expect-CT', 'max-age=86400, enforce');

  next();
}
