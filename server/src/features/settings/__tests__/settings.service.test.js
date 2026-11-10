import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../../shared/db/prisma.js';
import { getSettings, updateSettings } from '../settings.service.js';

// Rows made here belong to users starting with "test-settings".
const MARK = 'test-settings';
const clean = () => prisma.user.deleteMany({ where: { username: { startsWith: MARK } } });
const makeUser = (suffix = '') => prisma.user.create({ data: { username: `${MARK}${suffix}`, passwordHash: 'x' } });

beforeEach(clean);
after(async () => {
  await clean();
  await prisma.$disconnect();
});

test('a new user has no chat id', async () => {
  const user = await makeUser();
  assert.deepEqual(await getSettings(user.id), { telegramChatId: null });
});

test('the chat id is saved, changed and cleared', async () => {
  const user = await makeUser();
  assert.deepEqual(await updateSettings(user.id, { telegramChatId: '555' }), { telegramChatId: '555' });
  assert.deepEqual(await getSettings(user.id), { telegramChatId: '555' });
  assert.deepEqual(await updateSettings(user.id, { telegramChatId: '666' }), { telegramChatId: '666' });
  assert.deepEqual(await updateSettings(user.id, { telegramChatId: null }), { telegramChatId: null });
});

test('only the logged-in user changes: other users keep their own value', async () => {
  const one = await makeUser('-1');
  const two = await makeUser('-2');
  await updateSettings(one.id, { telegramChatId: '111' });
  await updateSettings(two.id, { telegramChatId: '222' });
  await updateSettings(one.id, { telegramChatId: null });
  assert.equal((await getSettings(two.id)).telegramChatId, '222');
});

test('other fields in the data are never saved (role, threshold, password)', async () => {
  const user = await makeUser();
  await updateSettings(user.id, { telegramChatId: '1', role: 'ADMIN', alertThreshold: 99, passwordHash: 'hacked' });
  const row = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(row.role, 'USER');
  assert.equal(row.alertThreshold, 50);
  assert.equal(row.passwordHash, 'x');
});

test('a user that does not exist gets empty settings, no crash', async () => {
  assert.deepEqual(await getSettings('no-such-user'), { telegramChatId: null });
  assert.deepEqual(await updateSettings('no-such-user', { telegramChatId: '1' }), { telegramChatId: null });
});
