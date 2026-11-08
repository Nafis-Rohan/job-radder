import { Router } from 'express';
import { env } from '../../shared/config/env.js';
import { logger } from '../../shared/utils/logger.js';
import { requireCronSecret } from '../../shared/middleware/cronAuth.js';
import { cronLimiter, cronCallLimiter } from '../../shared/middleware/rateLimits.js';
import { startScan } from './scan.service.js';

// Routes for the outside cron only. `secret`, `start` and `callLimit` can be replaced in tests.
export function buildInternalRouter({ secret = env.CRON_SECRET, start = startScan, callLimit = 20 } = {}) {
  const router = Router();

  // 202 at once, the scan runs in the background (the cron service gives up after ~30 s).
  // status is "started", or "skipped" when another scan is already running.
  // The call limiter comes after the secret check, so wrong guesses cannot use up the real cron's calls.
  router.post(
    '/scan',
    cronLimiter,
    requireCronSecret(secret),
    cronCallLimiter(callLimit),
    async (req, res) => {
      const { runId, status, done } = await start('cron');
      done.catch((err) => {
        logger.error({ errMessage: err.message }, 'Cron scan crashed');
      });
      res.status(202).json({ status, runId });
    },
  );

  return router;
}

export default buildInternalRouter();
