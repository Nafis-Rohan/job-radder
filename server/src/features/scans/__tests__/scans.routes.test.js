import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import app from '../../../app.js';
import { prisma } from '../../../shared/db/prisma.js';
import { buildLatest, getLatestScan } from '../latestScan.service.js';
import { buildScansRouter } from '../scans.routes.js';

const NOW = new Date('2026-11-10T12:00:00Z');
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60 * 1000);

after(() => prisma.$disconnect());

// ---- pure part ----
test('buildLatest: no scan yet gives nulls', () => {
  assert.deepEqual(buildLatest(null, null, NOW), { scan: null, lastSuccessAt: null });
});

test('buildLatest: a finished scan and the time of the last good one', () => {
  const scan = { status: 'FAILED', startedAt: minutesAgo(20), finishedAt: minutesAgo(19), newJobs: 0 };
  const good = { finishedAt: minutesAgo(400) };
  assert.deepEqual(buildLatest(scan, good, NOW), { scan, lastSuccessAt: good.finishedAt });
});

test('buildLatest: a scan still RUNNING is shown as running; an old one is dead and shown as FAILED', () => {
  const running = { status: 'RUNNING', startedAt: minutesAgo(5), finishedAt: null, newJobs: 0 };
  assert.equal(buildLatest(running, null, NOW).scan.status, 'RUNNING');
  const dead = { ...running, startedAt: minutesAgo(31) };
  assert.equal(buildLatest(dead, null, NOW).scan.status, 'FAILED');
});

// ---- database part: the scan table is shared with other tests, so only the shape is checked ----
test('getLatestScan reads the real database and shows only safe fields', async () => {
  const { scan, lastSuccessAt } = await getLatestScan();
  assert.ok(scan === null || typeof scan.status === 'string');
  if (scan) {
    assert.deepEqual(Object.keys(scan).sort(), ['finishedAt', 'newJobs', 'startedAt', 'status']);
    assert.notEqual(scan.status, 'SKIPPED');
  }
  assert.ok(lastSuccessAt === null || lastSuccessAt instanceof Date);
});

// ---- routes ----
test('not logged in: 401 (real app)', async () => {
  const server = app.listen(0);
  try {
    const res = await fetch(`http://localhost:${server.address().port}/api/scans/latest`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('logged in: 200 with what the service returns', async () => {
  const answer = { scan: { status: 'SUCCESS', startedAt: '2026-11-10T06:00:00.000Z', finishedAt: '2026-11-10T06:01:00.000Z', newJobs: 3 }, lastSuccessAt: '2026-11-10T06:01:00.000Z' };
  const guard = [(req, res, next) => { req.user = { id: 'u', role: 'USER' }; next(); }];
  const router = buildScansRouter({ guard, latest: async () => answer });
  const server = express().use('/api/scans', router).listen(0);
  try {
    const res = await fetch(`http://localhost:${server.address().port}/api/scans/latest`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), answer);
  } finally {
    server.close();
  }
});
