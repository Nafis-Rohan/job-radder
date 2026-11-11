import { z } from 'zod';

// A Telegram chat id is a whole number (negative for groups). Sent as text or as a number; empty or null clears it.
// It is saved as text. (Alerts only go to the chat the user saved, so a wrong id never reaches a stranger by guessing.)
const telegramChatId = z.union([z.string(), z.number(), z.null()]).transform((value, ctx) => {
  if (value === null) return null;
  const text = String(value).trim();
  if (text === '') return null;
  if (!/^-?\d{1,20}$/.test(text) || (typeof value === 'number' && !Number.isSafeInteger(value))) {
    ctx.addIssue({ code: 'custom', message: 'Enter the chat id as a number, like 123456789' });
    return z.NEVER;
  }
  return text;
});

// strictObject: unknown fields (alertThreshold, role, ...) are rejected, never saved.
export const updateSettingsSchema = z
  .strictObject({ telegramChatId: telegramChatId.optional() })
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field to change' });
