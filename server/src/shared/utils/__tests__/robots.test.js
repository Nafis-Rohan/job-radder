import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, rulesFor, isPathAllowed, createRobotsChecker } from '../robots.js';

const allowed = (robotsText, path, agent) => isPathAllowed(rulesFor(parseRobots(robotsText), agent).rules, path);

test('Vivasoft\'s real robots.txt: /career/ is allowed, /wp-admin/ is not', () => {
  const text = `# This file is automatically added by Rank Math SEO plugin
User-Agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php
Disallow: /case-study/*?*vcsg_service=

Sitemap: https://vivasoftltd.com/sitemap_index.xml`;
  assert.equal(allowed(text, '/career/'), true);
  assert.equal(allowed(text, '/career/assistant-manager-key-accounts-telco/'), true);
  assert.equal(allowed(text, '/wp-admin/options.php'), false);
  assert.equal(allowed(text, '/wp-admin/admin-ajax.php'), true); // the longer Allow beats the shorter Disallow
  assert.equal(allowed(text, '/case-study/x?a=1&vcsg_service=2'), false);
  assert.equal(allowed(text, '/case-study/x'), true);
});

test('no rules, an empty file and "Disallow:" with nothing after it allow everything', () => {
  assert.equal(allowed('', '/anything'), true);
  assert.equal(allowed('User-agent: *\nDisallow:', '/anything'), true);
  assert.equal(allowed(undefined, '/anything'), true);
});

test('"Disallow: /" blocks the whole site', () => {
  assert.equal(allowed('User-agent: *\nDisallow: /', '/'), false);
  assert.equal(allowed('User-agent: *\nDisallow: /', '/career/'), false);
});

test('Allow and Disallow of the same length: Allow wins', () => {
  const text = 'User-agent: *\nDisallow: /jobs\nAllow: /jobs';
  assert.equal(allowed(text, '/jobs'), true);
  const reversed = 'User-agent: *\nAllow: /jobs\nDisallow: /jobs';
  assert.equal(allowed(reversed, '/jobs/1'), true);
});

test('the longest matching rule wins, whatever the order', () => {
  const text = 'User-agent: *\nAllow: /career/open/\nDisallow: /career/';
  assert.equal(allowed(text, '/career/'), false);
  assert.equal(allowed(text, '/career/closed/'), false);
  assert.equal(allowed(text, '/career/open/dev'), true);
});

test('patterns: * is any text, $ is the end, a rule matches from the start of the path', () => {
  const text = 'User-agent: *\nDisallow: /*.pdf$\nDisallow: /private*/secret\nDisallow: /tmp';
  assert.equal(allowed(text, '/files/cv.pdf'), false);
  assert.equal(allowed(text, '/files/cv.pdf?download=1'), true); // "$" means the path must end there
  assert.equal(allowed(text, '/private-area/secret'), false);
  assert.equal(allowed(text, '/tmp/x'), false);
  assert.equal(allowed(text, '/a/tmp'), true); // not at the start
});

test('special characters in a rule are plain text, not regular expression syntax', () => {
  const text = 'User-agent: *\nDisallow: /a.b(c)+d';
  assert.equal(allowed(text, '/a.b(c)+d'), false);
  assert.equal(allowed(text, '/aXb(c)+d'), true);
});

test('our own group (jobradar) is used instead of "*" when it exists', () => {
  const text = 'User-agent: *\nDisallow: /\n\nUser-agent: JobRadar\nAllow: /\nDisallow: /admin/';
  assert.equal(allowed(text, '/career/'), true);
  assert.equal(allowed(text, '/admin/x'), false);
  assert.equal(allowed(text, '/career/', 'someone-else'), false); // other bots still get the "*" group
});

test('several user-agent lines share the rules under them; a rule starts a new group after it', () => {
  const text = 'User-agent: googlebot\nUser-agent: jobradar\nDisallow: /x\nUser-agent: bingbot\nDisallow: /y';
  assert.equal(allowed(text, '/x'), false);
  assert.equal(allowed(text, '/y'), true); // /y is for bingbot only
});

test('letter case, comments, windows line endings and spaces do not matter; junk lines are ignored', () => {
  const text = 'USER-AGENT : *  # everyone\r\nDISALLOW : /Secret # no\r\nthis is not a rule\r\n\r\nAllow: /Secret/open';
  assert.equal(allowed(text, '/Secret'), false);
  assert.equal(allowed(text, '/Secret/open'), true);
  assert.equal(allowed(text, '/secret'), true); // paths are case sensitive
});

test('a rule before any user-agent line is ignored', () => {
  assert.equal(allowed('Disallow: /\nUser-agent: *\nAllow: /', '/x'), true);
});

test('crawl-delay is read for our group', () => {
  assert.equal(rulesFor(parseRobots('User-agent: *\nCrawl-delay: 5')).crawlDelay, 5);
  assert.equal(rulesFor(parseRobots('User-agent: *\nCrawl-delay: abc')).crawlDelay, null);
  assert.equal(rulesFor(parseRobots('User-agent: *\nDisallow: /x')).crawlDelay, null);
});

// ---- the checker, with a fake network ----
const fakeGet = (answers) => {
  const calls = [];
  const get = async (url) => {
    calls.push(url);
    const answer = answers[url];
    if (answer instanceof Error) throw answer;
    return answer ?? { status: 404, body: '' };
  };
  return { get, calls };
};

test('checker: allowed and disallowed pages, with the path and query checked', async () => {
  const { get } = fakeGet({ 'https://example.com/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /private\nCrawl-delay: 3' } });
  const checker = createRobotsChecker({ get });
  assert.deepEqual(await checker.check('https://example.com/career/'), { allowed: true, crawlDelayMs: 3000, reason: null });
  const blocked = await checker.check('https://example.com/private/x?a=1');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'Disallowed by robots.txt');
});

test('checker: robots.txt is fetched once per site, and each site has its own', async () => {
  const { get, calls } = fakeGet({
    'https://a.example/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /' },
    'https://b.example/robots.txt': { status: 200, body: 'User-agent: *\nDisallow:' },
  });
  const checker = createRobotsChecker({ get });
  const results = await Promise.all([
    checker.check('https://a.example/1'), checker.check('https://a.example/2'), checker.check('https://b.example/1'),
  ]);
  assert.deepEqual(results.map((r) => r.allowed), [false, false, true]);
  assert.deepEqual(calls.sort(), ['https://a.example/robots.txt', 'https://b.example/robots.txt']);
});

test('checker: no robots.txt (404) means no rules', async () => {
  const checker = createRobotsChecker({ get: fakeGet({}).get });
  assert.equal((await checker.check('https://example.com/anything')).allowed, true);
  const forbidden = createRobotsChecker({ get: fakeGet({ 'https://example.com/robots.txt': { status: 403, body: '' } }).get });
  assert.equal((await forbidden.check('https://example.com/anything')).allowed, true);
});

test('checker: a broken or unreachable robots.txt means we do NOT scrape that site', async () => {
  const serverError = createRobotsChecker({ get: fakeGet({ 'https://example.com/robots.txt': { status: 503, body: '' } }).get });
  const result = await serverError.check('https://example.com/career/');
  assert.equal(result.allowed, false);
  assert.match(result.reason, /unavailable \(503\)/);

  const down = createRobotsChecker({ get: fakeGet({ 'https://example.com/robots.txt': new Error('timeout of 15000ms exceeded') }).get });
  const downResult = await down.check('https://example.com/career/');
  assert.equal(downResult.allowed, false);
  assert.match(downResult.reason, /could not be read \(timeout/);
});
