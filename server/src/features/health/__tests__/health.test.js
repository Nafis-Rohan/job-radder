import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../../../app.js';

test('GET /api/health returns { ok: true }', async () => {
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const res = await fetch(`http://localhost:${port}/api/health`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true });
  } finally {
    server.close();
  }
});
