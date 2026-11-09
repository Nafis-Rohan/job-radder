import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../../shared/db/prisma.js';
import {
  buildMatchRows,
  needsTooMuchExperience,
  saveMatchRows,
  scoreNewJobs,
  rescoreCv,
  MIN_TOTAL,
  MAX_YEARS_GAP,
} from '../match.service.js';

const cv = { id: 'cv1', skills: ['node.js', 'postgresql'], yearsExp: 2, level: 'MID', domains: ['fintech'] };
const good = { id: 'job-good', skills: ['node.js', 'postgresql'], minYears: 2, level: 'MID', domains: ['fintech'] };
const bad = { id: 'job-bad', skills: ['cobol', 'fortran'], minYears: 0, level: 'LEAD', domains: ['gaming'] };

test('the rules: minimum score 40, at most 2 years more than the CV has', () => {
  assert.equal(MIN_TOTAL, 40);
  assert.equal(MAX_YEARS_GAP, 2);
});

test('needsTooMuchExperience: more than 2 years above the CV is too much, unknown is fine', () => {
  assert.equal(needsTooMuchExperience(cv, { minYears: 4 }), false); // exactly 2 more
  assert.equal(needsTooMuchExperience(cv, { minYears: 4.5 }), true);
  assert.equal(needsTooMuchExperience(cv, { minYears: 9 }), true);
  assert.equal(needsTooMuchExperience(cv, { minYears: 1 }), false);
  assert.equal(needsTooMuchExperience(cv, { minYears: null }), false);
  assert.equal(needsTooMuchExperience(cv, {}), false);
});

test('buildMatchRows keeps good jobs and drops weak ones', () => {
  const rows = buildMatchRows(cv, [good, bad]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].jobId, 'job-good');
  assert.equal(rows[0].cvId, 'cv1');
  assert.equal(rows[0].total, 100);
  assert.equal(rows[0].label, 'STRONG');
  assert.deepEqual(Object.keys(rows[0]).sort(), [
    'cvId', 'domainFit', 'expFit', 'gaps', 'jobId', 'label', 'levelFit', 'stackFit', 'total',
  ]);
});

test('buildMatchRows drops a job that needs far more experience, even with a high score', () => {
  const senior = { ...good, id: 'job-senior', minYears: 9 };
  assert.deepEqual(buildMatchRows(cv, [senior]), []);
});

test('buildMatchRows keeps a job with no information (it scores 63) and handles an empty list', () => {
  const unknown = { id: 'job-unknown', skills: [], minYears: null, level: 'UNKNOWN', domains: [] };
  assert.equal(buildMatchRows(cv, [unknown]).length, 1);
  assert.equal(buildMatchRows(cv, []).length, 0);
});

// ---- database part: rows made here are marked "test-matchsvc" and removed again ----
const MARK = 'test-matchsvc';

async function clean() {
  await prisma.job.deleteMany({ where: { source: MARK } });
  await prisma.user.deleteMany({ where: { username: MARK } });
}

const jobRow = (n, extra = {}) => ({
  source: MARK,
  url: `https://example.com/${MARK}/${n}`,
  hash: `${MARK}-hash-${n}`,
  title: `Job ${n}`,
  company: MARK,
  ...extra,
});

beforeEach(clean);
after(async () => {
  await clean();
  await prisma.$disconnect();
});

test('scoreNewJobs saves matches for recent jobs of active CVs only, and is safe to repeat', async () => {
  const user = await prisma.user.create({ data: { username: MARK, passwordHash: 'x' } });
  const base = { userId: user.id, textEnc: 'x', yearsExp: 2, level: 'MID', skills: ['node.js', 'postgresql'], keywords: [], domains: ['fintech'] };
  const active = await prisma.cv.create({ data: { ...base, name: 'active' } });
  const inactive = await prisma.cv.create({ data: { ...base, name: 'inactive', isActive: false } });

  const fit = { skills: ['node.js', 'postgresql'], minYears: 2, level: 'MID', domains: ['fintech'] };
  await prisma.job.createMany({
    data: [
      jobRow(1, fit), // good, recent -> saved
      jobRow(2, { skills: ['cobol', 'fortran'], minYears: 0, level: 'LEAD', domains: ['gaming'] }), // weak -> not saved
      jobRow(3, { ...fit, minYears: 9 }), // far too senior -> not saved
      jobRow(4, { ...fit, foundAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) }), // old -> not scored now
    ],
  });

  const since = new Date(Date.now() - 60 * 1000);
  await scoreNewJobs({ since });

  // only look at this test's own jobs: other test files create jobs at the same time in the same database
  const mine = { cvId: active.id, job: { source: MARK } };
  const saved = await prisma.match.findMany({ where: mine, include: { job: { select: { title: true } } } });
  assert.deepEqual(saved.map((m) => m.job.title), ['Job 1']);
  assert.equal(saved[0].total, 100);
  assert.equal(saved[0].label, 'STRONG');
  assert.equal(saved[0].notified, false);
  assert.equal(await prisma.match.count({ where: { cvId: inactive.id, job: { source: MARK } } }), 0);

  // running it again must not create copies
  await scoreNewJobs({ since });
  assert.equal(await prisma.match.count({ where: mine }), 1);
});

