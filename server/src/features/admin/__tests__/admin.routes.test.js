import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import app from '../../../app.js';
import { requireRole } from '../../../shared/middleware/requireRole.js';
import { buildAdminRouter } from '../admin.routes.js';
import { buildAdminController } from '../admin.controller.js';
import { listen } from '../../../shared/testing/listen.js';

// pretend a user with this role is logged in (no database, no cookie needed)
const loginAs = (role) => [
  (req, res, next) => {
    req.user = { id: `user-${role}`, role };
    next();
  },
  requireRole('ADMIN'),
];

// A fake startScan: calls onStart(trigger) and answers like the real one.
const fakeStart =
  (onStart = () => {}, { status = 'started', done = Promise.resolve() } = {}) =>
  async (trigger) => {
    onStart(trigger);
    // `done` can be a function, so a rejecting promise is only created when the request arrives
    return { runId: 'run-1', status, done: typeof done === 'function' ? done() : done };
  };

async function withServer(router, fn) {
  const server = await listen(express().use(express.json()).use('/api/admin', router));
  const base = `http://localhost:${server.address().port}/api/admin`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('not logged in: 401 on every route (real app)', async () => {
  const server = await listen(app);
  const base = `http://localhost:${server.address().port}/api/admin`;
  try {
    assert.equal((await fetch(`${base}/scan-runs`)).status, 401);
    assert.equal((await fetch(`${base}/scan`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${base}/db-size`)).status, 401);
  } finally {
    server.close();
  }
});

test('USER and DEMO get 403 and no scan starts', async () => {
  for (const role of ['USER', 'DEMO']) {
    let started = false;
    const controller = buildAdminController({
      start: fakeStart(() => (started = true)),
      list: async () => [],
    });
    await withServer(buildAdminRouter({ guard: loginAs(role), controller }), async (base) => {
      assert.equal((await fetch(`${base}/scan`, { method: 'POST' })).status, 403, role);
      assert.equal((await fetch(`${base}/scan-runs`)).status, 403, role);
      assert.equal((await fetch(`${base}/db-size`)).status, 403, role);
    });
    assert.equal(started, false);
  }
});

test('admin: POST /scan returns 202 with the run id and starts a "manual" scan', async () => {
  const calls = [];
  const controller = buildAdminController({ start: fakeStart((t) => calls.push(t)), list: async () => [] });
  await withServer(buildAdminRouter({ guard: loginAs('ADMIN'), controller }), async (base) => {
    const res = await fetch(`${base}/scan`, { method: 'POST' });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { status: 'started', runId: 'run-1' });
  });
  assert.deepEqual(calls, ['manual']);
});

test('admin: another scan is running, so the answer says "skipped"', async () => {
  const controller = buildAdminController({ start: fakeStart(() => {}, { status: 'skipped' }) });
  await withServer(buildAdminRouter({ guard: loginAs('ADMIN'), controller }), async (base) => {
    const res = await fetch(`${base}/scan`, { method: 'POST' });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { status: 'skipped', runId: 'run-1' });
  });
});

test('admin: 202 comes back before the scan is finished', async () => {
  let finished = false;
  const done = new Promise((resolve) => setTimeout(resolve, 300)).then(() => (finished = true));
  const controller = buildAdminController({ start: fakeStart(() => {}, { done }) });
  await withServer(buildAdminRouter({ guard: loginAs('ADMIN'), controller }), async (base) => {
    assert.equal((await fetch(`${base}/scan`, { method: 'POST' })).status, 202);
    assert.equal(finished, false);
  });
});

test('admin: GET /scan-runs returns the history, limit defaults to 20 and is checked', async () => {
  const limits = [];
  const rows = [{ id: 'r1', trigger: 'cron', status: 'SUCCESS' }];
  const controller = buildAdminController({
    start: fakeStart(),
    list: async (limit) => (limits.push(limit), rows),
  });
  await withServer(buildAdminRouter({ guard: loginAs('ADMIN'), controller }), async (base) => {
    const res = await fetch(`${base}/scan-runs`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { runs: rows });

    assert.equal((await fetch(`${base}/scan-runs?limit=5`)).status, 200);
    assert.equal((await fetch(`${base}/scan-runs?limit=0`)).status, 400);
    assert.equal((await fetch(`${base}/scan-runs?limit=101`)).status, 400);
    assert.equal((await fetch(`${base}/scan-runs?limit=abc`)).status, 400);
  });
  assert.deepEqual(limits, [20, 5]);
});

test('a scan that crashes does not break the 202', async () => {
  const controller = buildAdminController({
    start: fakeStart(() => {}, { done: () => Promise.reject(new Error('boom')) }),
    list: async () => [],
  });
  await withServer(buildAdminRouter({ guard: loginAs('ADMIN'), controller }), async (base) => {
    assert.equal((await fetch(`${base}/scan`, { method: 'POST' })).status, 202);
  });
});

test('admin: GET /db-size returns what the service gives', async () => {
  const answer = { totalMb: 12.5, tables: [] };
  const controller = buildAdminController({ dbSize: async () => answer });
  await withServer(buildAdminRouter({ guard: loginAs('ADMIN'), controller }), async (base) => {
    const res = await fetch(`${base}/db-size`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), answer);
  });
});
