import { prisma } from '../../shared/db/prisma.js';
import { logger } from '../../shared/utils/logger.js';
import { getCollectors } from '../collectors/index.js';
import { saveJobs } from '../jobs/jobs.service.js';
import { scoreNewJobs } from '../matching/match.service.js';
import { cleanup } from './cleanup.service.js';

// A scan that says RUNNING for longer than this is treated as dead (the server crashed or restarted).
export const LOCK_MINUTES = 30;
// A live scan stops starting new sources after this long, so it always ends before its lock runs out.
export const MAX_SCAN_MINUTES = LOCK_MINUTES - 5;

// Takes the lock and creates the ScanRun row in one transaction.
// The advisory lock makes two scans that start together wait for each other, so only one gets in.
async function startRun(trigger) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('scan'))`;
    const now = new Date();
    const since = new Date(now.getTime() - LOCK_MINUTES * 60 * 1000);

    const busy = await tx.scanRun.findFirst({ where: { status: 'RUNNING', startedAt: { gt: since } } });
    if (busy) {
      const run = await tx.scanRun.create({
        data: { trigger, status: 'SKIPPED', startedAt: now, finishedAt: now },
      });
      return { run, skipped: true };
    }

    // old RUNNING rows are dead scans: close them so the history is honest
    await tx.scanRun.updateMany({
      where: { status: 'RUNNING', startedAt: { lte: since } },
      data: { status: 'FAILED', finishedAt: now },
    });
    const run = await tx.scanRun.create({ data: { trigger, status: 'RUNNING', startedAt: now } });
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

// The work of a scan whose lock is already taken (`run` is its RUNNING row).
async function executeScan(run, trigger, { collectors, save, clean, match, maxMinutes }) {
  try {
    const perSource = {};
    let newJobs = 0;
    let failed = 0;
    const deadline = Date.now() + maxMinutes * 60 * 1000;

    for (const collector of collectors) {
      if (Date.now() > deadline) {
        failed += 1;
        perSource[collector.name] = { error: 'Not started: the scan took too long' };
        logger.warn({ source: collector.name }, 'Scan deadline reached, source skipped');
        continue;
      }
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

    // new jobs are scored against every active CV. The job list stays correct even if this fails
    // (it is repeated after the next scan), so a problem here must not turn a good scan into a failure.
    if (newJobs > 0) {
      try {
        await match({ since: new Date(run.startedAt.getTime() - 5 * 60 * 1000) });
      } catch (err) {
        logger.error({ errMessage: err.message }, 'Scoring new jobs failed');
      }
    }

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

const defaults = () => ({
  collectors: getCollectors(),
  save: saveJobs,
  clean: cleanup,
  match: scoreNewJobs,
  maxMinutes: MAX_SCAN_MINUTES,
});

// Takes the lock at once, then runs the scan in the background.
// Returns { runId, status: 'started' | 'skipped', done } right away; `done` finishes with the scan.
// Used by the endpoints, so the caller knows whether a scan really started.
export async function startScan(trigger, options = {}) {
  const { run, skipped } = await startRun(trigger);
  if (skipped) {
    logger.info({ runId: run.id, trigger }, 'Scan skipped: another scan is running');
    return { runId: run.id, status: 'skipped', done: Promise.resolve() };
  }
  const done = executeScan(run, trigger, { ...defaults(), ...options });
  return { runId: run.id, status: 'started', done };
}

// Runs every enabled collector once and saves the jobs, and waits for the end.
// trigger = "cron" | "manual" | "local". One broken source never stops the others.
// `collectors`, `save`, `clean` and `maxMinutes` can be replaced in tests.
export async function runScan(trigger, options = {}) {
  const started = await startScan(trigger, options);
  if (started.status === 'skipped') {
    return { runId: started.runId, status: 'SKIPPED', newJobs: 0, perSource: {} };
  }
  return started.done;
}
