import jwt from 'jsonwebtoken';
import { env } from '../../shared/config/env.js';

export const COOKIE_NAME = 'token';

const ONE_HOUR_MS = 60 * 60 * 1000;

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

export function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.NODE_ENV === 'production',
    maxAge: ONE_HOUR_MS,
  };
}
