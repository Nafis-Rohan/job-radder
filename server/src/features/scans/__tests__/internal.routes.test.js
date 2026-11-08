import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { buildInternalRouter } from '../internal.routes.js';
import { secretMatches } from '../../../shared/middleware/cronAuth.js';

const SECRET = 'a'.repeat(40);

// a small app with the internal router and a fake scan, so no database or network is needed
async function withServer(options, fn) {
  const app = express();
  app.use('/api/internal', buildInternalRouter(options));
  const server = app.listen(0);
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

test('right secret: 202 and the scan starts with trigger "cron"', async () => {
  const calls = [];
  await withServer({ secret: SECRET, run: async (trigger) => calls.push(trigger) }, async (base) => {
    const res = await post(base, { 'X-Cron-Secret': SECRET });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { status: 'started' });
  });
  assert.deepEqual(calls, ['cron']);
});

test('202 comes back before the scan is finished', async () => {
  let finished = false;
  const slowScan = async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    finished = true;
  };
  await withServer({ secret: SECRET, run: slowScan }, async (base) => {
    const res = await post(base, { 'X-Cron-Secret': SECRET });
    assert.equal(res.status, 202);
    assert.equal(finished, false);
  });
});

test('wrong or missing secret: 401 and no scan', async () => {
  let started = false;
  await withServer({ secret: SECRET, run: async () => (started = true) }, async (base) => {
    assert.equal((await post(base, { 'X-Cron-Secret': 'b'.repeat(40) })).status, 401);
    assert.equal((await post(base)).status, 401);
    assert.equal((await post(base, { 'X-Cron-Secret': '' })).status, 401);
  });
  assert.equal(started, false);
});

test('no secret configured: even a header is rejected', async () => {
  let started = false;
  await withServer({ secret: undefined, run: async () => (started = true) }, async (base) => {
    assert.equal((await post(base, { 'X-Cron-Secret': SECRET })).status, 401);
  });
  assert.equal(started, false);
});

test('a scan that crashes does not break the 202 or the server', async () => {
  await withServer(
    { secret: SECRET, run: async () => Promise.reject(new Error('boom')) },
    async (base) => {
      assert.equal((await post(base, { 'X-Cron-Secret': SECRET })).status, 202);
    },
  );
});
