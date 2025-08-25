import { Router } from 'express';
import sessionController from '../controllers/sessionController';
import { handleValidationErrors } from '../middleware/validate';
import {
  startSessionValidation,
  endSessionValidation,
  sessionIdValidation,
  sessionListValidation
} from '../validators/sessionValidator';

const router = Router();

// Session management endpoints with validation
router.post('/start', 
  startSessionValidation, 
  handleValidationErrors, 
  sessionController.startSession
);
router.put('/:id/end', 
  endSessionValidation, 
  handleValidationErrors, 
  sessionController.endSession
);
router.get('/current', sessionController.getCurrentSession);
router.get('/', 
  sessionListValidation, 
  handleValidationErrors, 
  sessionController.getAllSessions
);
router.get('/:id', 
  sessionIdValidation, 
  handleValidationErrors, 
  sessionController.getSessionById
);

export default router;