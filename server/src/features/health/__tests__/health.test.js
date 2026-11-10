import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../../../app.js';
import { prisma } from '../../../shared/db/prisma.js';
import { listen } from '../../../shared/testing/listen.js';

after(async () => {
  await prisma.$disconnect();
});

test('GET /api/health returns { ok: true, db: "up" }', async () => {
  const server = await listen(app);
  const { port } = server.address();

  try {
    const res = await fetch(`http://localhost:${port}/api/health`);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true, db: 'up' });
  } finally {
    server.close();
  }
});