test('saveMatchRows skips rows whose job is gone, saves the rest, and does not crash', async () => {
  const user = await prisma.user.create({ data: { username: MARK, passwordHash: 'x' } });
  const cvRow = await prisma.cv.create({
    data: { userId: user.id, name: 'c', textEnc: 'x', yearsExp: 2, level: 'MID', skills: [], keywords: [], domains: [] },
  });
  const job = await prisma.job.create({ data: jobRow(9) });
  const row = (jobId) => ({
    cvId: cvRow.id, jobId, stackFit: null, expFit: 70, levelFit: 70, domainFit: 50, total: 63, label: 'GOOD', gaps: [],
  });

  assert.equal(await saveMatchRows([]), 0);
  const saved = await saveMatchRows([row('job-that-was-deleted'), row(job.id)]);
  assert.equal(saved, 1);
  assert.equal(await prisma.match.count({ where: { cvId: cvRow.id } }), 1);
  assert.equal(await saveMatchRows([row(job.id)]), 0); // already there: not saved twice
});

test('rescoreCv scores old jobs too, drops matches that no longer fit, keeps alerted ones', async () => {
  const user = await prisma.user.create({ data: { username: MARK, passwordHash: 'x' } });
  const cvRow = await prisma.cv.create({
    data: { userId: user.id, name: 'c', textEnc: 'x', yearsExp: 2, level: 'MID', skills: ['node.js', 'postgresql'], keywords: [], domains: ['fintech'] },
  });
  const fit = { skills: ['node.js', 'postgresql'], minYears: 2, level: 'MID', domains: ['fintech'] };
  const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.job.createMany({
    data: [
      jobRow(1, { ...fit, foundAt: old }), // old job: must be scored now
      jobRow(2, { ...fit, foundAt: old }), // will have an alerted match
      jobRow(3, { skills: ['cobol'], minYears: 0, level: 'LEAD', domains: ['gaming'] }), // never fits
    ],
  });
  const jobs = await prisma.job.findMany({ where: { source: MARK }, orderBy: { url: 'asc' } });
  const [j1, j2, j3] = jobs;

  // stale data from before the CV changed: a bad match for job 3 and an alerted, outdated match for job 2
  const stale = { cvId: cvRow.id, stackFit: 0, expFit: 0, levelFit: 0, domainFit: 0, total: 45, label: 'PARTIAL', gaps: [] };
  await prisma.match.create({ data: { ...stale, jobId: j3.id } });
  await prisma.match.create({ data: { ...stale, jobId: j2.id, notified: true } });

  await rescoreCv(cvRow.id);

  const byJob = Object.fromEntries((await prisma.match.findMany({ where: { cvId: cvRow.id, job: { source: MARK } } })).map((m) => [m.jobId, m]));
  assert.equal(byJob[j1.id].total, 100); // old job now scored
  assert.equal(byJob[j3.id], undefined); // stale match removed
  assert.equal(byJob[j2.id].total, 100); // alerted match updated...
  assert.equal(byJob[j2.id].notified, true); // ...and still marked as alerted
  assert.equal(Object.keys(byJob).length, 2);
});

test('rescoreCv does nothing for an inactive or missing CV', async () => {
  const user = await prisma.user.create({ data: { username: MARK, passwordHash: 'x' } });
  const off = await prisma.cv.create({
    data: { userId: user.id, name: 'off', textEnc: 'x', yearsExp: 2, level: 'MID', skills: [], keywords: [], domains: [], isActive: false },
  });
  await prisma.job.create({ data: jobRow(5) });
  assert.deepEqual(await rescoreCv(off.id), { scored: 0, saved: 0 });
  assert.deepEqual(await rescoreCv('no-such-cv'), { scored: 0, saved: 0 });
  assert.equal(await prisma.match.count({ where: { cvId: off.id } }), 0);
});

test('a non-foreign-key database error is not hidden', async () => {
  const badRow = { cvId: 'x', jobId: 'y', stackFit: null, expFit: 70, levelFit: 70, domainFit: 50, total: 63, label: 'NOT_A_LABEL', gaps: [] };
  await assert.rejects(saveMatchRows([badRow]));
});
