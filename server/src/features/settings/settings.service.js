import { prisma } from '../../shared/db/prisma.js';

// The settings of one user. Every query is by the logged-in user's id, so nobody can read or change another user's.
export async function getSettings(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true } });
  return { telegramChatId: user?.telegramChatId ?? null };
}

// `data` is already checked by updateSettingsSchema. Only the listed fields can ever be saved.
export async function updateSettings(userId, data) {
  const changes = {};
  if (data.telegramChatId !== undefined) changes.telegramChatId = data.telegramChatId;
  if (Object.keys(changes).length > 0) await prisma.user.updateMany({ where: { id: userId }, data: changes });
  return getSettings(userId);
}
