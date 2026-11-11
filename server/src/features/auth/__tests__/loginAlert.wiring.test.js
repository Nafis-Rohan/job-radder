import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { prisma } from '../../../shared/db/prisma.js';
import { login } from '../auth.service.js';

// Checks WHEN the login alert is called. `notify` is a fake: no Telegram. Rows belong to users starting with "test-loginalert".
const MARK = 'test-loginalert';
const PASSWORD = 'a-long-test-password';
const clean = async () => {
  await prisma.loginEvent.deleteMany({ where: { username: { startsWith: MARK } } });
  await prisma.user.deleteMany({ where: { username: { startsWith: MARK } } });
};
beforeEach(clean);
after(async () => {
  await clean();
  await prisma.$disconnect();
});

const makeUser = async (suffix, extra = {}) =>
  prisma.user.create({
    data: { username: `${MARK}-${suffix}`, passwordHash: await bcrypt.hash(PASSWORD, 4), telegramChatId: '555', ...extra },
  });

// the alert runs in the background, so wait one turn of the event loop before looking
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('a good login calls the alert once, with the user, IP and device', async () => {
  const user = await makeUser('a');
  const calls = [];
  const result = await login({
    username: user.username,
    password: PASSWORD,
    ip: '203.0.113.9',
    userAgent: 'curl/8.4.0',
    notify: async (args) => calls.push(args),
  });
  await settle();

  assert.equal(result.status, 'ok');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].user.id, user.id);
  assert.equal(calls[0].user.telegramChatId, '555');
  assert.equal(calls[0].ip, '203.0.113.9');
  assert.equal(calls[0].userAgent, 'curl/8.4.0');
});

test('a wrong password or an unknown user gives no alert', async () => {
  const user = await makeUser('b');
  const calls = [];
  const notify = async (args) => calls.push(args);
  assert.equal((await login({ username: user.username, password: 'wrong-password-1', notify })).status, 'invalid');
  assert.equal((await login({ username: `${MARK}-nobody`, password: PASSWORD, notify })).status, 'invalid');
  await settle();
  assert.equal(calls.length, 0);
});

test('a locked account gives no alert', async () => {
  const user = await makeUser('c', { lockedUntil: new Date(Date.now() + 60_000) });
  const calls = [];
  const result = await login({ username: user.username, password: PASSWORD, notify: async (a) => calls.push(a) });
  await settle();
  assert.equal(result.status, 'locked');
  assert.equal(calls.length, 0);
});

test('with 2FA on, the password step gives no alert yet (it comes after the code)', async () => {
  const user = await makeUser('d', { totpEnabled: true, totpSecretEnc: 'not-used-here' });
  const calls = [];
  const result = await login({ username: user.username, password: PASSWORD, notify: async (a) => calls.push(a) });
  await settle();
  assert.equal(result.status, 'two_factor_required');
  assert.equal(calls.length, 0);
});

test('an alert that throws, or never answers, does not break or delay the login', async () => {
  const user = await makeUser('e');
  const broken = await login({
    username: user.username,
    password: PASSWORD,
    notify: async () => {
      throw new Error('telegram broke');
    },
  });
  assert.equal(broken.status, 'ok');

  const syncBroken = await login({
    username: user.username,
    password: PASSWORD,
    notify: () => {
      throw new Error('broke before it even returned a promise');
    },
  });
  assert.equal(syncBroken.status, 'ok');

  const started = Date.now();
  const slow = await login({ username: user.username, password: PASSWORD, notify: () => new Promise(() => {}) });
  assert.equal(slow.status, 'ok');
  assert.ok(Date.now() - started < 2000, 'the login did not wait for the alert');
  await settle();
});

test('the login is still recorded as a LoginEvent', async () => {
  const user = await makeUser('f');
  await login({ username: user.username, password: PASSWORD, ip: '203.0.113.9', userAgent: 'x', notify: async () => {} });
  assert.equal(await prisma.loginEvent.count({ where: { userId: user.id, success: true } }), 1);
});
