import * as authService from './auth.service.js';
import * as twoFactorService from './twoFactor.service.js';
import {
  COOKIE_NAME,
  signToken,
  signTempToken,
  cookieOptions,
} from '../../shared/utils/tokens.js';

const LOCKED_MESSAGE = 'Account locked. Try again in 15 minutes.';

function startSession(res, user) {
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
  res.json({ user });
}

export async function login(req, res) {
  const { username, password } = req.body;

  const result = await authService.login({
    username,
    password,
    ip: req.ip,
    userAgent: req.get('user-agent') ?? null,
  });

  if (result.status === 'locked') {
    return res.status(423).json({ error: LOCKED_MESSAGE });
  }

  if (result.status === 'two_factor_required') {
    return res.json({ twoFactorRequired: true, tempToken: signTempToken(result.user) });
  }

  if (result.status !== 'ok') {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  startSession(res, result.user);
}

export async function loginTwoFactor(req, res) {
  const { tempToken, code } = req.body;

  const result = await authService.loginWithTwoFactor({
    tempToken,
    code,
    ip: req.ip,
    userAgent: req.get('user-agent') ?? null,
  });

  if (result.status === 'locked') {
    return res.status(423).json({ error: LOCKED_MESSAGE });
  }

  if (result.status !== 'ok') {
    return res.status(401).json({ error: 'Invalid or expired code' });
  }

  startSession(res, result.user);
}

export function me(req, res) {
  res.json({ user: req.user });
}

export function logout(req, res) {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(COOKIE_NAME, options);
  res.json({ ok: true });
}

export async function setupTwoFactor(req, res) {
  const result = await twoFactorService.setup(req.user.id);

  if (result.status === 'already_enabled') {
    return res.status(409).json({ error: '2FA is already enabled' });
  }
  if (result.status !== 'ok') {
    return res.status(404).json({ error: 'User not found' });
  }

  res.set('Cache-Control', 'no-store');
  res.json({ qrCode: result.qrCode, manualKey: result.manualKey });
}

export async function enableTwoFactor(req, res) {
  const result = await twoFactorService.enable(req.user.id, req.body.code);

  if (result.status === 'already_enabled') {
    return res.status(409).json({ error: '2FA is already enabled' });
  }
  if (result.status === 'no_setup') {
    return res.status(400).json({ error: 'Run 2FA setup first' });
  }
  if (result.status === 'invalid_code') {
    return res.status(400).json({ error: 'Invalid code' });
  }
  if (result.status !== 'ok') {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ ok: true });
}
