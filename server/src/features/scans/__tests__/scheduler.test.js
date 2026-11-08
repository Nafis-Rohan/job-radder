import { test } from 'node:test';
import assert from 'node:assert/strict';
import cron from 'node-cron';
import { cronExpression, startScheduler } from '../scheduler.js';

test('hours become a valid cron expression', () => {
  assert.equal(cronExpression(6), '0 */6 * * *');
  assert.equal(cronExpression(1), '0 */1 * * *');
  assert.equal(cronExpression(12), '0 */12 * * *');
  assert.equal(cronExpression(24), '0 0 * * *');
  assert.equal(cronExpression(100), '0 0 * * *');
  for (const hours of [0.001, 0.05, 0.5, 1, 6, 23, 24, 48]) {
    assert.equal(cron.validate(cronExpression(hours)), true, `hours = ${hours}`);
  }
});

test('less than an hour means every N minutes', () => {
  assert.equal(cronExpression(0.5), '*/30 * * * *');
  assert.equal(cronExpression(0.05), '*/3 * * * *');
  assert.equal(cronExpression(0.001), '*/1 * * * *'); // never faster than 1 minute
});

test('the scheduler can start and stop, and does not scan at start-up', async () => {
  let calls = 0;
  const task = startScheduler({ hours: 6, run: async () => (calls += 1) });
  assert.ok(task);
  await task.stop();
  assert.equal(calls, 0);
});
