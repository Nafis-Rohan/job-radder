import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeDevice, cleanIp, formatLoginMessage, sendLoginAlert } from '../loginAlert.js';

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const EDGE_WIN = `${CHROME_WIN} Edg/130.0.0.0`;
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0';
const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15';
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';

test('describeDevice names the browser and the system', () => {
  assert.equal(describeDevice(CHROME_WIN), 'Chrome on Windows');
  assert.equal(describeDevice(EDGE_WIN), 'Edge on Windows');
  assert.equal(describeDevice(FIREFOX_LINUX), 'Firefox on Linux');
  assert.equal(describeDevice(SAFARI_MAC), 'Safari on macOS');
  assert.equal(describeDevice(CHROME_ANDROID), 'Chrome on Android');
  assert.equal(describeDevice(SAFARI_IPHONE), 'Safari on iOS');
  assert.equal(describeDevice('PostmanRuntime/7.43.0'), 'Postman');
  assert.equal(describeDevice('curl/8.4.0'), 'curl');
});

test('describeDevice never copies the raw text, and copes with missing input', () => {
  assert.equal(describeDevice('<script>alert(1)</script> hacker'), 'Unknown device');
  assert.equal(describeDevice(''), 'Unknown device');
  assert.equal(describeDevice(null), 'Unknown device');
  assert.equal(describeDevice(undefined), 'Unknown device');
  assert.equal(describeDevice({}), 'Unknown device');
});

test('cleanIp turns ::ffff:1.2.3.4 into 1.2.3.4 and refuses anything that is not an address', () => {
  assert.equal(cleanIp('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(cleanIp('203.0.113.9'), '203.0.113.9');
  assert.equal(cleanIp('2001:db8::1'), '2001:db8::1');
  assert.equal(cleanIp('::1'), '::1');
  assert.equal(cleanIp(undefined), 'unknown');
  assert.equal(cleanIp('1.2.3.4\nFake: line'), 'unknown');
  assert.equal(cleanIp('x'.repeat(100)), 'unknown');
});

test('the message has time, IP and device on four plain lines', () => {
  const text = formatLoginMessage({ ip: '::ffff:203.0.113.9', userAgent: CHROME_WIN, now: new Date('2026-11-11T00:09:30Z') });
  assert.equal(text, ['New login to JobRadar', 'Time: 2026-11-11 00:09 UTC', 'IP: 203.0.113.9', 'Device: Chrome on Windows'].join('\n'));
});

const user = { id: 'u1', role: 'USER', telegramChatId: '555' };

test('sends the message to the saved chat id', async () => {
  const sent = [];
  const ok = await sendLoginAlert({ user, ip: '203.0.113.9', userAgent: CHROME_WIN, hasToken: true, send: async (to, text) => sent.push({ to, text }) });
  assert.equal(ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, '555');
  assert.match(sent[0].text, /^New login to JobRadar\nTime: .* UTC\nIP: 203\.0\.113\.9\nDevice: Chrome on Windows$/);
});

test('nothing is sent without a token, without a chat id, or for the DEMO user', async () => {
  let calls = 0;
  const send = async () => calls++;
  assert.equal(await sendLoginAlert({ user, hasToken: false, send }), false);
  assert.equal(await sendLoginAlert({ user: { ...user, telegramChatId: null }, hasToken: true, send }), false);
  assert.equal(await sendLoginAlert({ user: { ...user, role: 'DEMO' }, hasToken: true, send }), false);
  assert.equal(await sendLoginAlert({ user: undefined, hasToken: true, send }), false);
  assert.equal(calls, 0);
});

test('a Telegram error returns false and never throws', async () => {
  const send = async () => {
    throw new Error('Telegram: 403 Forbidden: bot was blocked by the user');
  };
  assert.equal(await sendLoginAlert({ user, ip: '1.2.3.4', hasToken: true, send }), false);
});
