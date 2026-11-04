import jwt from 'jsonwebtoken';
import { env } from '../../shared/config/env.js';

export const COOKIE_NAME = 'token';

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWO_FACTOR_PURPOSE = '2fa';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

// Session tokens only. A temp (2FA) token must never work as a login cookie.
export function verifyToken(token) {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  if (payload.purpose) throw new Error('Wrong token type');
  return payload;
}

// Short-lived token given after the password step, only good for POST /login/2fa.
export function signTempToken(user) {
  return jwt.sign({ sub: user.id, purpose: TWO_FACTOR_PURPOSE }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
  });
}

export function verifyTempToken(token) {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  if (payload.purpose !== TWO_FACTOR_PURPOSE) throw new Error('Wrong token type');
  return payload;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.NODE_ENV === 'production',
    maxAge: ONE_HOUR_MS,
  };
}
