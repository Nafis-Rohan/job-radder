import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import app from '../../../app.js';
import { requireRole } from '../../../shared/middleware/requireRole.js';
import { buildAdminRouter } from '../admin.routes.js';
import { buildAdminController } from '../admin.controller.js';

// pretend a user with this role is logged in (no database, no cookie needed)
const loginAs = (role) => [
  (req, res, next) => {
    req.user = { id: `user-${role}`, role };
    next();
  },
  requireRole('ADMIN'),
];

async function withServer(router, fn) {
  const server = express().use(express.json()).use('/api/admin', router).listen(0);
  const base = `http://localhost:${server.address().port}/api/admin`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('not logged in: 401 on both routes (real app)', async () => {
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}/api/admin`;
  try {
    assert.equal((await fetch(`${base}/scan-runs`)).status, 401);
    assert.equal((await fetch(`${base}/scan`, { method: 'POST' })).status, 401);
  } finally {
    server.close();
  }
});

test('USER and DEMO get 403 and no scan starts', async () => {
  for (const role of ['USER', 'DEMO']) {
    let started = false;
    const controller = buildAdminController({ run: async () => (started = true), list: async () => [] });
    await withServer(buildAdminRouter({ guard: loginAs(role), controller }), async (base) => {
      assert.equal((await fetch(`${base}/scan`, { method: 'POST' })).status, 403, role);
      assert.equal((await fetch(`${base}/scan-runs`)).status, 403, role);
    });
    assert.equal(started, false);
  }
});

test('admin: POST /scan returns 202 and starts a "manual" scan', async () => {
  const calls = [];
  const controller = buildAdminController({ run: async (t) => calls.push(t), list: async () => [] });
  await withServer(buildAdminRouter({ guard: loginAs('ADMIN'), controller }), async (base) => {
    const res = await fetch(`${base}/scan`, { method: 'POST' });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { status: 'started' });
  });
  assert.deepEqual(calls, ['manual']);
});

test('admin: GET /scan-runs returns the history, limit defaults to 20 and is checked', async () => {
  const limits = [];
  const rows = [{ id: 'r1', trigger: 'cron', status: 'SUCCESS' }];
  const controller = buildAdminController({
    run: async () => {},
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
    run: async () => Promise.reject(new Error('boom')),
    list: async () => [],
  });
  await withServer(buildAdminRouter({ guard: loginAs('ADMIN'), controller }), async (base) => {
    assert.equal((await fetch(`${base}/scan`, { method: 'POST' })).status, 202);
  });
});
