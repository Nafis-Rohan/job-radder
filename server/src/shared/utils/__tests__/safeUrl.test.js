import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePublicHttpsUrl, isPublicHttpsUrl } from '../safeUrl.js';

test('normal https career pages are accepted', () => {
  for (const ok of [
    'https://vivasoftltd.com/career/',
    'https://www.example.co.uk/jobs?team=eng',
    'https://careers.brainstation-23.com/',
    'https://HR.Example.com/Jobs',
    '  https://vivasoftltd.com/career/  ',
    'https://বাংলা.example.com/', // international names arrive as xn--
  ]) {
    assert.equal(isPublicHttpsUrl(ok), true, ok);
  }
});

test('the result is a clean URL: lower-case host, no #fragment', () => {
  assert.equal(parsePublicHttpsUrl('https://VivaSoftLtd.com/career/#open-position').href, 'https://vivasoftltd.com/career/');
});

test('http and other protocols are rejected', () => {
  for (const bad of ['http://vivasoftltd.com/career/', 'ftp://example.com/', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi']) {
    assert.equal(isPublicHttpsUrl(bad), false, bad);
  }
});

test('localhost and internal names are rejected', () => {
  for (const bad of [
    'https://localhost/', 'https://LOCALHOST:443/', 'https://app.localhost/', 'https://printer.local/',
    'https://db.internal/', 'https://router.lan/', 'https://intranet/', 'https://server/',
  ]) {
    assert.equal(isPublicHttpsUrl(bad), false, bad);
  }
});

test('IP addresses in every form are rejected', () => {
  for (const bad of [
    'https://127.0.0.1/', 'https://10.0.0.5/', 'https://192.168.1.1/', 'https://169.254.169.254/latest/meta-data/',
    'https://8.8.8.8/', 'https://2130706433/', 'https://0x7f.0.0.1/', 'https://0177.0.0.1/', 'https://[::1]/',
    'https://[::ffff:127.0.0.1]/', 'https://[2001:db8::1]/',
  ]) {
    assert.equal(isPublicHttpsUrl(bad), false, bad);
  }
});

test('user:password@ and custom ports are rejected', () => {
  assert.equal(isPublicHttpsUrl('https://user:pass@example.com/'), false);
  assert.equal(isPublicHttpsUrl('https://user@example.com/'), false);
  assert.equal(isPublicHttpsUrl('https://example.com:8443/'), false);
  assert.equal(isPublicHttpsUrl('https://example.com:443/'), true); // the default port is just the normal one
});

test('a link that points at an internal name by trickery is rejected', () => {
  // the part before the @ is a user name, so the real host here is 127.0.0.1
  assert.equal(isPublicHttpsUrl('https://example.com@127.0.0.1/'), false);
  assert.equal(isPublicHttpsUrl('https://example.com%2f@localhost/'), false);
});

test('empty, non-text, broken or too long input is rejected', () => {
  for (const bad of ['', '   ', 'not a url', 'https://', 'https://.com', 'https://exa mple.com', null, undefined, 42, {}]) {
    assert.equal(isPublicHttpsUrl(bad), false, String(bad));
  }
  assert.equal(isPublicHttpsUrl(`https://example.com/${'a'.repeat(500)}`), false);
});
