import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateSettingsSchema } from '../settings.schemas.js';

const parse = (body) => updateSettingsSchema.safeParse(body);

test('a chat id as text or as a number is saved as clean text', () => {
  assert.equal(parse({ telegramChatId: ' 123456789 ' }).data.telegramChatId, '123456789');
  assert.equal(parse({ telegramChatId: 123456789 }).data.telegramChatId, '123456789');
  assert.equal(parse({ telegramChatId: '-1001234567890' }).data.telegramChatId, '-1001234567890'); // a group
});

test('empty text or null clears the chat id', () => {
  assert.equal(parse({ telegramChatId: '' }).data.telegramChatId, null);
  assert.equal(parse({ telegramChatId: '   ' }).data.telegramChatId, null);
  assert.equal(parse({ telegramChatId: null }).data.telegramChatId, null);
});

test('anything that is not a whole number is refused', () => {
  for (const bad of ['abc', '12 34', '12.5', '+123', '@mychannel', '1'.repeat(21), 12.5, 2 ** 60, true, {}, []]) {
    assert.equal(parse({ telegramChatId: bad }).success, false, `${String(bad)} should be refused`);
  }
});

test('an empty body and unknown fields are refused', () => {
  assert.equal(parse({}).success, false);
  assert.equal(parse({ telegramChatId: '1', alertThreshold: 10 }).success, false);
  assert.equal(parse({ telegramChatId: '1', role: 'ADMIN' }).success, false);
  assert.equal(parse({ role: 'ADMIN' }).success, false);
});
