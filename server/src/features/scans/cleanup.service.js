import { prisma } from '../../shared/db/prisma.js';
import { logger } from '../../shared/utils/logger.js';

// Keeps the free-tier database small. Runs after every scan.
export const RETENTION = { jobDays: 60, loginEventDays: 90, keepScanRuns: 100 };

const DAY_MS = 24 * 60 * 60 * 1000;
export const daysAgo = (days, now = new Date()) => new Date(now.getTime() - days * DAY_MS);

// runs = scan runs, newest first. Keeps the newest `keep`, returns the ids of the older ones.
// A RUNNING row is never deleted: it is the lock of a scan that is still working.
export function scanRunsToDelete(runs, keep) {
  return runs.slice(keep).filter((run) => run.status !== 'RUNNING').map((run) => run.id);
}

// Returns how many rows were deleted from each table.
export async function cleanup({ now = new Date(), retention = RETENTION } = {}) {
  // Phase 9 (favorites): jobs of a favorite company must be kept. Add that rule here.
  const jobs = await prisma.job.deleteMany({ where: { foundAt: { lt: daysAgo(retention.jobDays, now) } } });

  const loginEvents = await prisma.loginEvent.deleteMany({
    where: { createdAt: { lt: daysAgo(retention.loginEventDays, now) } },
  });

  // the table stays around 100 rows, so reading id + status of all of them is cheap
  const runs = await prisma.scanRun.findMany({
    orderBy: { startedAt: 'desc' },
    select: { id: true, status: true },
  });
  const ids = scanRunsToDelete(runs, retention.keepScanRuns);
  const scanRuns = ids.length ? await prisma.scanRun.deleteMany({ where: { id: { in: ids } } }) : { count: 0 };

  const deleted = { jobs: jobs.count, loginEvents: loginEvents.count, scanRuns: scanRuns.count };
  logger.info(deleted, 'Cleanup finished');
  return deleted;
}
