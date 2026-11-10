import { prisma } from '../../shared/db/prisma.js';
import { normalizeCompany } from './companyMatcher.js';

export const MAX_FAVORITES_PER_USER = 30;

// Everything we send back.
const FIELDS = { id: true, name: true, aliases: true, careersUrl: true, createdAt: true };

export function listFavorites(userId) {
  return prisma.favoriteCompany.findMany({ where: { userId }, orderBy: { name: 'asc' }, select: FIELDS });
}

// Same company under another spelling ("Vivasoft" and "Vivasoft Ltd.") counts as a duplicate.
function hasDuplicate(existing, name, exceptId) {
  const wanted = normalizeCompany(name);
  return existing.some((fav) => fav.id !== exceptId && normalizeCompany(fav.name) === wanted);
}

// The advisory lock makes two requests of the same user wait for each other,
// so the limit and the duplicate check cannot be passed by a race (same idea as the CV upload).
const lockUser = (tx, userId) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'fav:' + userId}))`;

// Returns { status: 'ok', company } | { status: 'limit' } | { status: 'duplicate' }
export function createFavorite(userId, data) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const existing = await tx.favoriteCompany.findMany({ where: { userId }, select: { id: true, name: true } });
    if (existing.length >= MAX_FAVORITES_PER_USER) return { status: 'limit' };
    if (hasDuplicate(existing, data.name)) return { status: 'duplicate' };

    const company = await tx.favoriteCompany.create({ data: { ...data, userId }, select: FIELDS });
    return { status: 'ok', company };
  });
}

// Every query includes userId, so a user can only touch their own favorites.
// Returns { status: 'ok', company } | { status: 'notfound' } | { status: 'duplicate' }
export function updateFavorite(userId, id, changes) {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const existing = await tx.favoriteCompany.findMany({ where: { userId }, select: { id: true, name: true } });
    if (!existing.some((fav) => fav.id === id)) return { status: 'notfound' };
    if (changes.name !== undefined && hasDuplicate(existing, changes.name, id)) return { status: 'duplicate' };

    const company = await tx.favoriteCompany.update({ where: { id }, data: changes, select: FIELDS });
    return { status: 'ok', company };
  });
}

export async function deleteFavorite(userId, id) {
  const { count } = await prisma.favoriteCompany.deleteMany({ where: { id, userId } });
  return count > 0;
}
