import { env } from '../config/env.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Browsers send an Origin header on every request that changes data. If it is not our own site,
// another website is making the request with the user's cookie (CSRF), so it is refused.
// No Origin header = not a browser (Postman, the cron service, curl), which has no cookie to abuse.
export function requireSameOrigin(allowed = [env.APP_URL]) {
  const origins = new Set(allowed.map((url) => new URL(url).origin));

  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.get('origin');
    if (origin === undefined || origins.has(origin)) return next();

    return res.status(403).json({ error: 'Forbidden' });
  };
}
