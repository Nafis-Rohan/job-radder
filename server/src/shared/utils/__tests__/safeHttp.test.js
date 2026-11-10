import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress, createGuardedLookup, isAllowedRedirect, isTextContentType, createSafeGet } from '../safeHttp.js';

test('private, local and special addresses are blocked (IPv4)', () => {
  for (const ip of [
    '127.0.0.1', '127.255.255.254', '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.0.1', '192.168.1.100',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.2.5',
  ]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
});

test('private, local and special addresses are blocked (IPv6, including IPv4 inside IPv6)', () => {
  for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', '64:ff9b::7f00:1', '2002:7f00:1::1', '2001:db8::1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
});

test('public addresses are allowed', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1', '11.0.0.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test('something that is not an IP address is treated as blocked', () => {
  for (const bad of ['', 'localhost', 'example.com', '999.1.1.1', null, undefined]) {
    assert.equal(isPrivateAddress(bad), true, String(bad));
  }
});

// a fake DNS: name -> list of answers
const fakeResolver = (table) => (hostname, options, callback) => {
  const answer = table[hostname];
  if (!answer) return callback(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
  callback(null, answer);
};
const lookupOf = (table) => createGuardedLookup(fakeResolver(table));
const ask = (lookup, host, options) => new Promise((resolve) => lookup(host, options, (...args) => resolve(args)));

test('guarded lookup: a public name works, in both answer styles', async () => {
  const lookup = lookupOf({ 'good.example': [{ address: '93.184.216.34', family: 4 }] });
  assert.deepEqual(await ask(lookup, 'good.example', { all: true }), [null, [{ address: '93.184.216.34', family: 4 }]]);
  assert.deepEqual(await ask(lookup, 'good.example', {}), [null, '93.184.216.34', 4]);
});

test('guarded lookup: a name that points to a private address is refused', async () => {
  const lookup = lookupOf({
    'evil.example': [{ address: '127.0.0.1', family: 4 }],
    'meta.example': [{ address: '169.254.169.254', family: 4 }],
    'v6.example': [{ address: '::1', family: 6 }],
  });
  for (const host of ['evil.example', 'meta.example', 'v6.example']) {
    for (const options of [{ all: true }, {}]) {
      const [err] = await ask(lookup, host, options);
      assert.match(err.message, /Blocked/, host);
    }
  }
});

test('guarded lookup: if ANY answer is private, the name is refused', async () => {
  const lookup = lookupOf({
    'mixed.example': [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }],
  });
  const [err] = await ask(lookup, 'mixed.example', { all: true });
  assert.match(err.message, /Blocked/);
});

test('guarded lookup: an empty answer and a DNS error are passed on as errors', async () => {
  const lookup = lookupOf({ 'empty.example': [] });
  assert.match((await ask(lookup, 'empty.example', { all: true }))[0].message, /Blocked/);
  assert.equal((await ask(lookup, 'unknown.example', { all: true }))[0].code, 'ENOTFOUND');
});

test('redirects: only inside the same site over https', () => {
  const to = (protocol, hostname) => isAllowedRedirect('vivasoftltd.com', { protocol, hostname });
  assert.equal(to('https:', 'vivasoftltd.com'), true);
  assert.equal(to('https:', 'www.vivasoftltd.com'), true);
  assert.equal(to('https:', 'VIVASOFTLTD.COM'), true);
  assert.equal(to('http:', 'vivasoftltd.com'), false);
  assert.equal(to('https:', 'other.com'), false);
  assert.equal(to('https:', 'vivasoftltd.com.evil.com'), false);
  assert.equal(to('https:', '127.0.0.1'), false);
  assert.equal(to('https:', 'localhost'), false);
});

test('only text pages are read', () => {
  for (const ok of ['text/html; charset=utf-8', 'text/plain', 'application/xhtml+xml', 'application/ld+json', 'application/json']) {
    assert.equal(isTextContentType(ok), true, ok);
  }
  for (const bad of ['application/pdf', 'image/png', 'application/octet-stream', 'video/mp4', '', undefined]) {
    assert.equal(isTextContentType(bad), false, String(bad));
  }
});

// A fake network: answers with `reply` and records the requests.
function fakeAdapter(reply) {
  const requests = [];
  const adapter = async (config) => {
    requests.push(config.url);
    const { status = 200, headers = { 'content-type': 'text/html; charset=utf-8' }, data = '<html></html>' } = reply;
    return { data, status, statusText: '', headers, config, request: {} };
  };
  return { adapter, requests };
}

test('safeGet refuses links that are not public https before any request is made', async () => {
  const { adapter, requests } = fakeAdapter({});
  const safeGet = createSafeGet({ adapter });
  for (const bad of ['http://example.com/', 'https://localhost/', 'https://127.0.0.1/', 'https://169.254.169.254/latest/', 'https://user:pw@example.com/', 'file:///etc/passwd', 'nonsense']) {
    await assert.rejects(safeGet(bad), /Blocked/, bad);
  }
  assert.equal(requests.length, 0);
});

test('safeGet returns the status, the text and the content type', async () => {
  const { adapter, requests } = fakeAdapter({ data: '<h1>Jobs</h1>' });
  const result = await createSafeGet({ adapter })('https://vivasoftltd.com/career/#top');
  assert.equal(result.status, 200);
  assert.equal(result.body, '<h1>Jobs</h1>');
  assert.match(result.contentType, /text\/html/);
  assert.deepEqual(requests, ['https://vivasoftltd.com/career/']); // the #fragment is not sent
});

test('safeGet does not throw for 404 or 500 (the caller decides), but refuses a non-text page', async () => {
  const notFound = fakeAdapter({ status: 404, data: 'Not found' });
  assert.equal((await createSafeGet({ adapter: notFound.adapter })('https://example.com/robots.txt')).status, 404);
  const broken = fakeAdapter({ status: 500, headers: {}, data: '' });
  assert.equal((await createSafeGet({ adapter: broken.adapter })('https://example.com/')).status, 500);

  const pdf = fakeAdapter({ headers: { 'content-type': 'application/pdf' }, data: '%PDF' });
  await assert.rejects(createSafeGet({ adapter: pdf.adapter })('https://example.com/cv.pdf'), /Not a text page/);
});
