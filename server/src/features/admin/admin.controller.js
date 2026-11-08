import { logger } from '../../shared/utils/logger.js';
import { runScan, listScanRuns } from '../scans/scan.service.js';
import { getDbSize } from './dbSize.service.js';

// Makes the service functions replaceable in tests.
export function buildAdminController({ run = runScan, list = listScanRuns, dbSize = getDbSize } = {}) {
  return {
    // 202 at once, the scan runs in the background. Watch it in GET /scan-runs.
    startScan(req, res) {
      run('manual').catch((err) => {
        logger.error({ errMessage: err.message }, 'Manual scan crashed');
      });
      res.status(202).json({ status: 'started' });
    },

    async scanRuns(req, res) {
      const runs = await list(req.validated.query.limit);
      res.json({ runs });
    },

    async dbSize(req, res) {
      res.json(await dbSize());
    },
  };
}
