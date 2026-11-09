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
