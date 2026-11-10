import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/auth.js';
import { getLatestScan } from './latestScan.service.js';

// Any logged-in user. `guard` and `latest` can be replaced in tests.
export function buildScansRouter({ guard = [requireAuth], latest = getLatestScan } = {}) {
  const router = Router();
  router.use(...guard);

  router.get('/latest', async (req, res) => {
    res.json(await latest());
  });

  return router;
}

export default buildScansRouter();
