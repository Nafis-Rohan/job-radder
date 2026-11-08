import { Router } from 'express';
import { env } from '../../shared/config/env.js';
import { logger } from '../../shared/utils/logger.js';
import { requireCronSecret } from '../../shared/middleware/cronAuth.js';
import { cronLimiter } from '../../shared/middleware/rateLimits.js';
import { runScan } from './scan.service.js';

// Routes for the outside cron only. `secret` and `run` can be replaced in tests.
export function buildInternalRouter({ secret = env.CRON_SECRET, run = runScan } = {}) {
  const router = Router();

  // 202 at once, the scan runs in the background (the cron service gives up after ~30 s).
  // If a scan is already running, runScan saves a SKIPPED row and returns.
  router.post('/scan', cronLimiter, requireCronSecret(secret), (req, res) => {
    run('cron').catch((err) => {
      logger.error({ errMessage: err.message }, 'Cron scan crashed');
    });
    res.status(202).json({ status: 'started' });
  });

  return router;
}

export default buildInternalRouter();
