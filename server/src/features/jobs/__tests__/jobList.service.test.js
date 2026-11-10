import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../../shared/db/prisma.js';
import { listJobsQuerySchema } from '../jobs.schemas.js';
import { buildJobFilter, buildMatchFilter, toListItem, listJobs } from '../jobList.service.js';

const q = (input = {}) => listJobsQuerySchema.parse(input);
const NOW = new Date('2026-11-10T12:00:00Z');

// ---- pure part ----
test('no filters: only the "not expired" check', () => {
  const filter = buildJobFilter(q(), NOW);
  assert.equal(filter.AND.length, 1);
  assert.deepEqual(filter.AND[0], { OR: [{ deadline: null }, { deadline: { gt: NOW } }] });
});

test('each filter adds one check', () => {
  const filter = buildJobFilter(
    q({ since: '2d', source: 'bdjobs', company: 'acme', level: 'JUNIOR', years: '2' }),
    NOW,
  );
  assert.equal(filter.AND.length, 6);
  assert.deepEqual(filter.AND[1], { foundAt: { gte: new Date('2026-11-08T12:00:00Z') } });
  assert.deepEqual(filter.AND[4], { level: { in: ['JUNIOR'] } });
  assert.deepEqual(filter.AND[5], { OR: [{ minYears: null }, { minYears: { lte: 2 } }] });
});

test('the match filter always limits to the user and their active CV; minScore 0 still counts', () => {
  const where = buildMatchFilter('u1', q({ minScore: '0' }), NOW);
  assert.deepEqual(where.cv, { userId: 'u1', isActive: true });
  assert.deepEqual(where.total, { gte: 0 });
  assert.equal('total' in buildMatchFilter('u1', q(), NOW), false);
});

test('toListItem: new = found in the last 24 hours; yearsStated = the job says how many years', () => {
  const base = { id: 'j', minYears: 2, foundAt: new Date(NOW.getTime() - 23 * 3600 * 1000) };
  const match = (job) => ({ total: 70, label: 'GOOD', gaps: ['docker'], job });

  const fresh = toListItem(match(base), NOW);
  assert.equal(fresh.isNew, true);
  assert.equal(fresh.yearsStated, true);
  assert.deepEqual(fresh.match, { total: 70, label: 'GOOD', gaps: ['docker'] });

  const old = toListItem(match({ ...base, minYears: null, foundAt: new Date(NOW.getTime() - 25 * 3600 * 1000) }), NOW);
  assert.equal(old.isNew, false);
  assert.equal(old.yearsStated, false);
});

// ---- database part: rows made here start with "test-joblist" and are removed again ----
const MARK = 'test-joblist';

async function clean() {
  await prisma.job.deleteMany({ where: { source: { startsWith: MARK } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: MARK } } });
}
beforeEach(clean);
after(async () => {
  await clean();
  await prisma.$disconnect();
});

const HOUR = 3600 * 1000;

// Two users. User 1 has 4 visible matches (J1, J5, J2, J3), an expired one (J4) and an inactive CV.
async function seed() {
  const now = new Date();
  const ago = (ms) => new Date(now.getTime() - ms);
  const cvData = { textEnc: 'x', yearsExp: 2, level: 'MID', skills: [], keywords: [], domains: [] };

  const user1 = await prisma.user.create({ data: { username: MARK, passwordHash: 'x' } });
  const user2 = await prisma.user.create({ data: { username: `${MARK}-2`, passwordHash: 'x' } });
  const user3 = await prisma.user.create({ data: { username: `${MARK}-3`, passwordHash: 'x' } });
  const cv1 = await prisma.cv.create({ data: { ...cvData, userId: user1.id, name: 'one' } });
  const cv2 = await prisma.cv.create({ data: { ...cvData, userId: user2.id, name: 'two' } });
  const cv3 = await prisma.cv.create({ data: { ...cvData, userId: user3.id, name: 'off', isActive: false } });

  const job = (n, extra) => ({
    source: MARK,
    url: `https://example.com/${MARK}/${n}`,
    hash: `${MARK}-hash-${n}`,
    title: `J${n}`,
    company: 'Some Co',
    ...extra,
  });
  await prisma.job.createMany({
    data: [
      job(1, { level: 'JUNIOR', minYears: 1, foundAt: ago(1 * HOUR), description: 'long text' }),
      job(2, { level: 'MID', minYears: null, foundAt: ago(72 * HOUR) }),
      job(3, { level: 'SENIOR', minYears: 5, foundAt: ago(240 * HOUR) }),
      job(4, { level: 'MID', minYears: 1, foundAt: ago(2 * HOUR), deadline: ago(1 * HOUR) }), // expired
      job(5, { level: 'MID', minYears: 2, foundAt: ago(30 * HOUR), source: `${MARK}-other`, company: 'Acme Corp' }),
      job(6, { level: 'MID', minYears: 1, foundAt: ago(3 * HOUR) }), // matched for user 2 only
    ],
  });
  const jobs = Object.fromEntries((await prisma.job.findMany({ where: { source: { startsWith: MARK } } })).map((j) => [j.title, j]));

  const match = (cv, j, total) => ({
    cvId: cv.id, jobId: jobs[j].id, stackFit: 50, expFit: 70, levelFit: 70, domainFit: 50, total, label: 'GOOD', gaps: ['docker'],
  });
  await prisma.match.createMany({
    data: [
      match(cv1, 'J1', 80), match(cv1, 'J2', 60), match(cv1, 'J3', 45), match(cv1, 'J4', 90), match(cv1, 'J5', 70),
      match(cv2, 'J6', 85),
      match(cv3, 'J1', 99),
    ],
  });
  return { user1, user2, user3 };
}

