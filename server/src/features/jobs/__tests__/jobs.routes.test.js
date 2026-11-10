import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import app from '../../../app.js';
import { buildJobsRouter } from '../jobs.routes.js';
import { buildJobsController } from '../jobs.controller.js';
import { listen } from '../../../shared/testing/listen.js';

// pretend a user is logged in (no database, no cookie needed)
const loginAs = (id) => [
  (req, res, next) => {
    req.user = { id, role: 'USER' };
    next();
  },
];

async function withServer(router, fn) {
  const server = await listen(express().use(express.json()).use('/api/jobs', router));
  try {
    await fn(`http://localhost:${server.address().port}/api/jobs`);
  } finally {
    server.close();
  }
}

test('not logged in: 401 (real app)', async () => {
  const server = await listen(app);
  try {
    const res = await fetch(`http://localhost:${server.address().port}/api/jobs`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('the list gets the logged-in user id and the checked query', async () => {
  const calls = [];
  const list = async (userId, query) => {
    calls.push({ userId, query });
    return { jobs: [], page: query.page, limit: query.limit, total: 0, pages: 0 };
  };
  const router = buildJobsRouter({ guard: loginAs('user-1'), controller: buildJobsController({ list }) });

  await withServer(router, async (base) => {
    const res = await fetch(`${base}?since=7d&level=junior,mid&minScore=50&limit=5&userId=hacker`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { jobs: [], page: 1, limit: 5, total: 0, pages: 0 });
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].userId, 'user-1'); // always the logged-in user, never one from the URL
  assert.deepEqual(calls[0].query, { since: '7d', level: ['JUNIOR', 'MID'], minScore: 50, favOnly: false, page: 1, limit: 5 });
});

test('one job: 200 with the job, 404 when it does not exist; the user is the logged-in one', async () => {
  const calls = [];
  const get = async (userId, id) => {
    calls.push({ userId, id });
    return id === 'j1' ? { id: 'j1', title: 'Dev', match: null } : null;
  };
  const router = buildJobsRouter({ guard: loginAs('user-1'), controller: buildJobsController({ get }) });

  await withServer(router, async (base) => {
    const ok = await fetch(`${base}/j1`);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { job: { id: 'j1', title: 'Dev', match: null } });

    const missing = await fetch(`${base}/nope`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'Job not found' });
  });
  assert.deepEqual(calls, [{ userId: 'user-1', id: 'j1' }, { userId: 'user-1', id: 'nope' }]);
});

test('one job: not logged in gives 401 (real app)', async () => {
  const server = await listen(app);
  try {
    const res = await fetch(`http://localhost:${server.address().port}/api/jobs/any-id`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('a bad filter gets 400 with the field name, and the list is not called', async () => {
  let called = false;
  const list = async () => {
    called = true;
    return {};
  };
  const router = buildJobsRouter({ guard: loginAs('user-1'), controller: buildJobsController({ list }) });

  await withServer(router, async (base) => {
    for (const bad of ['since=yesterday', 'level=BOSS', 'minScore=500', 'limit=1000', 'years=abc']) {
      const res = await fetch(`${base}?${bad}`);
      assert.equal(res.status, 400, bad);
      const body = await res.json();
      assert.equal(body.error, 'Validation failed');
      // a bad item inside a list is reported as "level.0" (the first item)
      assert.equal(body.details[0].field.split('.')[0], bad.split('=')[0]);
    }
  });
  assert.equal(called, false);
});
