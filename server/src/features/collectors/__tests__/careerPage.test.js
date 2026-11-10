import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCareerPageCollector, MAX_NEW_JOBS_PER_COMPANY, SOURCE } from '../careerPage.js';
import { getCollectors } from '../index.js';
import { prepareJobs } from '../../jobs/prepareJobs.js';

// ---- a made-up network: url -> answer. Anything not listed is a 404. ----
const jobHtml = (title, text = 'We are seeking a person to join us. Responsibilities: build and ship things every day. Apply now.') =>
  `<html><head><title>${title} | Acme Ltd.</title></head><body><main><h2>${title}</h2><p>${text}</p></main></body></html>`;

function fakeWeb(pages) {
  const calls = [];
  const get = async (url) => {
    calls.push(url);
    const page = pages[url];
    if (page instanceof Error) throw page;
    if (!page) return { status: 404, body: '', contentType: 'text/html', url };
    return { status: 200, contentType: 'text/html', url, ...page };
  };
  return { get, calls };
}

const CAREER = 'https://acme.example/career/';
const listPage = (...slugs) => ({ body: slugs.map((slug) => `<a href="/career/${slug}/">Apply Now</a>`).join('') });

function collector(web, favorites, extra = {}) {
  const waits = [];
  const instance = createCareerPageCollector({
    get: web.get,
    loadFavorites: async () => favorites,
    findKnownUrls: async () => [],
    wait: async (ms) => waits.push(ms),
    gapMs: () => 0,
    ...extra,
  });
  return { collect: () => instance.collect(), waits };
}

const acme = [{ name: 'Acme', careersUrl: CAREER }];

test('it is registered as a source, named "careerpage"', () => {
  assert.equal(SOURCE, 'careerpage');
  assert.ok(getCollectors().some((c) => c.name === 'careerpage'));
});

test('no favorites: no jobs and no requests at all', async () => {
  const web = fakeWeb({});
  assert.deepEqual(await collector(web, []).collect(), []);
  assert.deepEqual(web.calls, []);
});

test('reads the list page and each job page, and returns the jobs with the favorite\'s name', async () => {
  const web = fakeWeb({
    [CAREER]: listPage('backend-engineer', 'office-manager'),
    'https://acme.example/career/backend-engineer/': { body: jobHtml('Backend Engineer') },
    'https://acme.example/career/office-manager/': { body: jobHtml('Office Manager') },
  });
  const jobs = await collector(web, acme).collect();

  assert.deepEqual(jobs.map((j) => j.title), ['Backend Engineer', 'Office Manager']); // any role, not only tech
  const [first] = jobs;
  assert.equal(first.source, 'careerpage');
  assert.equal(first.company, 'Acme');
  assert.equal(first.url, 'https://acme.example/career/backend-engineer/');
  assert.equal(first.keepAllRoles, true);
  assert.match(first.description, /Responsibilities/);
});

test('robots.txt is read once per site, before the pages', async () => {
  const web = fakeWeb({ [CAREER]: listPage('a', 'b'), 'https://acme.example/career/a/': { body: jobHtml('Dev A') }, 'https://acme.example/career/b/': { body: jobHtml('Dev B') } });
  await collector(web, acme).collect();
  assert.equal(web.calls.filter((url) => url.endsWith('/robots.txt')).length, 1);
  assert.equal(web.calls[0], 'https://acme.example/robots.txt');
});

test('a job page we already saved is not opened again', async () => {
  const web = fakeWeb({
    [CAREER]: listPage('old-job', 'new-job'),
    'https://acme.example/career/new-job/': { body: jobHtml('New Job') },
  });
  const jobs = await collector(web, acme, { findKnownUrls: async () => ['https://acme.example/career/old-job/'] }).collect();
  assert.deepEqual(jobs.map((j) => j.title), ['New Job']);
  assert.equal(web.calls.includes('https://acme.example/career/old-job/'), false);
});

test('at most 20 new job pages per company per scan', async () => {
  const slugs = Array.from({ length: 30 }, (_, i) => `job-${i}`);
  const pages = { [CAREER]: listPage(...slugs) };
  for (const slug of slugs) pages[`https://acme.example/career/${slug}/`] = { body: jobHtml(`Job ${slug}`) };
  const web = fakeWeb(pages);
  const jobs = await collector(web, acme).collect();
  assert.equal(MAX_NEW_JOBS_PER_COMPANY, 20);
  assert.equal(jobs.length, 20);
});

test('a page that is not a job (benefits) is left out; a failing job page does not stop the others', async () => {
  const web = fakeWeb({
    [CAREER]: listPage('benefits', 'broken', 'real-job'),
    'https://acme.example/career/benefits/': { body: '<html><head><title>Benefits | Acme</title></head><body><main><h1>Benefits</h1><p>Free lunch and a friendly team that loves to play games together after work every Friday evening.</p></main></body></html>' },
    'https://acme.example/career/broken/': new Error('socket hang up'),
    'https://acme.example/career/real-job/': { body: jobHtml('Real Job') },
  });
  assert.deepEqual((await collector(web, acme).collect()).map((j) => j.title), ['Real Job']);
});

test('robots.txt rules are followed: a disallowed job page is never requested', async () => {
  const web = fakeWeb({
    'https://acme.example/robots.txt': { body: 'User-agent: *\nDisallow: /career/secret/' },
    [CAREER]: listPage('secret', 'public'),
    'https://acme.example/career/secret/': { body: jobHtml('Secret Job') },
    'https://acme.example/career/public/': { body: jobHtml('Public Job') },
  });
  const jobs = await collector(web, acme).collect();
  assert.deepEqual(jobs.map((j) => j.title), ['Public Job']);
  assert.equal(web.calls.includes('https://acme.example/career/secret/'), false);
});

