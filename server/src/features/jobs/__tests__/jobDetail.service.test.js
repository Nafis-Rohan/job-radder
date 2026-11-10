import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../../shared/db/prisma.js';
import { toDetail, getJob } from '../jobDetail.service.js';

const NOW = new Date('2026-11-10T12:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600 * 1000);

// ---- pure part ----
const row = (extra = {}) => ({
  id: 'j1', title: 'Dev', minYears: 2, foundAt: hoursAgo(1), deadline: null, matches: [], ...extra,
});

test('toDetail: no match saved gives match null', () => {
  assert.equal(toDetail(row(), NOW).match, null);
});

test('toDetail: the match comes with the score weights, and "matches" is not in the answer', () => {
  const match = { total: 70, label: 'GOOD', gaps: [], stackFit: 50, expFit: 100, levelFit: 50, domainFit: 100 };
  const detail = toDetail(row({ matches: [match] }), NOW);
  assert.deepEqual(detail.match.weights, { stack: 0.4, exp: 0.2, level: 0.2, domain: 0.2 });
  assert.equal(detail.match.total, 70);
  assert.equal('matches' in detail, false);
});

test('toDetail: isNew, yearsStated and expired', () => {
  assert.equal(toDetail(row(), NOW).isNew, true);
  assert.equal(toDetail(row({ foundAt: hoursAgo(25) }), NOW).isNew, false);
  assert.equal(toDetail(row({ minYears: null }), NOW).yearsStated, false);
  assert.equal(toDetail(row({ deadline: hoursAgo(1) }), NOW).expired, true);
  assert.equal(toDetail(row({ deadline: hoursAgo(-1) }), NOW).expired, false);
  assert.equal(toDetail(row({ deadline: null }), NOW).expired, false);
});

// ---- database part: rows made here start with "test-jobdetail" and are removed again ----
const MARK = 'test-jobdetail';

async function clean() {
  await prisma.job.deleteMany({ where: { source: MARK } });
  await prisma.user.deleteMany({ where: { username: { startsWith: MARK } } });
}
beforeEach(clean);
after(async () => {
  await clean();
  await prisma.$disconnect();
});

async function seed() {
  const cvData = { textEnc: 'x', yearsExp: 2, level: 'MID', skills: [], keywords: [], domains: [] };
  const mine = await prisma.user.create({ data: { username: MARK, passwordHash: 'x' } });
  const other = await prisma.user.create({ data: { username: `${MARK}-2`, passwordHash: 'x' } });
  const off = await prisma.user.create({ data: { username: `${MARK}-3`, passwordHash: 'x' } });
  const myCv = await prisma.cv.create({ data: { ...cvData, userId: mine.id, name: 'mine' } });
  const otherCv = await prisma.cv.create({ data: { ...cvData, userId: other.id, name: 'other' } });
  const offCv = await prisma.cv.create({ data: { ...cvData, userId: off.id, name: 'off', isActive: false } });

  const matched = await prisma.job.create({
    data: {
      source: MARK, url: `https://example.com/${MARK}/1`, hash: `${MARK}-1`, title: 'Matched', company: 'Co',
      description: 'The long text', experienceText: '2+ years', minYears: 2, level: 'MID',
    },
  });
  const unmatched = await prisma.job.create({
    data: { source: MARK, url: `https://example.com/${MARK}/2`, hash: `${MARK}-2`, title: 'Unmatched', company: 'Co' },
  });

  const scores = { stackFit: null, expFit: 100, levelFit: 100, domainFit: 50, label: 'GOOD', gaps: ['docker'] };
  await prisma.match.createMany({
    data: [
      { cvId: myCv.id, jobId: matched.id, total: 77, ...scores },
      { cvId: otherCv.id, jobId: matched.id, total: 99, ...scores }, // another user's score: must never show
      { cvId: offCv.id, jobId: matched.id, total: 88, ...scores }, // inactive CV
    ],
  });
  return { mine, other, off, matched, unmatched };
}

test('my job: the long texts and MY full breakdown; no hash', async () => {
  const { mine, matched } = await seed();
  const job = await getJob(mine.id, matched.id);
  assert.equal(job.title, 'Matched');
  assert.equal(job.description, 'The long text');
  assert.equal(job.experienceText, '2+ years');
  assert.equal('hash' in job, false);
  assert.equal(job.match.total, 77); // not 99 (other user) and not 88 (inactive CV)
  assert.equal(job.match.stackFit, null);
  assert.equal(job.match.expFit, 100);
  assert.deepEqual(job.match.gaps, ['docker']);
  assert.equal(job.match.weights.stack, 0.4);
});

test('a job I have no match for can still be opened, with match null', async () => {
  const { mine, unmatched } = await seed();
  const job = await getJob(mine.id, unmatched.id);
  assert.equal(job.title, 'Unmatched');
  assert.equal(job.match, null);
});

test('a user with only an inactive CV gets match null, and an unknown id gives null', async () => {
  const { off, matched, mine } = await seed();
  assert.equal((await getJob(off.id, matched.id)).match, null);
  assert.equal(await getJob(mine.id, 'no-such-job'), null);
});
