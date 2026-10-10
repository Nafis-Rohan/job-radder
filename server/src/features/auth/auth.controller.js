import * as authService from './auth.service.js';
import { COOKIE_NAME, signToken, cookieOptions } from './auth.tokens.js';

export async function login(req, res) {
  const { username, password } = req.body;

  const result = await authService.login({
    username,
    password,
    ip: req.ip,
    userAgent: req.get('user-agent') ?? null,
  });

  if (result.status === 'locked') {
    return res.status(423).json({ error: 'Account locked. Try again in 15 minutes.' });
  }

  if (result.status !== 'ok') {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  res.cookie(COOKIE_NAME, signToken(result.user), cookieOptions());
  res.json({ user: result.user });
}
