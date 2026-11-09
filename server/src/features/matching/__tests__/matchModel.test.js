import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../../shared/db/prisma.js';

// Tests the database rules of the Match table. Every row made here is marked "test-match" and removed again.
const MARK = 'test-match';

async function clean() {
  await prisma.job.deleteMany({ where: { source: MARK } });
  await prisma.user.deleteMany({ where: { username: MARK } }); // deletes the test CVs and their matches too
}

async function makeCvAndJob() {
  const user = await prisma.user.create({ data: { username: MARK, passwordHash: 'x' } });
  const cv = await prisma.cv.create({
    data: { userId: user.id, name: MARK, textEnc: 'x', yearsExp: 2, level: 'JUNIOR', skills: [], keywords: [], domains: [] },
  });
  const job = await prisma.job.create({
    data: { source: MARK, url: `https://example.com/${MARK}`, hash: `${MARK}-hash`, title: 'Dev', company: MARK },
  });
  return { cv, job };
}

const matchData = (cvId, jobId) => ({
  cvId,
  jobId,
  stackFit: null,
  expFit: 70,
  levelFit: 100,
  domainFit: 50,
  total: 62,
  label: 'GOOD',
  gaps: ['docker'],
});

beforeEach(clean);
after(async () => {
  await clean();
  await prisma.$disconnect();
});

test('a match is saved with its defaults (notified false, stackFit may be empty)', async () => {
  const { cv, job } = await makeCvAndJob();
  const match = await prisma.match.create({ data: matchData(cv.id, job.id) });
  assert.equal(match.notified, false);
  assert.equal(match.stackFit, null);
  assert.deepEqual(match.gaps, ['docker']);
  assert.equal(match.label, 'GOOD');
});

test('one CV can have only one match per job', async () => {
  const { cv, job } = await makeCvAndJob();
  await prisma.match.create({ data: matchData(cv.id, job.id) });
  await assert.rejects(prisma.match.create({ data: matchData(cv.id, job.id) }), /Unique constraint/);
});

test('deleting a job deletes its matches (needed by the old-jobs cleanup)', async () => {
  const { cv, job } = await makeCvAndJob();
  await prisma.match.create({ data: matchData(cv.id, job.id) });
  await prisma.job.delete({ where: { id: job.id } });
  assert.equal(await prisma.match.count({ where: { cvId: cv.id } }), 0);
});

test('deleting a CV deletes its matches, and the job stays', async () => {
  const { cv, job } = await makeCvAndJob();
  await prisma.match.create({ data: matchData(cv.id, job.id) });
  await prisma.cv.delete({ where: { id: cv.id } });
  assert.equal(await prisma.match.count({ where: { jobId: job.id } }), 0);
  assert.equal(await prisma.job.count({ where: { id: job.id } }), 1);
});

test('a match needs a real CV and a real job', async () => {
  await assert.rejects(prisma.match.create({ data: matchData('no-such-cv', 'no-such-job') }), /Foreign key/);
});
