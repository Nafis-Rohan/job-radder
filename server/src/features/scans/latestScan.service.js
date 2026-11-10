import { prisma } from '../../shared/db/prisma.js';
import { LOCK_MINUTES } from './scan.service.js';

// Only what a normal user may see. The per-source details and errors stay admin only.
const SCAN_FIELDS = { status: true, startedAt: true, finishedAt: true, newJobs: true };

// Pure: the newest real scan (+ the time of the last good one) -> the answer.
// A RUNNING scan older than the lock time is dead (the server stopped), so it is shown as FAILED.
export function buildLatest(latest, lastGood, now = new Date()) {
  let scan = latest;
  if (scan && scan.status === 'RUNNING' && now.getTime() - scan.startedAt.getTime() > LOCK_MINUTES * 60 * 1000) {
    scan = { ...scan, status: 'FAILED' };
  }
  return { scan: scan ?? null, lastSuccessAt: lastGood?.finishedAt ?? null };
}

// The newest scan that really ran (a SKIPPED row means "another scan was already running": not a scan),
// and when the last scan that worked (SUCCESS or PARTIAL) finished.
export async function getLatestScan(now = new Date()) {
  const [latest, lastGood] = await prisma.$transaction([
    prisma.scanRun.findFirst({
      where: { status: { not: 'SKIPPED' } },
      orderBy: { startedAt: 'desc' },
      select: SCAN_FIELDS,
    }),
    prisma.scanRun.findFirst({
      where: { status: { in: ['SUCCESS', 'PARTIAL'] }, finishedAt: { not: null } },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true },
    }),
  ]);
  return buildLatest(latest, lastGood, now);
}
