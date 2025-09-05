import { Router } from 'express';
import delegateController from '../controllers/delegateController';
import { uploadCSV, handleUploadError } from '../middleware/upload';
import { bulkOperationLimiter } from '../middleware/security';
import { handleValidationErrors } from '../middleware/validate';
import {
  createDelegateValidation,
  updateDelegateValidation,
  delegateIdValidation,
  delegateListValidation
} from '../validators/delegateValidator';

const router = Router();

// Delegate CRUD endpoints with validation
router.get('/', 
  delegateListValidation, 
  handleValidationErrors, 
  delegateController.getAllDelegates
);
router.get('/export', delegateController.exportDelegates);
router.get('/:id', 
  delegateIdValidation, 
  handleValidationErrors, 
  delegateController.getDelegateById
);
router.post('/', 
  createDelegateValidation, 
  handleValidationErrors, 
  delegateController.createDelegate
);
router.post('/bulk', bulkOperationLimiter, (req, res, next) => {
  uploadCSV(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: handleUploadError(err) });
    }
    return next();
  });
}, delegateController.bulkImport);
router.put('/:id', 
  updateDelegateValidation, 
  handleValidationErrors, 
  delegateController.updateDelegate
);
router.delete('/:id', 
  delegateIdValidation, 
  handleValidationErrors, 
  delegateController.deleteDelegate
);

export default router;