test('a career page that robots.txt forbids is not read, and counts as a failure', async () => {
  const web = fakeWeb({ 'https://acme.example/robots.txt': { body: 'User-agent: *\nDisallow: /' }, [CAREER]: listPage('a') });
  await assert.rejects(collector(web, acme).collect(), /Acme: Disallowed by robots\.txt/);
  assert.equal(web.calls.includes(CAREER), false);
});

test('one career page failing is only logged when another one works; all failing is an error naming them', async () => {
  const two = [...acme, { name: 'Broken Co', careersUrl: 'https://broken.example/jobs/' }];
  const web = fakeWeb({
    [CAREER]: listPage('dev'),
    'https://acme.example/career/dev/': { body: jobHtml('Dev') },
    'https://broken.example/jobs/': new Error('timeout of 15000ms exceeded'),
  });
  assert.deepEqual((await collector(web, two).collect()).map((j) => j.title), ['Dev']);

  const allBad = fakeWeb({ 'https://broken.example/jobs/': new Error('timeout of 15000ms exceeded') });
  await assert.rejects(
    collector(allBad, [two[1], { name: 'Gone Co', careersUrl: 'https://gone.example/careers/' }]).collect(),
    (err) => /Broken Co: timeout of 15000ms exceeded/.test(err.message) && /Gone Co: HTTP 404/.test(err.message),
  );
});

test('a career page answering with an error status counts as a failure', async () => {
  const web = fakeWeb({ [CAREER]: { status: 503, body: '' } });
  await assert.rejects(collector(web, acme).collect(), /Acme: HTTP 503/);
});

test('the same career page given by two users is read once; broken or unsafe links are ignored', async () => {
  const web = fakeWeb({ [CAREER]: listPage('dev'), 'https://acme.example/career/dev/': { body: jobHtml('Dev') } });
  const favorites = [
    { name: 'Acme', careersUrl: CAREER },
    { name: 'Acme Limited', careersUrl: `${CAREER}#top` }, // same page
    { name: 'Evil', careersUrl: 'https://127.0.0.1/admin' },
    { name: 'Plain', careersUrl: 'http://plain.example/jobs/' },
  ];
  const jobs = await collector(web, favorites).collect();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, 'Acme'); // the first favorite's name
  assert.equal(web.calls.filter((url) => url === CAREER).length, 1);
  assert.equal(web.calls.some((url) => url.includes('127.0.0.1') || url.startsWith('http://')), false);
});

test('it waits between requests to the same site, never between different sites', async () => {
  const two = [...acme, { name: 'Other', careersUrl: 'https://other.example/career/' }];
  const web = fakeWeb({
    [CAREER]: listPage('dev'),
    'https://acme.example/career/dev/': { body: jobHtml('Dev') },
    'https://other.example/career/': listPage('ops'),
    'https://other.example/career/ops/': { body: jobHtml('Ops') },
  });
  let clock = 1_000_000;
  const { collect, waits } = collector(web, two, { gapMs: () => 3000, now: () => clock, wait: async (ms) => { waits.push(ms); clock += ms; } });
  await collect();
  // robots.txt, list page, job page for each site: the 2nd and 3rd request of a site wait 3 seconds,
  // the first request to a site never waits (so 2 + 2 waits, not 6)
  assert.deepEqual(waits, [3000, 3000, 3000, 3000]);
});

test('a Crawl-delay in robots.txt is respected (and capped at 10 seconds)', async () => {
  for (const [delay, expected] of [[5, 5000], [60, 10_000]]) {
    const web = fakeWeb({ 'https://acme.example/robots.txt': { body: `User-agent: *\nCrawl-delay: ${delay}` }, [CAREER]: listPage('dev'), 'https://acme.example/career/dev/': { body: jobHtml('Dev') } });
    let clock = 1_000_000;
    const { collect, waits } = collector(web, acme, { now: () => clock, wait: async (ms) => { waits.push(ms); clock += ms; } });
    await collect();
    assert.equal(Math.max(...waits), expected, `delay ${delay}`);
  }
});

test('the time limit: no new request starts after it, and the rest is reported', async () => {
  const two = [...acme, { name: 'Late Co', careersUrl: 'https://late.example/career/' }];
  const web = fakeWeb({ [CAREER]: listPage('dev'), 'https://acme.example/career/dev/': { body: jobHtml('Dev') } });
  // every request takes 40 ms of the 100 ms budget: the first company (robots, list, job = 120 ms) still gets
  // its job page, then the time is over and the second company is not started
  let clock = 0;
  const slowGet = async (url) => {
    clock += 40;
    return web.get(url);
  };
  const jobs = await collector(web, two, { get: slowGet, budgetMs: 100, now: () => clock }).collect();
  assert.deepEqual(jobs.map((j) => j.title), ['Dev']);
  assert.equal(web.calls.some((url) => url.includes('late.example')), false);
});

test('the jobs go through prepareJobs: a non-tech title is kept, and the company name is the favorite\'s', async () => {
  const web = fakeWeb({ [CAREER]: listPage('office-manager'), 'https://acme.example/career/office-manager/': { body: jobHtml('Office Manager') } });
  const jobs = await collector(web, acme).collect();
  const { rows, skipped } = prepareJobs(jobs);
  assert.equal(skipped, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].company, 'Acme');
  assert.equal(rows[0].source, 'careerpage');
  assert.equal(rows[0].url, 'https://acme.example/career/office-manager/');
});