const titles = (result) => result.jobs.map((j) => j.title);

test('lists only my own matches, newest job first, expired hidden', async () => {
  const { user1 } = await seed();
  const result = await listJobs(user1.id, q());
  assert.deepEqual(titles(result), ['J1', 'J5', 'J2', 'J3']); // no J4 (expired), no J6 (other user)
  assert.equal(result.total, 4);
  assert.equal(result.pages, 1);
});

test('each item has the job, its match, and the flags; no description', async () => {
  const { user1 } = await seed();
  const [first, , second] = (await listJobs(user1.id, q())).jobs;
  assert.equal(first.title, 'J1');
  assert.equal(first.isNew, true);
  assert.equal(first.yearsStated, true);
  assert.deepEqual(first.match, { total: 80, label: 'GOOD', gaps: ['docker'] });
  assert.equal('description' in first, false);
  assert.equal(second.title, 'J2');
  assert.equal(second.isNew, false);
  assert.equal(second.yearsStated, false);
});

test('a user without an active CV sees nothing', async () => {
  const { user3 } = await seed();
  assert.deepEqual((await listJobs(user3.id, q())).jobs, []);
});

test('since', async () => {
  const { user1 } = await seed();
  assert.deepEqual(titles(await listJobs(user1.id, q({ since: '24h' }))), ['J1']);
  assert.deepEqual(titles(await listJobs(user1.id, q({ since: '2d' }))), ['J1', 'J5']);
  assert.deepEqual(titles(await listJobs(user1.id, q({ since: '7d' }))), ['J1', 'J5', 'J2']);
});

test('level, years, minScore', async () => {
  const { user1 } = await seed();
  assert.deepEqual(titles(await listJobs(user1.id, q({ level: 'MID,SENIOR' }))), ['J5', 'J2', 'J3']);
  // years=2: J1 needs 1, J5 needs 2, J2 does not say (kept), J3 needs 5 (out)
  assert.deepEqual(titles(await listJobs(user1.id, q({ years: '2' }))), ['J1', 'J5', 'J2']);
  assert.deepEqual(titles(await listJobs(user1.id, q({ minScore: '60' }))), ['J1', 'J5', 'J2']);
});

test('source and company ignore letter case; filters combine', async () => {
  const { user1 } = await seed();
  assert.deepEqual(titles(await listJobs(user1.id, q({ source: `${MARK.toUpperCase()}-OTHER` }))), ['J5']);
  assert.deepEqual(titles(await listJobs(user1.id, q({ company: 'acme' }))), ['J5']);
  assert.deepEqual(titles(await listJobs(user1.id, q({ company: 'acme', level: 'JUNIOR' }))), []);
});

test('pages: limit 3 gives 3 then 1; total and pages are for the whole result', async () => {
  const { user1 } = await seed();
  const one = await listJobs(user1.id, q({ limit: '3' }));
  const two = await listJobs(user1.id, q({ limit: '3', page: '2' }));
  assert.deepEqual(titles(one), ['J1', 'J5', 'J2']);
  assert.deepEqual(titles(two), ['J3']);
  assert.equal(one.total, 4);
  assert.equal(one.pages, 2);
  assert.deepEqual(titles(await listJobs(user1.id, q({ limit: '3', page: '5' }))), []);
});
