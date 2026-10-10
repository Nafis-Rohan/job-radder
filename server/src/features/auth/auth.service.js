import bcrypt from 'bcrypt';
import { prisma } from '../../shared/db/prisma.js';

// A valid bcrypt hash made at startup, used so a missing user takes
// the same time as a wrong password (no username guessing by timing).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

export async function login({ username, password, ip, userAgent }) {
  const user = await prisma.user.findUnique({ where: { username } });

  const passwordOk = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  const success = Boolean(user) && passwordOk;

  await prisma.loginEvent.create({
    data: { userId: user?.id ?? null, username, success, ip, userAgent },
  });

  if (!success) return null;

  return { id: user.id, username: user.username, role: user.role };
}
