import { body, param, query } from 'express-validator';

// Validation for starting a session
export const startSessionValidation = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Session name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Session name must be between 2 and 100 characters'),
  body('initial_garden_state')
    .optional()
    .trim()
    .isIn(['garden', 'plenary', 'worship'])
    .withMessage('Initial garden state must be one of: garden, plenary, worship')
];

// Validation for ending a session
export const endSessionValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid session ID format')
];

// Validation for session ID parameter
export const sessionIdValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid session ID format')
];

// Validation for session list query parameters
export const sessionListValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('start_date')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('end_date')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  query('status')
    .optional()
    .trim()
    .isIn(['active', 'completed'])
    .withMessage('Status must be either active or completed')
];