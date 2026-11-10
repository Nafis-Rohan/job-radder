import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import app from '../../../app.js';
import { buildSettingsRouter } from '../settings.routes.js';
import { buildSettingsController, TEST_MESSAGE } from '../settings.controller.js';
import { listen } from '../../../shared/testing/listen.js';

const loginAs = (id) => [
  (req, res, next) => {
    req.user = { id, role: 'USER' };
    next();
  },
];
const passThrough = (req, res, next) => next(); // the real limiter is tested separately

// A fake service with one in-memory chat id. `sent` collects the fake Telegram calls.
function fakes({ chatId = null, ready = true, failWith } = {}) {
  const state = { chatId, calls: [], sent: [] };
  const service = {
    getSettings: async (userId) => (state.calls.push(['get', userId]), { telegramChatId: state.chatId }),
    updateSettings: async (userId, data) => {
      state.calls.push(['update', userId, data]);
      if (data.telegramChatId !== undefined) state.chatId = data.telegramChatId;
      return { telegramChatId: state.chatId };
    },
  };
  const send = async (to, text) => {
    if (failWith) throw new Error(failWith);
    state.sent.push({ to, text });
  };
  return { state, controller: buildSettingsController({ service, send, isTelegramSetUp: () => ready }) };
}

async function withServer(controller, fn, limiter = passThrough) {
  const router = buildSettingsRouter({ guard: loginAs('user-1'), controller, limiter });
  const server = await listen(express().use(express.json()).use('/api/settings', router));
  const base = `http://localhost:${server.address().port}/api/settings`;
  const send = (path, method, body) =>
    fetch(`${base}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    await fn(send);
  } finally {
    server.close();
  }
}

test('not logged in: 401 on every route (real app)', async () => {
  const server = await listen(app);
  const base = `http://localhost:${server.address().port}/api/settings`;
  try {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base, { method: 'PATCH' })).status, 401);
    assert.equal((await fetch(`${base}/telegram/test`, { method: 'POST' })).status, 401);
  } finally {
    server.close();
  }
});

test('GET: the chat id and whether the server can send', async () => {
  const { controller, state } = fakes({ chatId: '555', ready: true });
  await withServer(controller, async (send) => {
    const res = await send('', 'GET');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { settings: { telegramChatId: '555', telegramReady: true } });
    assert.deepEqual(state.calls, [['get', 'user-1']]);
  });
  const notReady = fakes({ ready: false });
  await withServer(notReady.controller, async (send) => {
    assert.deepEqual((await (await send('', 'GET')).json()).settings, { telegramChatId: null, telegramReady: false });
  });
});

test('PATCH saves a clean chat id for the logged-in user only', async () => {
  const { controller, state } = fakes();
  await withServer(controller, async (send) => {
    const res = await send('', 'PATCH', { telegramChatId: ' 123456789 ', userId: 'someone-else' });
    assert.equal(res.status, 400, 'unknown fields are refused');

    const ok = await send('', 'PATCH', { telegramChatId: ' 123456789 ' });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).settings.telegramChatId, '123456789');
    assert.deepEqual(state.calls.at(-1), ['update', 'user-1', { telegramChatId: '123456789' }]);

    const cleared = await send('', 'PATCH', { telegramChatId: null });
    assert.equal((await cleared.json()).settings.telegramChatId, null);
  });
});

test('PATCH: a bad chat id or an empty body is 400 and nothing is saved', async () => {
  const { controller, state } = fakes();
  await withServer(controller, async (send) => {
    assert.equal((await send('', 'PATCH', { telegramChatId: 'abc' })).status, 400);
    assert.equal((await send('', 'PATCH', {})).status, 400);
    assert.equal((await send('', 'PATCH', { alertThreshold: 10 })).status, 400);
    assert.equal(state.calls.length, 0);
  });
});

test('test message: sent to the saved chat id, 200', async () => {
  const { controller, state } = fakes({ chatId: '555' });
  await withServer(controller, async (send) => {
    const res = await send('/telegram/test', 'POST');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.deepEqual(state.sent, [{ to: '555', text: TEST_MESSAGE }]);
  });
});

test('test message without a saved chat id: 409, nothing sent', async () => {
  const { controller, state } = fakes({ chatId: null });
  await withServer(controller, async (send) => {
    const res = await send('/telegram/test', 'POST');
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /chat id/);
    assert.equal(state.sent.length, 0);
  });
});

test('test message when the server has no bot token: 503, nothing sent', async () => {
  const { controller, state } = fakes({ chatId: '555', ready: false });
  await withServer(controller, async (send) => {
    assert.equal((await send('/telegram/test', 'POST')).status, 503);
    assert.equal(state.sent.length, 0);
  });
});

test('test message that Telegram refuses: 502 with the safe reason', async () => {
  const { controller } = fakes({ chatId: '555', failWith: 'Telegram: 400 Bad Request: chat not found' });
  await withServer(controller, async (send) => {
    const res = await send('/telegram/test', 'POST');
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error, 'Telegram: 400 Bad Request: chat not found');
  });
});

test('the test message is limited (the limiter runs before the controller)', async () => {
  const { controller, state } = fakes({ chatId: '555' });
  const blocking = (req, res) => res.status(429).json({ error: 'Too many test messages. Try again later.' });
  await withServer(
    controller,
    async (send) => {
      assert.equal((await send('/telegram/test', 'POST')).status, 429);
      assert.equal(state.sent.length, 0);
    },
    blocking,
  );
});
