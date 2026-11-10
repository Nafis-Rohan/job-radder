import { env } from '../../shared/config/env.js';
import { logger } from '../../shared/utils/logger.js';
import { sendTelegram } from './telegram.service.js';

// A Telegram message to the user on every finished login: time, IP, device.
// The IP and the browser text are personal data: they go only to the user's own Telegram chat, never to a log.
// Nothing here throws: a Telegram problem must never break a login.

// "Chrome on Windows" from a User-Agent. Only names we know are used; the raw text is never copied
// (it comes from the client, so it cannot be trusted).
export function describeDevice(userAgent) {
  const ua = typeof userAgent === 'string' ? userAgent : '';

  let browser = null;
  if (/PostmanRuntime/i.test(ua)) browser = 'Postman';
  else if (/^curl\//i.test(ua)) browser = 'curl';
  else if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = 'Safari';

  let os = null;
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}

// "::ffff:1.2.3.4" (how Node shows an IPv4 address on a dual-stack socket) -> "1.2.3.4".
// Only characters that can be in an IP address are kept.
export function cleanIp(ip) {
  const text = String(ip ?? '').replace(/^::ffff:/i, '');
  return /^[0-9a-fA-F:.]{2,45}$/.test(text) ? text : 'unknown';
}

const stamp = (date) => `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`; // 2026-11-11 00:09 UTC

export function formatLoginMessage({ ip, userAgent, now }) {
  return ['New login to JobRadar', `Time: ${stamp(now)}`, `IP: ${cleanIp(ip)}`, `Device: ${describeDevice(userAgent)}`].join('\n');
}

// user = { id, role, telegramChatId }. `send`, `hasToken` and `now` can be replaced in tests.
// Returns true when a message was sent.
export async function sendLoginAlert({
  user,
  ip,
  userAgent,
  now = new Date(),
  send = sendTelegram,
  hasToken = Boolean(env.TELEGRAM_BOT_TOKEN),
}) {
  try {
    if (!hasToken || !user?.telegramChatId || user.role === 'DEMO') return false;
    await send(user.telegramChatId, formatLoginMessage({ ip, userAgent, now }));
    return true;
  } catch (err) {
    // no chat id, IP or device in the log; TelegramError messages never hold the token
    logger.warn({ userId: user?.id, errMessage: err.message }, 'Login alert failed');
    return false;
  }
}
