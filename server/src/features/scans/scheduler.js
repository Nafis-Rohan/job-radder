import cron from 'node-cron';
import { env } from '../../shared/config/env.js';
import { logger } from '../../shared/utils/logger.js';
import { runScan } from './scan.service.js';

// SCAN_INTERVAL_HOURS -> a cron expression.
//   less than 1 hour  -> every N minutes (so 0.05 = every 3 minutes, handy for testing)
//   1 to 23 hours     -> every N hours, on the hour (6 = 00:00, 06:00, 12:00, 18:00)
//   24 hours or more  -> once a day at midnight
export function cronExpression(hours) {
  const minutes = Math.max(1, Math.round(hours * 60));
  if (minutes < 60) return `*/${minutes} * * * *`;
  const wholeHours = Math.round(minutes / 60);
  if (wholeHours >= 24) return '0 0 * * *';
  return `0 */${wholeHours} * * *`;
}

// Starts the timer. Does not scan at start-up; the first scan happens at the next tick.
// `run` can be replaced in tests.
export function startScheduler({ hours = env.SCAN_INTERVAL_HOURS, run = runScan } = {}) {
  const expression = cronExpression(hours);
  const task = cron.schedule(expression, async () => {
    try {
      await run('local');
    } catch (err) {
      // a failed scan must never crash the server
      logger.error({ errMessage: err.message }, 'Scheduled scan crashed');
    }
  });
  logger.info({ expression }, 'Scan scheduler started');
  return task;
}
