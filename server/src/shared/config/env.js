// It loads.env, checks every variable, and stops the app with a clear message if one is wrong
import 'dotenv/config';
import { z } from 'zod';

// An empty value (CRON_SECRET= copied from .env.example) counts as "not set".
const emptyToUndefined = (value) => (value === '' ? undefined : value);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    APP_URL: z.string().url().default('http://localhost:5173'),
    SCAN_INTERVAL_HOURS: z.coerce.number().positive().default(6),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters'),
    // Secret for POST /api/internal/scan (the outside cron). Not set = that endpoint rejects everyone.
    CRON_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
    // Telegram bot token from @BotFather. Not set = no Telegram message is ever sent (alerts are skipped).
    TELEGRAM_BOT_TOKEN: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.CRON_SECRET, {
    path: ['CRON_SECRET'],
    message: 'is required in production',
  });

const result = schema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:');
  for (const issue of result.error.issues) {
    console.error(`- ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = result.data;
