import { prisma } from '../../shared/db/prisma.js';
import { logger } from '../../shared/utils/logger.js';
import { getCollectors } from '../collectors/index.js';
import { saveJobs } from '../jobs/jobs.service.js';
import { cleanup } from './cleanup.service.js';

// A scan that says RUNNING for longer than this is treated as dead (the server crashed or restarted).
export const LOCK_MINUTES = 30;

// Takes the lock and creates the ScanRun row in one transaction.
// The advisory lock makes two scans that start together wait for each other, so only one gets in.
async function startRun(trigger) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('scan'))`;
    const since = new Date(Date.now() - LOCK_MINUTES * 60 * 1000);

    const busy = await tx.scanRun.findFirst({ where: { status: 'RUNNING', startedAt: { gt: since } } });
    if (busy) {
      const run = await tx.scanRun.create({ data: { trigger, status: 'SKIPPED', finishedAt: new Date() } });
      return { run, skipped: true };
    }

    // old RUNNING rows are dead scans: close them so the history is honest
    await tx.scanRun.updateMany({
      where: { status: 'RUNNING', startedAt: { lte: since } },
      data: { status: 'FAILED', finishedAt: new Date() },
    });
    const run = await tx.scanRun.create({ data: { trigger, status: 'RUNNING' } });
    return { run, skipped: false };
  });
}

// Newest scans first, for the admin history.
export function listScanRuns(limit = 20) {
  return prisma.scanRun.findMany({ orderBy: { startedAt: 'desc' }, take: limit });
}

function finalStatus(failed, total) {
  if (failed === 0) return 'SUCCESS';
  return failed === total ? 'FAILED' : 'PARTIAL';
}

// Runs every enabled collector once and saves the jobs. trigger = "cron" | "manual" | "local".
// One broken source never stops the others. `collectors` and `save` can be replaced in tests.
export async function runScan(
  trigger,
  { collectors = getCollectors(), save = saveJobs, clean = cleanup } = {},
) {
  const { run, skipped } = await startRun(trigger);
  if (skipped) {
    logger.info({ runId: run.id, trigger }, 'Scan skipped: another scan is running');
    return { runId: run.id, status: 'SKIPPED', newJobs: 0, perSource: {} };
  }

  try {
    const perSource = {};
    let newJobs = 0;
    let failed = 0;

    for (const collector of collectors) {
      try {
        const jobs = await collector.collect({ keywords: [] });
        const result = await save(jobs);
        perSource[collector.name] = {
          found: jobs.length,
          inserted: result.inserted,
          duplicates: result.duplicates,
          invalid: result.invalid,
          skipped: result.skipped,
        };
        newJobs += result.inserted;
      } catch (err) {
        failed += 1;
        perSource[collector.name] = { error: err.message };
        logger.warn({ source: collector.name, errMessage: err.message }, 'Collector failed');
      }
    }

    const status = finalStatus(failed, collectors.length);
    await prisma.scanRun.update({
      where: { id: run.id },
      data: { status, finishedAt: new Date(), perSource, newJobs },
    });
    logger.info({ runId: run.id, trigger, status, newJobs }, 'Scan finished');

    // old data is removed after the scan; a cleanup problem must not turn a good scan into a failure
    try {
      await clean();
    } catch (err) {
      logger.error({ errMessage: err.message }, 'Cleanup failed');
    }
    return { runId: run.id, status, newJobs, perSource };
  } catch (err) {
    // never leave a RUNNING row behind: it would block the next scans for 30 minutes
    await prisma.scanRun
      .update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: new Date() } })
      .catch(() => {});
    throw err;
  }
}
