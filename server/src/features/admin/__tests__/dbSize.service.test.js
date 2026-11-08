import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../../shared/db/prisma.js';
import { buildDbSize, getDbSize, DB_LIMIT_BYTES } from '../dbSize.service.js';

after(async () => {
  await prisma.$disconnect();
});

const MB = 1024 * 1024;

test('buildDbSize: MB, percent of the limit, tables biggest first', () => {
  const result = buildDbSize({
    totalBytes: 51.2 * MB,
    limitBytes: 512 * MB,
    tables: [
      { table: 'User', rows: 2, bytes: 1 * MB },
      { table: 'Job', rows: 900, bytes: 6 * MB },
    ],
  });
  assert.equal(result.totalMb, 51.2);
  assert.equal(result.limitMb, 512);
  assert.equal(result.percentUsed, 10);
  assert.deepEqual(result.tables.map((t) => t.table), ['Job', 'User']);
  assert.deepEqual(result.tables[0], { table: 'Job', rows: 900, bytes: 6 * MB, mb: 6 });
});

test('the limit is 0.5 GB', () => {
  assert.equal(DB_LIMIT_BYTES, 512 * MB);
});

test('getDbSize reads the real database', async () => {
  const result = await getDbSize();

  // the total must match an independent size query (other tests write at the same time, so allow 5 MB)
  const [{ bytes }] = await prisma.$queryRaw`SELECT pg_database_size(current_database())::float8 AS bytes`;
  assert.ok(Math.abs(result.totalBytes - bytes) < 5 * MB, `total ${result.totalBytes} vs ${bytes}`);

  // the percent and MB values must follow from the total and the limit
  assert.equal(result.percentUsed, Math.round((result.totalBytes / DB_LIMIT_BYTES) * 1000) / 10);
  assert.equal(result.limitMb, 512);
  assert.equal(result.totalMb, Math.round((result.totalBytes / MB) * 100) / 100);

  const names = result.tables.map((t) => t.table);
  for (const name of ['Job', 'User', 'ScanRun', 'LoginEvent', 'Cv']) {
    assert.ok(names.includes(name), `missing table ${name}`);
  }
  const job = result.tables.find((t) => t.table === 'Job');
  assert.equal(job.rows, await prisma.job.count());
  // biggest first
  const sizes = result.tables.map((t) => t.bytes);
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a));
});
