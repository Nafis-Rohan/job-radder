import { prisma } from '../../shared/db/prisma.js';
import { encrypt } from '../../shared/utils/crypto.js';
import { analyzeCv } from './cvAnalyzer.js';

// MVP: one CV per user (the schema already allows more; Phase 25 can raise this to 3).
export const MAX_CVS_PER_USER = 1;

// Everything we may send back. The encrypted CV text is never in this list.
const CV_FIELDS = {
  id: true,
  name: true,
  skills: true,
  keywords: true,
  yearsExp: true,
  level: true,
  domains: true,
  isActive: true,
  updatedAt: true,
};

export async function isLimitReached(userId) {
  const count = await prisma.cv.count({ where: { userId } });
  return count >= MAX_CVS_PER_USER;
}

// text = plain text read from the PDF. It is stored encrypted; the PDF itself is not kept.
export async function createCv(userId, { text, name }) {
  if (await isLimitReached(userId)) return { status: 'limit' };

  const analysis = analyzeCv(text);
  const cv = await prisma.cv.create({
    data: { userId, name, textEnc: encrypt(text), ...analysis },
    select: CV_FIELDS,
  });
  return { status: 'ok', cv };
}

export function listCvs(userId) {
  return prisma.cv.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: CV_FIELDS,
  });
}

// Every query includes userId, so a user can only touch their own CVs.
export async function updateCv(userId, id, changes) {
  const { count } = await prisma.cv.updateMany({ where: { id, userId }, data: changes });
  if (count === 0) return null;
  return prisma.cv.findFirst({ where: { id, userId }, select: CV_FIELDS });
}

export async function deleteCv(userId, id) {
  const { count } = await prisma.cv.deleteMany({ where: { id, userId } });
  return count > 0;
}
