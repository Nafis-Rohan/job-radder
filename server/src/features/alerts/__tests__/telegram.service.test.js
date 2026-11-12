import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendTelegram, TelegramError, removeToken, cleanText } from '../telegram.service.js';

// No real Telegram call here: `post` is a fake and the token is a made-up one.
const TOKEN = '123456:FAKE-token_for-tests';

// What axios throws: the message and config contain the URL, and the URL contains the token.
function axiosError({ status, data, code } = {}) {
  const err = new Error(`Request failed with status code ${status} at https://api.telegram.org/bot${TOKEN}/sendMessage`);
  err.code = code;
  err.config = { url: `https://api.telegram.org/bot${TOKEN}/sendMessage` };
  if (status) err.response = { status, data };
  return err;
}

test('posts chat_id and plain text to the bot URL, without parse_mode', async () => {
  const calls = [];
  const post = async (url, body, options) => calls.push({ url, body, options });

  await sendTelegram(' 555 ', 'Hello', { token: TOKEN, post });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.telegram.org/bot${TOKEN}/sendMessage`);
  assert.deepEqual(calls[0].body, { chat_id: '555', text: 'Hello' });
  assert.ok(calls[0].options.timeout > 0);
});

test('without a token nothing is sent', async () => {
  let called = false;
  const post = async () => (called = true);
  await assert.rejects(sendTelegram('555', 'Hi', { token: null, post }), /not set up/);
  assert.equal(called, false);
});

test('a missing chat id or an empty message is refused before any call', async () => {
  let called = false;
  const post = async () => (called = true);
  await assert.rejects(sendTelegram('', 'Hi', { token: TOKEN, post }), /chat id/);
  await assert.rejects(sendTelegram(null, 'Hi', { token: TOKEN, post }), /chat id/);
  await assert.rejects(sendTelegram('555', '  \n ', { token: TOKEN, post }), /Empty/);
  assert.equal(called, false);
});

test('an error from Telegram keeps its reason and status, and the token is gone', async () => {
  const post = async () => {
    throw axiosError({ status: 403, data: { ok: false, description: 'Forbidden: bot was blocked by the user' } });
  };
  await assert.rejects(sendTelegram('555', 'Hi', { token: TOKEN, post }), (err) => {
    assert.ok(err instanceof TelegramError);
    assert.equal(err.status, 403);
    assert.match(err.message, /blocked by the user/);
    assert.ok(!err.message.includes(TOKEN));
    assert.equal(err.cause, undefined); // the raw axios error (with the URL) is not attached
    assert.ok(!JSON.stringify({ ...err, message: err.message, stack: err.stack }).includes(TOKEN));
    return true;
  });
});

test('a network error never shows the token', async () => {
  const post = async () => {
    throw axiosError({ code: 'ENOTFOUND' });
  };
  await assert.rejects(sendTelegram('555', 'Hi', { token: TOKEN, post }), (err) => {
    assert.equal(err.status, undefined);
    assert.match(err.message, /ENOTFOUND/);
    assert.ok(!err.message.includes(TOKEN));
    return true;
  });
});

test('even a description that contains the token is cleaned', async () => {
  const post = async () => {
    throw axiosError({ status: 404, data: { description: `Not Found: bot${TOKEN} is wrong` } });
  };
  await assert.rejects(sendTelegram('555', 'Hi', { token: TOKEN, post }), (err) => {
    assert.ok(!err.message.includes(TOKEN));
    return true;
  });
});

test('a 429 reports how long Telegram wants us to wait', async () => {
  const post = async () => {
    throw axiosError({ status: 429, data: { description: 'Too Many Requests: retry after 7', parameters: { retry_after: 7 } } });
  };
  await assert.rejects(sendTelegram('555', 'Hi', { token: TOKEN, post }), (err) => err.status === 429 && err.retryAfter === 7);
});

test('removeToken also removes the URL-encoded form', () => {
  const token = '12:a/b+c';
  const text = `x ${token} y ${encodeURIComponent(token)} z`;
  assert.equal(removeToken(text, token), 'x *** y *** z');
  assert.equal(removeToken('nothing', undefined), 'nothing');
});

test('cleanText drops control characters, keeps new lines, and cuts very long text', () => {
  assert.equal(cleanText('a\u0000b\u0007c\nd'), 'abc\nd');
  const long = cleanText('x'.repeat(5000));
  assert.equal(long.length, 4096);
  assert.ok(long.endsWith('…'));
});
