import { prisma } from '../../shared/db/prisma.js';
import { logger } from '../../shared/utils/logger.js';
import { scoreMatch } from './score.js';

// A Match row is saved only for jobs that are worth showing (keeps the free database small).
export const MIN_TOTAL = 40;
// A job that asks for more than this many years beyond the CV gets no Match row.
export const MAX_YEARS_GAP = 2;

const PAGE_SIZE = 500;

const CV_FIELDS = { id: true, skills: true, yearsExp: true, level: true, domains: true };
const JOB_FIELDS = { id: true, skills: true, minYears: true, level: true, domains: true };

// Too senior for this CV? (the job does not say = not too senior)
export function needsTooMuchExperience(cv, job) {
  return job.minYears !== null && job.minYears !== undefined && job.minYears - cv.yearsExp > MAX_YEARS_GAP;
}

// Pure: jobs in, Match rows out (only the worthwhile ones). No database here.
export function buildMatchRows(cv, jobs) {
  const rows = [];
  for (const job of jobs) {
    if (needsTooMuchExperience(cv, job)) continue;
    const score = scoreMatch(cv, job);
    if (score.total < MIN_TOTAL) continue;
    rows.push({ cvId: cv.id, jobId: job.id, ...score });
  }
  return rows;
}

// Saves Match rows and returns how many were new. skipDuplicates + the unique (cvId, jobId) pair make
// repeating it safe. A job or CV can be deleted while we score (old-jobs cleanup, a deleted CV): then
// the whole batch fails with a foreign-key error (P2003), so it is retried row by row and the rows
// whose job or CV is gone are skipped.
export async function saveMatchRows(rows) {
  if (rows.length === 0) return 0;
  try {
    const { count } = await prisma.match.createMany({ data: rows, skipDuplicates: true });
    return count;
  } catch (err) {
    if (err.code !== 'P2003') throw err;
  }

  let saved = 0;
  for (const row of rows) {
    try {
      const { count } = await prisma.match.createMany({ data: [row], skipDuplicates: true });
      saved += count;
    } catch (err) {
      if (err.code !== 'P2003') throw err; // this row's job or CV is gone: skip it
    }
  }
  return saved;
}

// Scores the jobs matching `where` against one CV, page by page, and saves the worthwhile ones.
// skipDuplicates + the unique (cvId, jobId) pair make this safe to repeat.
async function matchCv(cv, where) {
  let cursor;
  let scored = 0;
  let saved = 0;

  for (;;) {
    const jobs = await prisma.job.findMany({
      where,
      select: JOB_FIELDS,
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (jobs.length === 0) break;

    saved += await saveMatchRows(buildMatchRows(cv, jobs));
    scored += jobs.length;
    cursor = jobs[jobs.length - 1].id;
    if (jobs.length < PAGE_SIZE) break;
  }
  return { scored, saved };
}

// Same paging as matchCv, but only builds the rows (nothing is saved here).
async function buildAllRowsForCv(cv) {
  const rows = [];
  let scored = 0;
  let cursor;
  for (;;) {
    const jobs = await prisma.job.findMany({
      select: JOB_FIELDS,
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (jobs.length === 0) break;
    rows.push(...buildMatchRows(cv, jobs));
    scored += jobs.length;
    cursor = jobs[jobs.length - 1].id;
    if (jobs.length < PAGE_SIZE) break;
  }
  return { rows, scored };
}

// The CV changed (new upload, or skills / years / level / domains edited): score ALL jobs again.
// Old matches that are no longer worthwhile are removed. Matches already sent as an alert
// (notified = true) are kept and only get their new scores, so no alert is ever sent twice.
export async function rescoreCv(cvId) {
  const cv = await prisma.cv.findUnique({ where: { id: cvId }, select: { ...CV_FIELDS, isActive: true } });
  if (!cv || !cv.isActive) return { scored: 0, saved: 0 };

  const { rows, scored } = await buildAllRowsForCv(cv);
  const alerted = await prisma.match.findMany({ where: { cvId, notified: true }, select: { jobId: true } });
  const alertedIds = new Set(alerted.map((m) => m.jobId));
  const fresh = rows.filter((r) => !alertedIds.has(r.jobId));

  await prisma.match.deleteMany({ where: { cvId, notified: false } });
  const saved = await saveMatchRows(fresh);
  for (const row of rows.filter((r) => alertedIds.has(r.jobId))) {
    const { cvId: _c, jobId, ...scores } = row;
    await prisma.match.updateMany({ where: { cvId, jobId }, data: scores });
  }

  logger.info({ scored, saved }, 'CV rescored');
  return { scored, saved };
}

// Called from the CV routes. The answer to the user does not wait for it; a failure is only logged.
export function rescoreCvInBackground(cvId) {
  rescoreCv(cvId).catch((err) => logger.error({ err }, 'CV rescoring failed'));
}

// After a scan: score the jobs found since `since` against every active CV.
// (The caller passes a time a little before the scan started, so a small clock difference cannot miss a job.)
export async function scoreNewJobs({ since }) {
  const cvs = await prisma.cv.findMany({ where: { isActive: true }, select: CV_FIELDS });
  let scored = 0;
  let saved = 0;
  for (const cv of cvs) {
    const result = await matchCv(cv, { foundAt: { gte: since } });
    scored += result.scored;
    saved += result.saved;
  }
  logger.info({ cvs: cvs.length, scored, saved }, 'New jobs scored');
  return { cvs: cvs.length, scored, saved };
}
