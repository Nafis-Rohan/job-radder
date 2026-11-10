import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import app from '../../../app.js';
import { buildJobsRouter } from '../jobs.routes.js';
import { buildJobsController } from '../jobs.controller.js';

// pretend a user is logged in (no database, no cookie needed)
const loginAs = (id) => [
  (req, res, next) => {
    req.user = { id, role: 'USER' };
    next();
  },
];

async function withServer(router, fn) {
  const server = express().use(express.json()).use('/api/jobs', router).listen(0);
  try {
    await fn(`http://localhost:${server.address().port}/api/jobs`);
  } finally {
    server.close();
  }
}

test('not logged in: 401 (real app)', async () => {
  const server = app.listen(0);
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
  assert.deepEqual(calls[0].query, { since: '7d', level: ['JUNIOR', 'MID'], minScore: 50, page: 1, limit: 5 });
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
