import { prisma } from '../../shared/db/prisma.js';
import { logger } from '../../shared/utils/logger.js';
import { scoreMatch } from './score.js';
import { buildCompanyMatcher } from '../companies/companyMatcher.js';
import { listFavorites } from '../companies/companies.service.js';

// A Match row is saved only for jobs that are worth showing (keeps the free database small).
export const MIN_TOTAL = 40;
// A job that asks for more than this many years beyond the CV gets no Match row.
export const MAX_YEARS_GAP = 2;

const PAGE_SIZE = 500;

const CV_FIELDS = { id: true, userId: true, skills: true, yearsExp: true, level: true, domains: true };
const JOB_FIELDS = { id: true, company: true, skills: true, minYears: true, level: true, domains: true };

// A function company name -> true / false for the favorites of one user (see companyMatcher.js).
async function favoriteMatcherOf(userId) {
  return buildCompanyMatcher(await listFavorites(userId));
}

// Too senior for this CV? (the job does not say = not too senior)
export function needsTooMuchExperience(cv, job) {
  return job.minYears !== null && job.minYears !== undefined && job.minYears - cv.yearsExp > MAX_YEARS_GAP;
}

// Pure: jobs in, Match rows out (only the worthwhile ones). No database here.
// isFavorite (company name -> true / false): every job of a favorite company gets a row, whatever its score
// or years, because the user wants to see all openings there (the list is built from the Match rows).
export function buildMatchRows(cv, jobs, isFavorite = () => false) {
  const rows = [];
  for (const job of jobs) {
    const favorite = isFavorite(job.company);
    if (!favorite && needsTooMuchExperience(cv, job)) continue;
    const score = scoreMatch(cv, job);
    if (!favorite && score.total < MIN_TOTAL) continue;
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
async function matchCv(cv, where, isFavorite) {
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

    saved += await saveMatchRows(buildMatchRows(cv, jobs, isFavorite));
    scored += jobs.length;
    cursor = jobs[jobs.length - 1].id;
    if (jobs.length < PAGE_SIZE) break;
  }
  return { scored, saved };
}

// Same paging as matchCv, but only builds the rows (nothing is saved here).
// `rows` = the worthwhile matches. `alertedRows` = the new scores of jobs that were already alerted,
// even when they are no longer worthwhile, so their stored score and gaps never stay outdated.
async function buildAllRowsForCv(cv, alertedIds, isFavorite) {
  const rows = [];
  const alertedRows = [];
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
    for (const job of jobs) {
      if (alertedIds.has(job.id)) alertedRows.push({ cvId: cv.id, jobId: job.id, ...scoreMatch(cv, job) });
    }
    rows.push(...buildMatchRows(cv, jobs, isFavorite).filter((r) => !alertedIds.has(r.jobId)));
    scored += jobs.length;
    cursor = jobs[jobs.length - 1].id;
    if (jobs.length < PAGE_SIZE) break;
  }
  return { rows, alertedRows, scored };
}

// The CV changed (new upload, or skills / years / level / domains edited): score ALL jobs again.
// Old matches that are no longer worthwhile are removed. Matches already sent as an alert
// (notified = true) are kept and only get their new scores, so no alert is ever sent twice.
// Delete + insert + updates are ONE transaction: if anything fails, the old matches stay as they were.
export async function rescoreCv(cvId) {
  // A job can be deleted (old-jobs cleanup) or the CV removed while we work. In the transaction below the jobs are
  // locked, so a job that is still there cannot vanish before we are done, and jobs that are already gone are skipped.
  // What is left (the CV deleted meanwhile = P2003, or two transactions waiting for each other = P2034) is tried again
  // from the start: the second try reads the new situation.
  for (let attempt = 1; ; attempt++) {
    try {
      const cv = await prisma.cv.findUnique({ where: { id: cvId }, select: { ...CV_FIELDS, isActive: true } });
      if (!cv || !cv.isActive) return { scored: 0, saved: 0 };

      const alerted = await prisma.match.findMany({ where: { cvId, notified: true }, select: { jobId: true } });
      const isFavorite = await favoriteMatcherOf(cv.userId);
      const { rows, alertedRows, scored } = await buildAllRowsForCv(cv, new Set(alerted.map((m) => m.jobId)), isFavorite);

      const saved = await prisma.$transaction(async (tx) => {
        await tx.match.deleteMany({ where: { cvId, notified: false } });

        let count = 0;
        if (rows.length > 0) {
          // FOR KEY SHARE: these jobs cannot be deleted until this transaction ends
          const still = await tx.$queryRaw`SELECT id FROM "Job" WHERE id = ANY(${rows.map((r) => r.jobId)}::text[]) FOR KEY SHARE`;
          const alive = new Set(still.map((row) => row.id));
          ({ count } = await tx.match.createMany({ data: rows.filter((r) => alive.has(r.jobId)), skipDuplicates: true }));
        }
        for (const { cvId: _c, jobId, ...scores } of alertedRows) {
          await tx.match.updateMany({ where: { cvId, jobId }, data: scores });
        }
        return count;
      });

      logger.info({ scored, saved }, 'CV rescored');
      return { scored, saved };
    } catch (err) {
      if ((err.code !== 'P2003' && err.code !== 'P2034') || attempt >= 4) throw err;
    }
  }
}

// Called from the CV routes. The answer to the user does not wait for it; a failure is only logged.
// One rescore per CV at a time: requests that arrive meanwhile are merged into ONE more run afterwards,
// so repeated edits cannot start many full scans at once.
const running = new Map(); // cvId -> { again, promise }
export function rescoreCvInBackground(cvId) {
  const current = running.get(cvId);
  if (current) {
    current.again = true;
    return current.promise;
  }
  const state = { again: false };
  state.promise = (async () => {
    try {
      do {
        state.again = false;
        await rescoreCv(cvId);
      } while (state.again);
    } catch (err) {
      logger.error({ err }, 'CV rescoring failed');
    } finally {
      running.delete(cvId);
    }
  })();
  running.set(cvId, state);
  return state.promise;
}

// The user's favorites changed (added, removed, new name or aliases): the jobs of those companies must get (or lose)
// their Match rows, so the user's active CVs are scored again. Runs in the background; a failure is only logged.
export async function rescoreUserInBackground(userId) {
  try {
    const cvs = await prisma.cv.findMany({ where: { userId, isActive: true }, select: { id: true } });
    await Promise.all(cvs.map((cv) => rescoreCvInBackground(cv.id)));
  } catch (err) {
    logger.error({ err }, 'Rescoring after a favorites change failed');
  }
}

// After a scan: score the jobs found since `since` against every active CV.
// (The caller passes a time a little before the scan started, so a small clock difference cannot miss a job.)
// `cvIds` (optional) limits it to those CVs; without it every active CV is scored (what a scan does).
export async function scoreNewJobs({ since, cvIds }) {
  const cvs = await prisma.cv.findMany({
    where: { isActive: true, ...(cvIds ? { id: { in: cvIds } } : {}) },
    select: CV_FIELDS,
  });
  let scored = 0;
  let saved = 0;
  for (const cv of cvs) {
    const result = await matchCv(cv, { foundAt: { gte: since } }, await favoriteMatcherOf(cv.userId));
    scored += result.scored;
    saved += result.saved;
  }
  logger.info({ cvs: cvs.length, scored, saved }, 'New jobs scored');
  return { cvs: cvs.length, scored, saved };
}
