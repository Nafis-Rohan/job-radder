import { logger } from '../../shared/utils/logger.js';
import { startScan, listScanRuns } from '../scans/scan.service.js';
import { getDbSize } from './dbSize.service.js';

// Makes the service functions replaceable in tests.
export function buildAdminController({ start = startScan, list = listScanRuns, dbSize = getDbSize } = {}) {
  return {
    // 202 at once, the scan runs in the background.
    // status is "started", or "skipped" when another scan is running. runId finds the row in GET /scan-runs.
    async startScan(req, res) {
      const { runId, status, done } = await start('manual');
      done.catch((err) => {
        logger.error({ errMessage: err.message }, 'Manual scan crashed');
      });
      res.status(202).json({ status, runId });
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
