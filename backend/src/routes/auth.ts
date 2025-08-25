import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import {
  login,
  logout,
  refreshToken,
  changePassword,
  getCurrentUser,
  listActiveSessions,
  revokeSession
} from '../controllers/authController';
import { authenticate, requireAdmin, validateSession, authRateLimit } from '../middleware/auth';

const router = Router();

// Validation middleware
const handleValidationErrors = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Public routes (no authentication required)

/**
 * POST /api/v1/auth/login
 * Login endpoint (generic - being deprecated in favor of role-specific endpoints)
 */
router.post(
  '/login',
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
    handleValidationErrors
  ],
  authRateLimit(100, 10), // Stricter rate limit for login
  login
);

/**
 * POST /api/v1/auth/admin/login
 * Admin-specific login endpoint
 */
router.post(
  '/admin/login',
  [
    body('password').notEmpty().withMessage('Password is required'),
    handleValidationErrors
  ],
  authRateLimit(100, 5), // Very strict rate limit for admin login
  (req: any, res: any) => {
    req.body.username = 'admin';
    req.body.role = 'admin';
    return login(req, res);
  }
);

/**
 * POST /api/v1/auth/spectator/login
 * Spectator-specific login endpoint
 */
router.post(
  '/spectator/login',
  [
    body('password').notEmpty().withMessage('Password is required'),
    handleValidationErrors
  ],
  authRateLimit(100, 10), // Moderate rate limit for spectator login
  (req: any, res: any) => {
    req.body.username = 'spectator';
    req.body.role = 'spectator';
    return login(req, res);
  }
);

/**
 * POST /api/v1/auth/refresh
 * Refresh token endpoint
 */
router.post(
  '/refresh',
  [
    body('refreshToken').notEmpty().withMessage('Refresh token is required'),
    handleValidationErrors
  ],
  authRateLimit(100, 20),
  refreshToken
);

// Protected routes (authentication required)

/**
 * POST /api/v1/auth/logout
 * Logout endpoint
 */
router.post(
  '/logout',
  authenticate,
  validateSession,
  logout
);

/**
 * GET /api/v1/auth/me
 * Get current user information
 */
router.get(
  '/me',
  authenticate,
  validateSession,
  getCurrentUser
);

/**
 * PUT /api/v1/auth/password
 * Change password endpoint
 */
router.put(
  '/password',
  authenticate,
  validateSession,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters long')
      .matches(/[a-z]/)
      .withMessage('Password must contain at least one lowercase letter')
      .matches(/[A-Z]/)
      .withMessage('Password must contain at least one uppercase letter')
      .matches(/[0-9]/)
      .withMessage('Password must contain at least one number')
      .matches(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/)
      .withMessage('Password must contain at least one special character'),
    handleValidationErrors
  ],
  changePassword
);

// Admin-only routes

/**
 * GET /api/v1/auth/sessions
 * List all active sessions (admin only)
 */
router.get(
  '/sessions',
  authenticate,
  validateSession,
  requireAdmin,
  listActiveSessions
);

/**
 * DELETE /api/v1/auth/sessions/:sessionId
 * Revoke a specific session (admin only)
 */
router.delete(
  '/sessions/:sessionId',
  authenticate,
  validateSession,
  requireAdmin,
  revokeSession
);

export default router;