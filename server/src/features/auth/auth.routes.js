import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireAuth } from '../../shared/middleware/auth.js';
import { loginSchema } from './auth.schemas.js';
import * as authController from './auth.controller.js';

const router = Router();

router.post('/login', validate(loginSchema), authController.login);
router.get('/me', requireAuth, authController.me);
router.post('/logout', authController.logout);

export default router;
