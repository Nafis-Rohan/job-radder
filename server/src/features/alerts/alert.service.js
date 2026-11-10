import { env } from '../../shared/config/env.js';
import { prisma } from '../../shared/db/prisma.js';
import { logger } from '../../shared/utils/logger.js';
import { sleep } from '../../shared/utils/sleep.js';
import { buildCompanyMatcher } from '../companies/companyMatcher.js';
import { sendTelegram } from './telegram.service.js';
import { formatOpeningMessage, formatSummaryMessage } from './alertMessage.js';

// One Telegram message per new job of a favorite company (no score, any role).
// - Only jobs found since `since` (the current scan). Old jobs, and the old jobs of a favorite added later, stay quiet.
// - "Alert sent" is a FavoriteAlert row (user + job, unique). The row is saved BEFORE the message is sent (claim),
//   so the same job can never be sent twice, even if two runs overlap. If the send fails, the row is removed again.
// - A problem with one user's Telegram never stops the others, and nothing here throws (the scan must not fail).

export const MAX_ALERTS_PER_USER = 10; // more than this in one scan: the rest goes into ONE summary message
export const PAUSE_MS = 1000; // about 1 message per second (Telegram's limit for one chat)
const MAX_NEW_JOBS = 2000; // safety cap on how many new jobs one run looks at

// Saves the "alert sent" row. false = it already exists (or the job was just deleted): do not send.
async function claim(userId, jobId) {
  try {
    await prisma.favoriteAlert.create({ data: { userId, jobId } });
    return true;
  } catch (err) {
    if (err.code === 'P2002' || err.code === 'P2003') return false;
    throw err;
  }
}

const release = (userId, jobIds) => prisma.favoriteAlert.deleteMany({ where: { userId, jobId: { in: jobIds } } });

// Sends the alerts of one user. Returns { sent, failed }.
async function alertUser(user, jobs, { send, pause }) {
  const isFavorite = buildCompanyMatcher(user.favorites);
  const mine = jobs.filter((job) => isFavorite(job.company));
  if (mine.length === 0) return { sent: 0, failed: 0 };

  const done = await prisma.favoriteAlert.findMany({
    where: { userId: user.id, jobId: { in: mine.map((j) => j.id) } },
    select: { jobId: true },
  });
  const already = new Set(done.map((a) => a.jobId));
  const todo = mine.filter((job) => !already.has(job.id));

  const now = todo.slice(0, MAX_ALERTS_PER_USER);
  const rest = todo.slice(MAX_ALERTS_PER_USER);
  let sent = 0;

  for (const job of now) {
    if (!(await claim(user.id, job.id))) continue;
    try {
      if (sent > 0) await pause(PAUSE_MS);
      await send(user.telegramChatId, formatOpeningMessage(job));
      sent += 1;
    } catch (err) {
      await release(user.id, [job.id]);
      // the chat id is personal: never logged. TelegramError messages never contain the token.
      logger.warn({ userId: user.id, errMessage: err.message }, 'Telegram alert failed, user skipped for this scan');
      return { sent, failed: 1 };
    }
  }

  if (rest.length > 0) {
    const { count } = await prisma.favoriteAlert.createMany({
      data: rest.map((job) => ({ userId: user.id, jobId: job.id })),
      skipDuplicates: true,
    });
    if (count > 0) {
      try {
        await pause(PAUSE_MS);
        await send(user.telegramChatId, formatSummaryMessage(count));
        sent += 1;
      } catch (err) {
        await release(user.id, rest.map((job) => job.id));
        logger.warn({ userId: user.id, errMessage: err.message }, 'Telegram summary failed, user skipped for this scan');
        return { sent, failed: 1 };
      }
    }
  }
  return { sent, failed: 0 };
}

// Called at the end of each scan. `since` = a little before the scan started.
// `send`, `pause` and `token` can be replaced in tests (no real Telegram call).
// Returns { sent, failed }. Never throws.
export async function sendFavoriteAlerts({ since, send = sendTelegram, pause = sleep, hasToken = Boolean(env.TELEGRAM_BOT_TOKEN) }) {
  const result = { sent: 0, failed: 0 };
  try {
    if (!hasToken) {
      logger.info('Telegram alerts skipped: TELEGRAM_BOT_TOKEN is not set');
      return result;
    }

    // users who can get an alert: a chat id and at least one favorite (the demo user never gets Telegram messages)
    const users = await prisma.user.findMany({
      where: { telegramChatId: { not: null }, role: { not: 'DEMO' }, favorites: { some: {} } },
      select: { id: true, telegramChatId: true, favorites: { select: { name: true, aliases: true } } },
    });
    if (users.length === 0) return result;

    const jobs = await prisma.job.findMany({
      where: { foundAt: { gte: since } },
      select: { id: true, title: true, company: true, location: true, deadline: true, url: true },
      orderBy: [{ foundAt: 'asc' }, { id: 'asc' }],
      take: MAX_NEW_JOBS,
    });
    if (jobs.length === 0) return result;

    for (const user of users) {
      try {
        const one = await alertUser(user, jobs, { send, pause });
        result.sent += one.sent;
        result.failed += one.failed;
      } catch (err) {
        result.failed += 1;
        logger.error({ userId: user.id, errMessage: err.message }, 'Favorite alerts failed for one user');
      }
    }
    logger.info(result, 'Favorite alerts done');
  } catch (err) {
    result.failed += 1;
    logger.error({ errMessage: err.message }, 'Favorite alerts failed');
  }
  return result;
}
