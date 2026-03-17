import { body, param, query } from 'express-validator';

// Validation for adding to queue
export const addToQueueValidation = [
  body('delegate_number')
    .isInt({ min: 1 })
    .withMessage('Delegate number must be a positive integer'),
  body('session_id').optional().isUUID().withMessage('Session ID must be a valid UUID'),
  body('priority_override')
    .optional()
    .isBoolean()
    .withMessage('Priority override must be a boolean'),
];

// Validation for advancing queue
export const advanceQueueValidation = [
  body('session_id').optional().isUUID().withMessage('Session ID must be a valid UUID'),
];

// Validation for removing from queue
export const removeFromQueueValidation = [
  param('id').isUUID().withMessage('Invalid queue item ID format'),
];

// Validation for reordering queue
export const reorderQueueValidation = [
  body('queue_items').isArray({ min: 1 }).withMessage('Queue items must be a non-empty array'),
  body('queue_items.*.id').isUUID().withMessage('Each queue item must have a valid UUID'),
  body('queue_items.*.position')
    .isInt({ min: 1 })
    .withMessage('Each queue item position must be a positive integer'),
];

// Validation for queue query parameters
export const queueListValidation = [
  query('session_id').optional().isUUID().withMessage('Session ID must be a valid UUID'),
];
