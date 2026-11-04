import { Router } from 'express';
import { validate } from '../../shared/middleware/validate.js';
import { requireAuth } from '../../shared/middleware/auth.js';
import { loginLimiter, twoFactorLimiter } from '../../shared/middleware/rateLimits.js';
import { loginSchema, loginTwoFactorSchema, twoFactorCodeSchema } from './auth.schemas.js';
import * as authController from './auth.controller.js';

const router = Router();

router.post('/login', loginLimiter, validate(loginSchema), authController.login);
router.post(
  '/login/2fa',
  twoFactorLimiter,
  validate(loginTwoFactorSchema),
  authController.loginTwoFactor,
);
router.get('/me', requireAuth, authController.me);
router.post('/logout', authController.logout);

router.post('/2fa/setup', requireAuth, authController.setupTwoFactor);
router.post(
  '/2fa/enable',
  requireAuth,
  twoFactorLimiter,
  validate(twoFactorCodeSchema),
  authController.enableTwoFactor,
);

export default router;
