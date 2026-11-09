import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../../shared/db/prisma.js';
import { runScan, startScan, LOCK_MINUTES, MAX_SCAN_MINUTES } from '../scan.service.js';

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
const noClean = async () => {}; // the real cleanup is tested in cleanup.service.test.js
const noMatch = async () => {}; // the real scoring is tested in match.service.test.js

beforeEach(async () => {
  await clean();
  // Only a STUCK scan (RUNNING for over 2 minutes, e.g. the server was killed) is removed, because it
  // would block these tests. A scan that is running right now (they last about 15 seconds) is left alone.
  await prisma.scanRun.deleteMany({
    where: { status: 'RUNNING', startedAt: { lt: new Date(Date.now() - 2 * 60 * 1000) } },
  });
});
after(async () => {
  await clean();
  await prisma.$disconnect();
});

test('a good scan is saved as SUCCESS with counts per source', async () => {
  const result = await runScan('test-a', { collectors: [okSource('a'), okSource('b')], save: fakeSave, clean: noClean, match: noMatch });
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
  const result = await runScan('test-b', { collectors: [brokenSource('bad'), okSource('good')], save: fakeSave, clean: noClean, match: noMatch });
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.newJobs, 2);
  assert.equal(result.perSource.bad.error, 'site is down');
  assert.equal(result.perSource.good.found, 3);
});

test('every source broken gives FAILED', async () => {
  const result = await runScan('test-c', { collectors: [brokenSource('x'), brokenSource('y')], save: fakeSave, clean: noClean, match: noMatch });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.newJobs, 0);
});

test('a scan is SKIPPED while another one is running', async () => {
  await prisma.scanRun.create({ data: { trigger: 'test-d', status: 'RUNNING' } });
  let collected = false;
  const spy = { name: 'spy', enabled: true, collect: async () => ((collected = true), []) };

  const result = await runScan('test-d2', { collectors: [spy], save: fakeSave, clean: noClean, match: noMatch });
  assert.equal(result.status, 'SKIPPED');
  assert.equal(collected, false);
  const row = await prisma.scanRun.findUnique({ where: { id: result.runId } });
  assert.equal(row.status, 'SKIPPED');
});

test(`a RUNNING scan older than ${LOCK_MINUTES} minutes is dead: it is closed and a new scan runs`, async () => {
  const old = await prisma.scanRun.create({
    data: { trigger: 'test-e', status: 'RUNNING', startedAt: new Date(Date.now() - (LOCK_MINUTES + 5) * 60 * 1000) },
  });

  const result = await runScan('test-e2', { collectors: [okSource('a')], save: fakeSave, clean: noClean, match: noMatch });
  assert.equal(result.status, 'SUCCESS');
  const closed = await prisma.scanRun.findUnique({ where: { id: old.id } });
  assert.equal(closed.status, 'FAILED');
  assert.ok(closed.finishedAt);
});

test('two scans started together: only one runs', async () => {
  const slow = { name: 'slow', enabled: true, collect: async () => (await new Promise((r) => setTimeout(r, 200)), []) };
  const [one, two] = await Promise.all([
    runScan('test-f1', { collectors: [slow], save: fakeSave, clean: noClean, match: noMatch }),
    runScan('test-f2', { collectors: [slow], save: fakeSave, clean: noClean, match: noMatch }),
  ]);
  assert.deepEqual([one.status, two.status].sort(), ['SKIPPED', 'SUCCESS']);
});

test('if saving crashes, the run is closed as FAILED and the error goes up', async () => {
  const crash = async () => {
    throw new Error('db exploded');
  };
  // a crash inside one source is caught per source, so break the run itself with a bad collector list
  await assert.rejects(runScan('test-g', { collectors: null, save: crash, clean: noClean, match: noMatch }));
  const row = await prisma.scanRun.findFirst({ where: { trigger: 'test-g' } });
  assert.equal(row.status, 'FAILED');
});

