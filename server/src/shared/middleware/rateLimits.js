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
