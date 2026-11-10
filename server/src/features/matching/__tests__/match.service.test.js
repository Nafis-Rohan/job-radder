import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../../shared/db/prisma.js';
import {
  buildMatchRows,
  needsTooMuchExperience,
  saveMatchRows,
  scoreNewJobs,
  rescoreCv,
  rescoreCvInBackground,
  rescoreUserInBackground,
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
  await scoreNewJobs({ since, cvIds: [active.id, inactive.id] }); // only this test's CVs: other test files share the database

  // only look at this test's own jobs: other test files create jobs at the same time in the same database
  const mine = { cvId: active.id, job: { source: MARK } };
  const saved = await prisma.match.findMany({ where: mine, include: { job: { select: { title: true } } } });
  assert.deepEqual(saved.map((m) => m.job.title), ['Job 1']);
  assert.equal(saved[0].total, 100);
  assert.equal(saved[0].label, 'STRONG');
  assert.equal(saved[0].notified, false);
  assert.equal(await prisma.match.count({ where: { cvId: inactive.id, job: { source: MARK } } }), 0);

  // running it again must not create copies
  await scoreNewJobs({ since, cvIds: [active.id, inactive.id] }); // only this test's CVs: other test files share the database
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

test('rescoreCv updates an alerted match even when it no longer fits the CV', async () => {
  const user = await prisma.user.create({ data: { username: MARK, passwordHash: 'x' } });
  const cvRow = await prisma.cv.create({
    data: { userId: user.id, name: 'c', textEnc: 'x', yearsExp: 2, level: 'MID', skills: ['node.js'], keywords: [], domains: ['fintech'] },
  });
  // far too senior for this CV: a normal match would not be saved, but this one was alerted earlier
  const job = await prisma.job.create({
    data: jobRow(7, { skills: ['node.js'], minYears: 9, level: 'MID', domains: ['fintech'] }),
  });
  await prisma.match.create({
    data: { cvId: cvRow.id, jobId: job.id, stackFit: 100, expFit: 100, levelFit: 100, domainFit: 100, total: 100, label: 'STRONG', gaps: [], notified: true },
  });

  await rescoreCv(cvRow.id);

  const match = await prisma.match.findUnique({ where: { cvId_jobId: { cvId: cvRow.id, jobId: job.id } } });
  assert.equal(match.notified, true); // still there, never alerted twice
  assert.equal(match.expFit, 0); // 7 years short: the old 100 was replaced
  assert.ok(match.total < 100);
});

test('rescoreCvInBackground runs one rescore at a time per CV and merges repeated requests', async () => {
  const user = await prisma.user.create({ data: { username: MARK, passwordHash: 'x' } });
  const cvRow = await prisma.cv.create({
    data: { userId: user.id, name: 'c', textEnc: 'x', yearsExp: 2, level: 'MID', skills: ['node.js'], keywords: [], domains: [] },
  });
  const job = await prisma.job.create({ data: jobRow(8, { skills: ['node.js'], minYears: 2, level: 'MID' }) });

  const first = rescoreCvInBackground(cvRow.id);
  const second = rescoreCvInBackground(cvRow.id);
  const third = rescoreCvInBackground(cvRow.id);
  assert.equal(first, second); // same running task, not three scans
  assert.equal(first, third);
  await first;

  assert.equal(await prisma.match.count({ where: { cvId: cvRow.id, jobId: job.id } }), 1);
  assert.notEqual(rescoreCvInBackground(cvRow.id), first); // finished: the next request starts a new run
  await rescoreCvInBackground(cvRow.id);
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

test('scoreNewJobs with cvIds scores only those CVs; without it, every active CV', async () => {
  const user = await prisma.user.create({ data: { username: MARK, passwordHash: 'x' } });
  const base = { userId: user.id, textEnc: 'x', yearsExp: 2, level: 'MID', skills: ['node.js'], keywords: [], domains: [] };
  const first = await prisma.cv.create({ data: { ...base, name: 'first' } });
  const second = await prisma.cv.create({ data: { ...base, name: 'second' } });
  await prisma.job.create({ data: jobRow(11, { skills: ['node.js'], minYears: 2, level: 'MID' }) });
  const since = new Date(Date.now() - 60 * 1000);
  const mine = (cv) => prisma.match.count({ where: { cvId: cv.id, job: { source: MARK } } });

  await scoreNewJobs({ since, cvIds: [first.id] });
  assert.equal(await mine(first), 1);
  assert.equal(await mine(second), 0);

  await scoreNewJobs({ since }); // no list: all active CVs (this test's second CV too)
  assert.equal(await mine(second), 1);
});

// ---- favorite companies: every job of a favorite gets a Match row, whatever its score ----
const favCv = { id: 'cv1', skills: ['node.js', 'postgresql'], yearsExp: 1, level: 'JUNIOR', domains: ['fintech'] };
const weakJob = { id: 'weak', company: 'Fav Co', skills: ['cobol'], minYears: 0, level: 'LEAD', domains: ['gaming'] };
const seniorJob = { id: 'senior', company: 'Fav Co', skills: ['node.js'], minYears: 9, level: 'MID', domains: ['fintech'] };
const isFav = (name) => name === 'Fav Co';

test('buildMatchRows: a favorite\'s weak or far-too-senior job is kept; the same job of another company is not', () => {
  assert.deepEqual(buildMatchRows(favCv, [weakJob, seniorJob]), []); // nobody's favorite: both dropped
  const rows = buildMatchRows(favCv, [weakJob, seniorJob], isFav);
  assert.deepEqual(rows.map((r) => r.jobId), ['weak', 'senior']);
  assert.equal(rows[0].label, 'WEAK');
  assert.ok(rows[0].total < MIN_TOTAL);
  const other = buildMatchRows(favCv, [{ ...weakJob, id: 'x', company: 'Other Co' }], isFav);
  assert.deepEqual(other, []);
});

async function favSetup() {
  const user = await prisma.user.create({ data: { username: MARK, passwordHash: 'x' } });
  const cvRow = await prisma.cv.create({
    data: { userId: user.id, name: 'c', textEnc: 'x', yearsExp: 1, level: 'JUNIOR', skills: ['node.js'], keywords: [], domains: [] },
  });
  const weak = { skills: ['cobol'], minYears: 0, level: 'LEAD', domains: ['gaming'] };
  await prisma.job.create({ data: jobRow(21, { ...weak, company: 'Fav Cleanup Name Ltd' }) });
  await prisma.job.create({ data: jobRow(22, { ...weak, company: 'Not A Favorite' }) });
  const rowsOf = () => prisma.match.findMany({ where: { cvId: cvRow.id, job: { source: MARK } }, include: { job: { select: { company: true } } } });
  return { user, cvRow, rowsOf };
}

test('scoreNewJobs saves a Match row for a favorite\'s weak job and none for another company\'s', async () => {
  const { user, cvRow, rowsOf } = await favSetup();
  await prisma.favoriteCompany.create({ data: { userId: user.id, name: 'Fav Cleanup Name', careersUrl: 'https://example.com/careers' } });
  await scoreNewJobs({ since: new Date(Date.now() - 60 * 1000), cvIds: [cvRow.id] });
  const rows = await rowsOf();
  assert.deepEqual(rows.map((r) => r.job.company), ['Fav Cleanup Name Ltd']);
  assert.equal(rows[0].label, 'WEAK');
});

test('rescoreCv: a favorite\'s jobs get rows; when the favorite is gone the rows go too', async () => {
  const { user, cvRow, rowsOf } = await favSetup();
  assert.equal((await rowsOf()).length, 0);

  await prisma.favoriteCompany.create({ data: { userId: user.id, name: 'Not A Favorite', aliases: [], careersUrl: 'https://example.com/careers' } });
  await rescoreCv(cvRow.id);
  assert.deepEqual((await rowsOf()).map((r) => r.job.company), ['Not A Favorite']);

  await prisma.favoriteCompany.deleteMany({ where: { userId: user.id } });
  await rescoreCv(cvRow.id);
  assert.equal((await rowsOf()).length, 0);
});

test('rescoreUserInBackground scores the active CVs of that user only, and an unknown user does nothing', async () => {
  const { user, cvRow, rowsOf } = await favSetup();
  await prisma.favoriteCompany.create({ data: { userId: user.id, name: 'Not A Favorite', careersUrl: 'https://example.com/careers' } });
  await rescoreUserInBackground(user.id);
  assert.equal((await rowsOf()).length, 1);
  await rescoreUserInBackground('no-such-user'); // no CVs: nothing happens, no error
  assert.equal(await prisma.match.count({ where: { cvId: cvRow.id, job: { source: MARK } } }), 1);
});
