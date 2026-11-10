import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../../shared/db/prisma.js';
import { cleanup, daysAgo, scanRunsToDelete, RETENTION } from '../cleanup.service.js';

// Database rows made here are marked with "test-cleanup" and removed at the end.
const MARK = 'test-cleanup';
const NOW = new Date('2026-11-08T12:00:00Z');

after(async () => {
  await prisma.job.deleteMany({ where: { source: MARK } });
  await prisma.job.deleteMany({ where: { source: FAV_MARK } });
  await prisma.user.deleteMany({ where: { username: FAV_MARK } }); // its favorite goes with it
  await prisma.loginEvent.deleteMany({ where: { username: MARK } });
  await prisma.$disconnect();
});

// Used by the favorite-company test at the end of this file.
const FAV_MARK = 'test-cleanupfav';

test('daysAgo goes back whole days', () => {
  assert.equal(daysAgo(60, NOW).toISOString(), '2026-09-09T12:00:00.000Z');
  assert.equal(daysAgo(0, NOW).getTime(), NOW.getTime());
});

test('scanRunsToDelete keeps the newest N and never deletes a RUNNING row', () => {
  const runs = [
    { id: '1', status: 'SUCCESS' },
    { id: '2', status: 'SUCCESS' },
    { id: '3', status: 'FAILED' },
    { id: '4', status: 'RUNNING' },
    { id: '5', status: 'SKIPPED' },
  ];
  assert.deepEqual(scanRunsToDelete(runs, 2), ['3', '5']);
  assert.deepEqual(scanRunsToDelete(runs, 5), []);
  assert.deepEqual(scanRunsToDelete(runs, 10), []);
  assert.deepEqual(scanRunsToDelete([], 100), []);
});

test('the rules are 60 days for jobs, 90 for login events, 100 scan runs', () => {
  assert.deepEqual(RETENTION, { jobDays: 60, loginEventDays: 90, keepScanRuns: 100 });
});

const job = (n, foundAt) => ({
  source: MARK,
  url: `https://example.com/${MARK}/${n}`,
  hash: `${MARK}-hash-${n}`,
  title: `Job ${n}`,
  company: MARK,
  foundAt,
});

test('jobs older than 60 days are deleted, newer ones stay', async () => {
  await prisma.job.createMany({
    data: [
      job(1, daysAgo(61, NOW)), // old: deleted
      job(2, daysAgo(59, NOW)), // recent: stays
      job(3, NOW), // new: stays
    ],
  });
  const deleted = await cleanup({ now: NOW });
  assert.ok(deleted.jobs >= 1);

  const left = await prisma.job.findMany({ where: { source: MARK }, select: { title: true }, orderBy: { title: 'asc' } });
  assert.deepEqual(left.map((j) => j.title), ['Job 2', 'Job 3']);
});

test('login events older than 90 days are deleted, newer ones stay', async () => {
  await prisma.loginEvent.createMany({
    data: [
      { username: MARK, success: true, createdAt: daysAgo(91, NOW) },
      { username: MARK, success: true, createdAt: daysAgo(89, NOW) },
    ],
  });
  await cleanup({ now: NOW });
  assert.equal(await prisma.loginEvent.count({ where: { username: MARK } }), 1);
});

test('old jobs of a favorite company are kept (any spelling, aliases too); other old jobs are deleted', async () => {
  const user = await prisma.user.upsert({
    where: { username: FAV_MARK },
    update: {},
    create: { username: FAV_MARK, passwordHash: 'x' },
  });
  await prisma.favoriteCompany.create({
    data: { userId: user.id, name: 'Fav Cleanup Co', aliases: ['FCC'], careersUrl: 'https://example.com/careers' },
  });

  const oldJob = (n, company) => ({
    source: FAV_MARK,
    url: `https://example.com/${FAV_MARK}/${n}`,
    hash: `${FAV_MARK}-hash-${n}`,
    title: `Job ${n}`,
    company,
    foundAt: daysAgo(100, NOW), // far older than 60 days
  });
  await prisma.job.createMany({
    data: [
      oldJob(1, 'Fav Cleanup Co'), // the favorite: kept
      oldJob(2, 'FAV CLEANUP CO LTD.'), // another spelling of it: kept
      oldJob(3, 'FCC'), // alias: kept
      oldJob(4, 'Some Other Company'), // not a favorite: deleted
    ],
  });

  await cleanup({ now: NOW });

  const left = await prisma.job.findMany({ where: { source: FAV_MARK }, select: { title: true }, orderBy: { title: 'asc' } });
  assert.deepEqual(left.map((j) => j.title), ['Job 1', 'Job 2', 'Job 3']);
});

test('an old job of a company that nobody has as a favorite is still deleted', async () => {
  // the shared database may hold favorites from other tests, so only this test's own row is checked
  await prisma.job.create({
    data: {
      source: MARK, url: `https://example.com/${MARK}/nofav`, hash: `${MARK}-hash-nofav`,
      title: 'No fav', company: 'Nobody Favors This Ltd', foundAt: daysAgo(100, NOW),
    },
  });
  await cleanup({ now: NOW });
  assert.equal(await prisma.job.count({ where: { source: MARK, title: 'No fav' } }), 0);
});
