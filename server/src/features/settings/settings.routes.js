import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { telegramTestLimiter } from '../../shared/middleware/rateLimits.js';
import { updateSettingsSchema } from './settings.schemas.js';
import { buildSettingsController } from './settings.controller.js';

// Any logged-in user, and only ever their own settings. `guard`, `controller` and `limiter` can be replaced in tests.
export function buildSettingsRouter({
  guard = [requireAuth],
  controller = buildSettingsController(),
  limiter = telegramTestLimiter,
} = {}) {
  const router = Router();
  router.use(...guard);

  router.get('/', controller.get);
  router.patch('/', validate(updateSettingsSchema), controller.update);
  router.post('/telegram/test', limiter, controller.testTelegram);

  return router;
}

export default buildSettingsRouter();
