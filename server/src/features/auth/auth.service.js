import bcrypt from 'bcrypt';
import { prisma } from '../../shared/db/prisma.js';
import { decrypt } from '../../shared/utils/crypto.js';
import { verifyTempToken } from '../../shared/utils/tokens.js';
import { verifyCode } from './twoFactor.service.js';
import { sendLoginAlert } from '../alerts/loginAlert.js';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

// A valid bcrypt hash made at startup, used so a missing user takes
// the same time as a wrong password (no username guessing by timing).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

async function recordEvent({ user, username, success, ip, userAgent }) {
  await prisma.loginEvent.create({
    data: { userId: user?.id ?? null, username, success, ip, userAgent },
  });
}

function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role };
}

function isLocked(user) {
  return Boolean(user?.lockedUntil) && user.lockedUntil > new Date();
}

async function registerFailure(userId) {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { failedLogins: { increment: 1 } },
  });

  if (updated.failedLogins >= MAX_FAILED_LOGINS) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLogins: 0,
        lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
      },
    });
  }
}

// Login is finished (password ok, and 2FA ok if it is on): log it and clear the counters.
// The Telegram login alert is not waited for (Telegram can be slow) and can never fail the login.
async function completeLogin(user, { ip, userAgent, notify }) {
  await recordEvent({ user, username: user.username, success: true, ip, userAgent });
  Promise.resolve()
    .then(() => notify({ user, ip, userAgent }))
    .catch(() => {});

  if (user.failedLogins > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
  }
}

// Step 1: username + password.
// Returns { status: 'ok' | 'two_factor_required' | 'invalid' | 'locked', user? }
// `notify` (the login alert) can be replaced in tests.
export async function login({ username, password, ip, userAgent, notify = sendLoginAlert }) {
  const user = await prisma.user.findUnique({ where: { username } });

  if (isLocked(user)) {
    await recordEvent({ user, username, success: false, ip, userAgent });
    return { status: 'locked' };
  }

  const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !passwordOk) {
    await recordEvent({ user, username, success: false, ip, userAgent });
    if (user) await registerFailure(user.id);
    return { status: 'invalid' };
  }

  // 2FA is on: the login is not finished yet. It is logged after the code step.
  if (user.totpEnabled) {
    return { status: 'two_factor_required', user: publicUser(user) };
  }

  await completeLogin(user, { ip, userAgent, notify });
  return { status: 'ok', user: publicUser(user) };
}

// Step 2: temp token from step 1 + the 6-digit code from the authenticator app.
// A wrong code counts as a failed login (same lock rule as a wrong password).
export async function loginWithTwoFactor({ tempToken, code, ip, userAgent, notify = sendLoginAlert }) {
  let payload;
  try {
    payload = verifyTempToken(tempToken);
  } catch {
    return { status: 'invalid' };
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.totpEnabled || !user.totpSecretEnc) {
    return { status: 'invalid' };
  }

  if (isLocked(user)) {
    await recordEvent({ user, username: user.username, success: false, ip, userAgent });
    return { status: 'locked' };
  }

  const codeOk = await verifyCode(decrypt(user.totpSecretEnc), code);

  if (!codeOk) {
    await recordEvent({ user, username: user.username, success: false, ip, userAgent });
    await registerFailure(user.id);
    return { status: 'invalid' };
  }

  await completeLogin(user, { ip, userAgent, notify });
  return { status: 'ok', user: publicUser(user) };
}
