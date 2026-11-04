import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateSecret, generate } from 'otplib';
import { verifyCode } from '../twoFactor.service.js';
import { prisma } from '../../../shared/db/prisma.js';

after(async () => {
  await prisma.$disconnect();
});

test('accepts the current code from the authenticator', async () => {
  const secret = generateSecret();
  const code = await generate({ secret });
  assert.equal(await verifyCode(secret, code), true);
});

test('rejects a wrong code', async () => {
  const secret = generateSecret();
  const code = await generate({ secret });
  const wrong = code === '000000' ? '111111' : '000000';
  assert.equal(await verifyCode(secret, wrong), false);
});

test('rejects a code made for a different secret', async () => {
  const code = await generate({ secret: generateSecret() });
  assert.equal(await verifyCode(generateSecret(), code), false);
});
