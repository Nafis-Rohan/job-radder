import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/auth.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { validate } from '../../shared/middleware/validate.js';
import { adminScanLimiter } from '../../shared/middleware/rateLimits.js';
import { scanRunsQuerySchema } from './admin.schemas.js';
import { buildAdminController } from './admin.controller.js';

// Everything here is admin only. `guard` and `controller` can be replaced in tests.
export function buildAdminRouter({
  guard = [requireAuth, requireRole('ADMIN')],
  controller = buildAdminController(),
} = {}) {
  const router = Router();
  router.use(...guard);

  router.post('/scan', adminScanLimiter, controller.startScan);
  router.get('/scan-runs', validate(scanRunsQuerySchema, 'query'), controller.scanRuns);

  return router;
}

export default buildAdminRouter();