test('cleanup runs after a finished scan, but not when the scan is skipped', async () => {
  let cleaned = 0;
  const clean = async () => (cleaned += 1);

  await runScan('test-h', { collectors: [okSource('a')], save: fakeSave, clean });
  assert.equal(cleaned, 1);

  await prisma.scanRun.create({ data: { trigger: 'test-h2', status: 'RUNNING' } });
  await runScan('test-h3', { collectors: [okSource('a')], save: fakeSave, clean });
  assert.equal(cleaned, 1);
});

test('a cleanup that crashes does not change the scan result', async () => {
  const clean = async () => {
    throw new Error('cleanup broke');
  };
  const result = await runScan('test-i', { collectors: [okSource('a')], save: fakeSave, clean });
  assert.equal(result.status, 'SUCCESS');
  const row = await prisma.scanRun.findUnique({ where: { id: result.runId } });
  assert.equal(row.status, 'SUCCESS');
});

test('startScan answers at once with the run id, the scan finishes later', async () => {
  const slow = { name: 'slow', enabled: true, collect: async () => (await new Promise((r) => setTimeout(r, 150)), []) };
  const started = await startScan('test-j', { collectors: [slow], save: fakeSave, clean: noClean, match: noMatch });
  assert.equal(started.status, 'started');

  const running = await prisma.scanRun.findUnique({ where: { id: started.runId } });
  assert.equal(running.status, 'RUNNING');

  const result = await started.done;
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.runId, started.runId);
});

test('startScan says "skipped" when another scan is running', async () => {
  await prisma.scanRun.create({ data: { trigger: 'test-k', status: 'RUNNING' } });
  const started = await startScan('test-k2', { collectors: [okSource('a')], save: fakeSave, clean: noClean, match: noMatch });
  assert.equal(started.status, 'skipped');
  const row = await prisma.scanRun.findUnique({ where: { id: started.runId } });
  assert.equal(row.status, 'SKIPPED');
  assert.ok(row.finishedAt >= row.startedAt);
});

test('a scan that runs too long stops starting new sources and ends as PARTIAL', async () => {
  assert.equal(MAX_SCAN_MINUTES < LOCK_MINUTES, true);
  const slow = { name: 'slow', enabled: true, collect: async () => (await new Promise((r) => setTimeout(r, 120)), [{}]) };
  let secondRan = false;
  const second = { name: 'second', enabled: true, collect: async () => ((secondRan = true), [{}]) };

  // maxMinutes 0.001 = 60 ms: the first source passes the check, the second one is too late
  const result = await runScan('test-l', { collectors: [slow, second], save: fakeSave, clean: noClean, match: noMatch, maxMinutes: 0.001 });
  assert.equal(result.status, 'PARTIAL');
  assert.equal(secondRan, false);
  assert.match(result.perSource.second.error, /too long/);
  assert.equal(result.perSource.slow.found, 1);
});

test('new jobs are scored after a scan, from a little before the scan started', async () => {
  const calls = [];
  const match = async (args) => calls.push(args);
  const before = Date.now();
  await runScan('test-m', { collectors: [okSource('a')], save: fakeSave, clean: noClean, match });
  assert.equal(calls.length, 1);
  const since = calls[0].since.getTime();
  assert.ok(since < before && since > before - 10 * 60 * 1000, 'since is a few minutes before the scan');
});

test('no new jobs means no scoring', async () => {
  const calls = [];
  const noNew = async (jobs) => ({ received: jobs.length, inserted: 0, duplicates: jobs.length, invalid: 0, skipped: 0 });
  await runScan('test-n', { collectors: [okSource('a')], save: noNew, clean: noClean, match: async () => calls.push(1) });
  assert.equal(calls.length, 0);
});

test('a scoring error does not change the scan result', async () => {
  const match = async () => {
    throw new Error('scoring broke');
  };
  const result = await runScan('test-o', { collectors: [okSource('a')], save: fakeSave, clean: noClean, match });
  assert.equal(result.status, 'SUCCESS');
  const row = await prisma.scanRun.findUnique({ where: { id: result.runId } });
  assert.equal(row.status, 'SUCCESS');
});
