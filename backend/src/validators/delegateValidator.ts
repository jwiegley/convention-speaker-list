import { body, param, query } from 'express-validator';

// Enum values for validation
const GENDER_VALUES = ['male', 'female', 'other'];
const AGE_BRACKET_VALUES = ['18-25', '26-35', '36-45', '46-55', '56-65', '65+'];
const RACE_CATEGORY_VALUES = ['white', 'black', 'asian', 'hispanic', 'mixed', 'other'];

// Validation rules for creating a delegate
export const createDelegateValidation = [
  body('number')
    .isInt({ min: 1 })
    .withMessage('Delegate number must be a positive integer'),
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('location')
    .trim()
    .notEmpty()
    .withMessage('Location is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Location must be between 2 and 100 characters'),
  body('gender')
    .trim()
    .toLowerCase()
    .isIn(GENDER_VALUES)
    .withMessage(`Gender must be one of: ${GENDER_VALUES.join(', ')}`),
  body('age_bracket')
    .trim()
    .isIn(AGE_BRACKET_VALUES)
    .withMessage(`Age bracket must be one of: ${AGE_BRACKET_VALUES.join(', ')}`),
  body('race_category')
    .trim()
    .toLowerCase()
    .isIn(RACE_CATEGORY_VALUES)
    .withMessage(`Race category must be one of: ${RACE_CATEGORY_VALUES.join(', ')}`),
  body('position_in_queue')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Position in queue must be a non-negative integer'),
  body('has_spoken_count')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Has spoken count must be a non-negative integer')
];

// Validation rules for updating a delegate
export const updateDelegateValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid delegate ID format'),
  body('number')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Delegate number must be a positive integer'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('location')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Location must be between 2 and 100 characters'),
  body('gender')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(GENDER_VALUES)
    .withMessage(`Gender must be one of: ${GENDER_VALUES.join(', ')}`),
  body('age_bracket')
    .optional()
    .trim()
    .isIn(AGE_BRACKET_VALUES)
    .withMessage(`Age bracket must be one of: ${AGE_BRACKET_VALUES.join(', ')}`),
  body('race_category')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(RACE_CATEGORY_VALUES)
    .withMessage(`Race category must be one of: ${RACE_CATEGORY_VALUES.join(', ')}`),
  body('position_in_queue')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Position in queue must be a non-negative integer'),
  body('has_spoken_count')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Has spoken count must be a non-negative integer')
];

// Validation for delegate ID parameter
export const delegateIdValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid delegate ID format')
];

// Validation for delegate list query parameters
export const delegateListValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('gender')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(GENDER_VALUES)
    .withMessage(`Gender filter must be one of: ${GENDER_VALUES.join(', ')}`),
  query('age_bracket')
    .optional()
    .trim()
    .isIn(AGE_BRACKET_VALUES)
    .withMessage(`Age bracket filter must be one of: ${AGE_BRACKET_VALUES.join(', ')}`),
  query('race_category')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(RACE_CATEGORY_VALUES)
    .withMessage(`Race category filter must be one of: ${RACE_CATEGORY_VALUES.join(', ')}`)
];