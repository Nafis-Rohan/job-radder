import axios from 'axios';
import { env } from '../../shared/config/env.js';

// Sends one plain-text message to a Telegram chat through the Bot API.
// - No parse_mode: job titles come from other websites, so nothing in the text may be read as formatting.
// - The bot token is part of the URL, and axios errors contain that URL. So every error is rebuilt here
//   from a few safe fields (status, Telegram's own description) and the token is removed from the text.
//   The original axios error is never attached, so it cannot reach a log by accident.

const API = 'https://api.telegram.org';
const MAX_LENGTH = 4096; // Telegram's limit for one message
const TIMEOUT_MS = 10_000;

export class TelegramError extends Error {
  constructor(message, { status, retryAfter } = {}) {
    super(message);
    this.name = 'TelegramError';
    this.status = status; // HTTP status from Telegram (undefined = no answer, e.g. network down)
    this.retryAfter = retryAfter; // seconds Telegram asks us to wait (status 429)
  }
}

// Removes the token (and its URL-encoded form) from any text.
export function removeToken(text, token) {
  let clean = String(text);
  for (const secret of [token, encodeURIComponent(token ?? '')]) {
    if (secret) clean = clean.split(secret).join('***');
  }
  return clean;
}

// Control characters (except new lines) have no place in a chat message; cut very long text.
export function cleanText(text) {
  const plain = String(text ?? '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '');
  return plain.length > MAX_LENGTH ? `${plain.slice(0, MAX_LENGTH - 1)}…` : plain;
}

// `token` and `post` can be replaced in tests (no real Telegram call, no real token).
export async function sendTelegram(chatId, text, { token = env.TELEGRAM_BOT_TOKEN, post = axios.post } = {}) {
  if (!token) throw new TelegramError('Telegram is not set up (TELEGRAM_BOT_TOKEN is empty)');
  const to = String(chatId ?? '').trim();
  if (!to) throw new TelegramError('No Telegram chat id');
  const message = cleanText(text);
  if (!message.trim()) throw new TelegramError('Empty message');

  try {
    await post(`${API}/bot${token}/sendMessage`, { chat_id: to, text: message }, { timeout: TIMEOUT_MS });
  } catch (err) {
    const status = err?.response?.status;
    const description = err?.response?.data?.description; // e.g. "Forbidden: bot was blocked by the user"
    const retryAfter = err?.response?.data?.parameters?.retry_after;
    const reason = description ?? err?.code ?? 'request failed'; // err.code e.g. ECONNABORTED, ENOTFOUND
    throw new TelegramError(removeToken(`Telegram: ${status ? `${status} ` : ''}${reason}`, token), { status, retryAfter });
  }
}
