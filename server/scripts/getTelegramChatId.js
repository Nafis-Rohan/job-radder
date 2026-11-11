// Finds your Telegram chat id. Run it from the `server` folder AFTER you sent any message to your bot:
//   node scripts/getTelegramChatId.js
// It reads TELEGRAM_BOT_TOKEN from .env and prints ONLY chat ids (never the token, never message text).
import 'dotenv/config';
import axios from 'axios';
import { removeToken } from '../src/features/alerts/telegram.service.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is empty. Put the token from @BotFather in server/.env first.');
  process.exit(1);
}

try {
  const { data } = await axios.get(`https://api.telegram.org/bot${token}/getUpdates`, { timeout: 10_000 });
  const chats = new Map();
  for (const update of data.result ?? []) {
    const chat = update.message?.chat ?? update.my_chat_member?.chat;
    if (chat) chats.set(chat.id, chat.type);
  }

  if (chats.size === 0) {
    console.log('No chats found. Open your bot in Telegram, press Start, send it any message, then run this again.');
  } else {
    for (const [id, type] of chats) console.log(`chat id: ${id}   (${type})`);
    console.log('Use the "private" one as your telegramChatId.');
  }
} catch (err) {
  // axios errors contain the URL (= the token), so only a cleaned short reason is printed
  const status = err.response?.status;
  const reason = err.response?.data?.description ?? err.code ?? 'request failed';
  console.error(removeToken(`Telegram error: ${status ? `${status} ` : ''}${reason}`, token));
  process.exit(1);
}
