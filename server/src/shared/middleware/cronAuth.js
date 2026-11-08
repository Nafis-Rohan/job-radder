import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

// Hash both values first: timingSafeEqual needs equal lengths, and a hash hides the secret's length too.
const digest = (value) => createHash('sha256').update(String(value)).digest();

export function secretMatches(given, expected) {
  if (!expected || typeof given !== 'string' || !given) return false;
  return timingSafeEqual(digest(given), digest(expected));
}

// Only the outside cron (cron-job.org) may call the routes behind this. It sends X-Cron-Secret.
// No secret configured = nobody gets in. Same answer for missing and wrong header.
export function requireCronSecret(secret = env.CRON_SECRET) {
  return (req, res, next) => {
    if (!secretMatches(req.get('x-cron-secret'), secret)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };
}
