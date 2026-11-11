import rateLimit from 'express-rate-limit';

// 10 failed attempts per 15 minutes per IP; successful requests do not count.
function failureLimiter(message) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: message },
  });
}

export const loginLimiter = failureLimiter('Too many login attempts. Try again later.');
export const twoFactorLimiter = failureLimiter('Too many code attempts. Try again later.');
export const cronLimiter = failureLimiter('Too many attempts. Try again later.');

// Calls WITH the right secret are limited too (the failure limiter above does not count them).
// The real cron calls every few hours, so 20 per hour is plenty. Made per router so tests stay separate.
export function cronCallLimiter(limit = 20) {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many scan requests. Try again later.' },
  });
}

// Manual scans: 6 per 10 minutes per admin (each call also writes a ScanRun row).
export const adminScanLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 6,
  keyGenerator: (req) => req.user.id,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many scans started. Try again later.' },
});

// Telegram test messages: 5 per 10 minutes per logged-in user (each one is a real message to a real chat).
export const telegramTestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.user.id,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many test messages. Try again later.' },
});

// CV uploads: 10 per hour per logged-in user (a PDF is read into memory, so keep it rare).
export const cvUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user.id,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many CV uploads. Try again later.' },
});
