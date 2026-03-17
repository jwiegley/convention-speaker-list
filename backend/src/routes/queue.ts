import { Router } from 'express';
import queueController from '../controllers/queueController';
import { handleValidationErrors } from '../middleware/validate';
import {
  addToQueueValidation,
  advanceQueueValidation,
  removeFromQueueValidation,
  reorderQueueValidation,
  queueListValidation,
} from '../validators/queueValidator';

const router = Router();

// Queue management endpoints with validation
router.get('/', queueListValidation, handleValidationErrors, queueController.getQueue);
router.post('/add', addToQueueValidation, handleValidationErrors, queueController.addToQueue);
router.put(
  '/advance',
  advanceQueueValidation,
  handleValidationErrors,
  queueController.advanceQueue
);
router.delete(
  '/:id',
  removeFromQueueValidation,
  handleValidationErrors,
  queueController.removeFromQueue
);
router.put(
  '/reorder',
  reorderQueueValidation,
  handleValidationErrors,
  queueController.reorderQueue
);

export default router;
