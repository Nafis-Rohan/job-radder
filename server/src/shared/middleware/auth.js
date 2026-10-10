import { prisma } from '../db/prisma.js';
import { COOKIE_NAME, verifyToken } from '../utils/tokens.js';

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, username: true, role: true },
  });
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  req.user = user;
  next();
}
