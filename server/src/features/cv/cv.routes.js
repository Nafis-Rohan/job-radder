import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { updateCvSchema } from './cv.schemas.js';
import { cvUploadLimiter } from '../../shared/middleware/rateLimits.js';
import { uploadCvFile } from './cv.upload.js';
import * as cvController from './cv.controller.js';

const router = Router();

router.use(requireAuth);

router.post('/', cvUploadLimiter, uploadCvFile, cvController.upload);
router.get('/', cvController.list);
router.patch('/:id', validate(updateCvSchema), cvController.update);
router.delete('/:id', cvController.remove);

export default router;
