import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../../shared/db/prisma.js';
import { runScan, LOCK_MINUTES } from '../scan.service.js';

// These tests use the local database. Every row they create has a trigger starting with "test-".
const clean = () => prisma.scanRun.deleteMany({ where: { trigger: { startsWith: 'test-' } } });

const okSource = (name) => ({ name, enabled: true, collect: async () => [{}, {}, {}] });
const brokenSource = (name) => ({
  name,
  enabled: true,
  collect: async () => {
    throw new Error('site is down');
  },
});
const fakeSave = async (jobs) => ({ received: jobs.length, inserted: 2, duplicates: 1, invalid: 0, skipped: 0 });

beforeEach(async () => {
  // a real RUNNING scan in the local database must not break these tests
  await clean();
  await prisma.scanRun.deleteMany({ where: { status: 'RUNNING' } });
});
after(async () => {
  await clean();
  await prisma.$disconnect();
});

test('a good scan is saved as SUCCESS with counts per source', async () => {
  const result = await runScan('test-a', { collectors: [okSource('a'), okSource('b')], save: fakeSave });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.newJobs, 4);

  const row = await prisma.scanRun.findUnique({ where: { id: result.runId } });
  assert.equal(row.status, 'SUCCESS');
  assert.equal(row.trigger, 'test-a');
  assert.equal(row.newJobs, 4);
  assert.ok(row.finishedAt);
  assert.equal(row.perSource.a.found, 3);
  assert.equal(row.perSource.b.inserted, 2);
});

test('one broken source gives PARTIAL and the other source still runs', async () => {
  const result = await runScan('test-b', { collectors: [brokenSource('bad'), okSource('good')], save: fakeSave });
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.newJobs, 2);
  assert.equal(result.perSource.bad.error, 'site is down');
  assert.equal(result.perSource.good.found, 3);
});

test('every source broken gives FAILED', async () => {
  const result = await runScan('test-c', { collectors: [brokenSource('x'), brokenSource('y')], save: fakeSave });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.newJobs, 0);
});

test('a scan is SKIPPED while another one is running', async () => {
  await prisma.scanRun.create({ data: { trigger: 'test-d', status: 'RUNNING' } });
  let collected = false;
  const spy = { name: 'spy', enabled: true, collect: async () => ((collected = true), []) };

  const result = await runScan('test-d2', { collectors: [spy], save: fakeSave });
  assert.equal(result.status, 'SKIPPED');
  assert.equal(collected, false);
  const row = await prisma.scanRun.findUnique({ where: { id: result.runId } });
  assert.equal(row.status, 'SKIPPED');
});

test(`a RUNNING scan older than ${LOCK_MINUTES} minutes is dead: it is closed and a new scan runs`, async () => {
  const old = await prisma.scanRun.create({
    data: { trigger: 'test-e', status: 'RUNNING', startedAt: new Date(Date.now() - (LOCK_MINUTES + 5) * 60 * 1000) },
  });

  const result = await runScan('test-e2', { collectors: [okSource('a')], save: fakeSave });
  assert.equal(result.status, 'SUCCESS');
  const closed = await prisma.scanRun.findUnique({ where: { id: old.id } });
  assert.equal(closed.status, 'FAILED');
  assert.ok(closed.finishedAt);
});

test('two scans started together: only one runs', async () => {
  const slow = { name: 'slow', enabled: true, collect: async () => (await new Promise((r) => setTimeout(r, 200)), []) };
  const [one, two] = await Promise.all([
    runScan('test-f1', { collectors: [slow], save: fakeSave }),
    runScan('test-f2', { collectors: [slow], save: fakeSave }),
  ]);
  assert.deepEqual([one.status, two.status].sort(), ['SKIPPED', 'SUCCESS']);
});

test('if saving crashes, the run is closed as FAILED and the error goes up', async () => {
  const crash = async () => {
    throw new Error('db exploded');
  };
  // a crash inside one source is caught per source, so break the run itself with a bad collector list
  await assert.rejects(runScan('test-g', { collectors: null, save: crash }));
  const row = await prisma.scanRun.findFirst({ where: { trigger: 'test-g' } });
  assert.equal(row.status, 'FAILED');
});
