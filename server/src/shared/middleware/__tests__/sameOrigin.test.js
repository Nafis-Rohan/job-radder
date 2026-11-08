import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireSameOrigin } from '../sameOrigin.js';

const SITE = 'http://localhost:5173';

async function withServer(fn) {
  const app = express();
  app.use(requireSameOrigin([`${SITE}/`])); // a trailing slash in the setting must not matter
  app.all('/thing', (req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  try {
    await fn(`http://localhost:${server.address().port}/thing`);
  } finally {
    server.close();
  }
}

const send = (url, method, origin) =>
  fetch(url, { method, headers: origin === undefined ? {} : { Origin: origin } }).then((r) => r.status);

test('our own site may change data', async () => {
  await withServer(async (url) => {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      assert.equal(await send(url, method, SITE), 200, method);
    }
  });
});

test('another site cannot change data with our cookie', async () => {
  await withServer(async (url) => {
    for (const origin of ['https://evil.example', 'http://localhost:5174', 'http://localhost:5173.evil.com', 'null']) {
      assert.equal(await send(url, 'POST', origin), 403, origin);
      assert.equal(await send(url, 'DELETE', origin), 403, origin);
    }
  });
});

test('no Origin header (Postman, the cron service) is allowed', async () => {
  await withServer(async (url) => {
    assert.equal(await send(url, 'POST'), 200);
  });
});

test('reading (GET) is never blocked by this check', async () => {
  await withServer(async (url) => {
    assert.equal(await send(url, 'GET', 'https://evil.example'), 200);
  });
});
