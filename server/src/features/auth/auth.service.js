import bcrypt from 'bcrypt';
import { prisma } from '../../shared/db/prisma.js';

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

export async function login({ username, password, ip, userAgent }) {
  const user = await prisma.user.findUnique({ where: { username } });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    await recordEvent({ user, username, success: false, ip, userAgent });
    return { status: 'locked' };
  }

  const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  const success = Boolean(user) && passwordOk;

  await recordEvent({ user, username, success, ip, userAgent });

  if (!success) {
    if (user) await registerFailure(user.id);
    return { status: 'invalid' };
  }

  if (user.failedLogins > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null },
    });
  }

  return { status: 'ok', user: { id: user.id, username: user.username, role: user.role } };
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
