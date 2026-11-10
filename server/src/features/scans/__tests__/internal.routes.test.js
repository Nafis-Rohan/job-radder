import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { buildInternalRouter } from '../internal.routes.js';
import { secretMatches } from '../../../shared/middleware/cronAuth.js';
import { listen } from '../../../shared/testing/listen.js';

const SECRET = 'a'.repeat(40);

// A fake startScan: remembers the trigger and answers like the real one.
const fakeStart = (calls = [], { status = 'started', done = Promise.resolve() } = {}) => {
  return async (trigger) => {
    calls.push(trigger);
    // `done` can be a function, so a rejecting promise is only created when the request arrives
    return { runId: 'run-1', status, done: typeof done === 'function' ? done() : done };
  };
};

// a small app with the internal router and a fake scan, so no database or network is needed
async function withServer(options, fn) {
  const app = express();
  app.use('/api/internal', buildInternalRouter(options));
  const server = await listen(app);
  const base = `http://localhost:${server.address().port}/api/internal`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

const post = (base, headers = {}) => fetch(`${base}/scan`, { method: 'POST', headers });

test('secretMatches: only the exact secret passes', () => {
  assert.equal(secretMatches(SECRET, SECRET), true);
  assert.equal(secretMatches('b'.repeat(40), SECRET), false);
  assert.equal(secretMatches(SECRET.slice(1), SECRET), false);
  assert.equal(secretMatches('', SECRET), false);
  assert.equal(secretMatches(undefined, SECRET), false);
  assert.equal(secretMatches(SECRET, undefined), false); // no secret configured
  assert.equal(secretMatches('', ''), false);
});

test('right secret: 202, the run id, and the scan starts with trigger "cron"', async () => {
  const calls = [];
  await withServer({ secret: SECRET, start: fakeStart(calls) }, async (base) => {
    const res = await post(base, { 'X-Cron-Secret': SECRET });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { status: 'started', runId: 'run-1' });
  });
  assert.deepEqual(calls, ['cron']);
});

test('another scan is running: still 202, but the status says "skipped"', async () => {
  await withServer({ secret: SECRET, start: fakeStart([], { status: 'skipped' }) }, async (base) => {
    const res = await post(base, { 'X-Cron-Secret': SECRET });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { status: 'skipped', runId: 'run-1' });
  });
});

test('202 comes back before the scan is finished', async () => {
  let finished = false;
  const done = new Promise((resolve) => setTimeout(resolve, 300)).then(() => (finished = true));
  await withServer({ secret: SECRET, start: fakeStart([], { done }) }, async (base) => {
    const res = await post(base, { 'X-Cron-Secret': SECRET });
    assert.equal(res.status, 202);
    assert.equal(finished, false);
  });
});

test('wrong or missing secret: 401 and no scan', async () => {
  const calls = [];
  await withServer({ secret: SECRET, start: fakeStart(calls) }, async (base) => {
    assert.equal((await post(base, { 'X-Cron-Secret': 'b'.repeat(40) })).status, 401);
    assert.equal((await post(base)).status, 401);
    assert.equal((await post(base, { 'X-Cron-Secret': '' })).status, 401);
  });
  assert.deepEqual(calls, []);
});

test('no secret configured: even a header is rejected', async () => {
  const calls = [];
  await withServer({ secret: undefined, start: fakeStart(calls) }, async (base) => {
    assert.equal((await post(base, { 'X-Cron-Secret': SECRET })).status, 401);
  });
  assert.deepEqual(calls, []);
});

test('a scan that crashes does not break the 202', async () => {
  const done = () => Promise.reject(new Error('boom'));
  await withServer({ secret: SECRET, start: fakeStart([], { done }) }, async (base) => {
    assert.equal((await post(base, { 'X-Cron-Secret': SECRET })).status, 202);
  });
});

test('calls with the right secret are limited too, and wrong guesses do not use up the limit', async () => {
  const calls = [];
  await withServer({ secret: SECRET, start: fakeStart(calls), callLimit: 3 }, async (base) => {
    for (let i = 0; i < 5; i += 1) await post(base, { 'X-Cron-Secret': 'wrong' }); // 5 wrong guesses
    const statuses = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await post(base, { 'X-Cron-Secret': SECRET })).status);
    assert.deepEqual(statuses, [202, 202, 202, 429, 429]);
  });
  assert.equal(calls.length, 3);
});
