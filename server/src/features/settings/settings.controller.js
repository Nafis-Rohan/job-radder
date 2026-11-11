import { env } from '../../shared/config/env.js';
import { logger } from '../../shared/utils/logger.js';
import * as settingsService from './settings.service.js';
import { sendTelegram } from '../alerts/telegram.service.js';

export const TEST_MESSAGE = 'JobRadar test message: Telegram alerts are working.';

// `service`, `send` and `isTelegramSetUp` can be replaced in tests (no database, no real Telegram call).
export function buildSettingsController({
  service = settingsService,
  send = sendTelegram,
  isTelegramSetUp = () => Boolean(env.TELEGRAM_BOT_TOKEN),
} = {}) {
  // what the user sees: their chat id, and whether the server can send at all
  const view = (settings) => ({ settings: { ...settings, telegramReady: isTelegramSetUp() } });

  return {
    async get(req, res) {
      res.json(view(await service.getSettings(req.user.id)));
    },

    async update(req, res) {
      res.json(view(await service.updateSettings(req.user.id, req.body)));
    },

    // Sends one test message to the saved chat id.
    async testTelegram(req, res) {
      if (!isTelegramSetUp()) return res.status(503).json({ error: 'Telegram is not set up on the server yet' });
      const { telegramChatId } = await service.getSettings(req.user.id);
      if (!telegramChatId) return res.status(409).json({ error: 'Save your Telegram chat id first' });
      try {
        await send(telegramChatId, TEST_MESSAGE);
      } catch (err) {
        // TelegramError messages hold only the status and Telegram's reason, never the token. The chat id is not logged.
        logger.warn({ userId: req.user.id, errMessage: err.message }, 'Telegram test message failed');
        return res.status(502).json({ error: err.message });
      }
      res.json({ ok: true });
    },
  };
}
