import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findJobLinks, parseJobPage, extractJobPostings, cleanTitle, MAX_LINKS } from '../careerPageParser.js';

const PAGE = 'https://vivasoftltd.com/career/';

// A career page shaped like Vivasoft's: job cards with "Apply Now", plus menu links and another company's board.
const LIST = `
<html><body>
  <nav><a href="/">Home</a><a href="/about/">About</a><a href="/career/">Career</a></nav>
  <a href="#open-position">See open positions</a>
  <div class="card"><h3>Assistant Manager, Key Accounts - Telco</h3>
    <a href="https://vivasoftltd.com/career/assistant-manager-key-accounts-telco/">Apply Now</a></div>
  <div class="card"><h3>Senior Backend Engineer</h3>
    <a href="/career/senior-backend-engineer/?utm_source=home&utm_medium=card">Apply Now</a></div>
  <div class="card"><a href="https://www.vivasoftltd.com/career/senior-backend-engineer/#apply">Apply Now</a></div>
  <a href="/career/life-at-vivasoft/">Life at Vivasoft</a>
  <a href="/career/benefits/">Benefits</a>
  <a href="https://app.novara.com.my/jobs/cloud-security-engineer-61b4499d">Apply Now</a>
  <a href="http://vivasoftltd.com/career/insecure-job/">Apply Now</a>
  <a href="/career/handbook.pdf">Apply Now</a>
  <a href="mailto:hr@vivasoftltd.com">Apply Now</a>
  <a href="javascript:void(0)">Apply Now</a>
  <a href="/career/?page=2">Apply Now</a>
</body></html>`;

test('job links: only links of the same site under the career path, from the "Apply Now" cards', () => {
  assert.deepEqual(findJobLinks(LIST, PAGE), [
    'https://vivasoftltd.com/career/assistant-manager-key-accounts-telco/',
    'https://vivasoftltd.com/career/senior-backend-engineer/', // utm_ removed, www and #apply are the same page
  ]);
});

test('job links: the other company\'s board, http, files, mailto, javascript and the career page itself are skipped', () => {
  const links = findJobLinks(LIST, PAGE).join(' ');
  for (const bad of ['novara', 'http://', '.pdf', 'mailto', 'javascript', 'page=2', 'benefits']) {
    assert.equal(links.includes(bad), false, bad);
  }
});

test('job links: with no "Apply" texts, every link under the career path is used', () => {
  const html = `<a href="/career/backend-engineer/">Backend Engineer</a><a href="/career/frontend-engineer/">Frontend Engineer</a><a href="/blog/">Blog</a>`;
  assert.deepEqual(findJobLinks(html, PAGE), [
    'https://vivasoftltd.com/career/backend-engineer/',
    'https://vivasoftltd.com/career/frontend-engineer/',
  ]);
});

test('job links: a career page without a path (home page) uses /jobs/, /careers/, /openings/ style links', () => {
  const html = `<a href="/jobs/backend-engineer">Backend</a><a href="/careers/data-analyst">Data</a><a href="/about">About</a><a href="/jobs/">All jobs</a>`;
  assert.deepEqual(findJobLinks(html, 'https://example.com/'), [
    'https://example.com/jobs/backend-engineer',
    'https://example.com/careers/data-analyst',
  ]);
});

test('job links: a career page at /jobs (no slash) works, and a relative link is resolved', () => {
  const html = `<a href="backend-engineer">Apply</a><a href="/jobs/data-analyst">Apply</a>`;
  assert.deepEqual(findJobLinks(html, 'https://example.com/jobs'), ['https://example.com/jobs/data-analyst']);
});

test('job links: JobPosting data on the list page adds its links; no links gives an empty list', () => {
  const html = `<script type="application/ld+json">{"@type":"JobPosting","title":"Dev","url":"https://example.com/careers/dev-1"}</script>`;
  assert.deepEqual(findJobLinks(html, 'https://example.com/careers/'), ['https://example.com/careers/dev-1']);
  assert.deepEqual(findJobLinks('<p>No jobs today</p>', PAGE), []);
  assert.deepEqual(findJobLinks('', PAGE), []);
});

test('job links: at most MAX_LINKS', () => {
  const html = Array.from({ length: MAX_LINKS + 30 }, (_, i) => `<a href="/career/job-${i}/">Apply</a>`).join('');
  assert.equal(findJobLinks(html, PAGE).length, MAX_LINKS);
});

// ---- structured data ----
const POSTING = {
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: 'Senior Backend Engineer | Acme Ltd.',
  description: '<p>Build <b>APIs</b> in Node.js.</p><ul><li>Own services</li></ul>',
  datePosted: '2026-11-01',
  validThrough: '2026-12-31T23:59:00Z',
  jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Dhaka', addressCountry: 'BD' } },
};
const withLd = (data) => `<html><head><script type="application/ld+json">${JSON.stringify(data)}</script></head><body></body></html>`;

test('extractJobPostings finds JobPosting in a plain block, a list, @graph, and ignores broken blocks', () => {
  assert.equal(extractJobPostings(withLd(POSTING)).length, 1);
  assert.equal(extractJobPostings(withLd([{ '@type': 'BreadcrumbList' }, POSTING])).length, 1);
  assert.equal(extractJobPostings(withLd({ '@graph': [{ '@type': 'WebSite' }, POSTING] })).length, 1);
  assert.equal(extractJobPostings(withLd({ '@type': ['Thing', 'JobPosting'], title: 'x' })).length, 1);
  assert.equal(extractJobPostings(withLd({ '@type': 'BreadcrumbList' })).length, 0);
  assert.equal(extractJobPostings('<script type="application/ld+json">{ not json </script>').length, 0);
});

test('job page with JobPosting data: title, text description, location and dates', () => {
  const job = parseJobPage(withLd(POSTING));
  assert.equal(job.title, 'Senior Backend Engineer');
  assert.match(job.description, /Build APIs in Node\.js\./);
  assert.match(job.description, /- Own services/);
  assert.equal(job.description.includes('<'), false);
  assert.equal(job.location, 'Dhaka, BD');
  assert.equal(job.postedAt.toISOString(), '2026-11-01T00:00:00.000Z');
  assert.equal(job.deadline.toISOString(), '2026-12-31T23:59:00.000Z');
  assert.equal(job.isRemote, false);
});

test('job page with JobPosting data: remote jobs, several or text locations, bad dates', () => {
  const remote = parseJobPage(withLd({ ...POSTING, jobLocationType: 'TELECOMMUTE', datePosted: 'not a date', validThrough: undefined }));
  assert.equal(remote.isRemote, true);
  assert.equal(remote.postedAt, undefined);
  assert.equal(remote.deadline, undefined);

  const many = parseJobPage(withLd({ ...POSTING, jobLocation: [{ address: { addressLocality: 'Dhaka' } }, { address: { addressLocality: 'Dhaka' } }, { address: 'Chattogram, BD' }] }));
  assert.equal(many.location, 'Dhaka, Chattogram, BD');
  assert.equal(parseJobPage(withLd({ ...POSTING, jobLocation: undefined })).location, undefined);
});

// ---- a page without structured data (like Vivasoft's real job pages) ----
const PLAIN = `<html><head>
  <title>Assistant Manager, Key Accounts - Telco | Vivasoft Ltd.</title>
  <meta property="og:title" content="Assistant Manager, Key Accounts - Telco | Vivasoft Ltd.">
  <meta name="description" content="We are seeking an Assistant Manager.">
  </head><body>
  <header><a href="/">Vivasoft</a> Menu Menu Menu</header>
  <main>
    <h2>Assistant Manager, Key Accounts (Telecommunications)</h2>
    <script>var junk = "<img src=x> tracking code";</script>
    <style>.a { color: red }</style>
    <h3>Overview</h3>
    <p>We are seeking an Assistant Manager, Key Accounts to focus on the Telecommunications sector. You will drive sales of IT solutions.</p>
    <h3>Responsibilities:</h3>
    <ul><li>Lead the end-to-end B2B sales cycle</li><li>Manage top-tier telco clients</li></ul>
    <form><input name="email"> Subscribe to our newsletter</form>
    <button>Apply</button>
  </main>
  <footer>Copyright Vivasoft. All rights reserved.</footer>
  </body></html>`;

test('job page without structured data: title from the page title (company part removed), main text only', () => {
  const job = parseJobPage(PLAIN);
  assert.equal(job.title, 'Assistant Manager, Key Accounts - Telco');
  assert.match(job.description, /We are seeking an Assistant Manager/);
  assert.match(job.description, /- Lead the end-to-end B2B sales cycle/);
  for (const junk of ['tracking code', 'color: red', 'Subscribe', 'Copyright', 'Menu Menu', '<img']) {
    assert.equal(job.description.includes(junk), false, junk);
  }
  assert.equal(job.location, undefined);
  assert.equal(job.isRemote, false);
});

test('job page: an <h1> is the title when there is one; with neither h1 nor titles the page is not a job', () => {
  const withH1 = PLAIN.replace('<main>', '<main><h1>Key Accounts Manager</h1>');
  assert.equal(parseJobPage(withH1).title, 'Key Accounts Manager');
  const noTitle = PLAIN.replace(/<title>.*<\/title>/, '').replace(/<meta property="og:title"[^>]*>/, '');
  assert.equal(parseJobPage(noTitle), null);
});

test('job page: a page that is not a job (benefits, culture, a menu) is rejected', () => {
  const benefits = `<html><head><title>Benefits | Vivasoft Ltd.</title></head><body><main><h1>Benefits</h1>
    <p>Free lunch every day, a gym membership, yearly trips and a friendly team that loves to play games together.</p></main></body></html>`;
  assert.equal(parseJobPage(benefits), null);
  assert.equal(parseJobPage('<html><body><main><h1>Jobs</h1><p>Apply</p></main></body></html>'), null); // too short
  assert.equal(parseJobPage(''), null);
});

test('job page: when the main text is tiny, the page description is used', () => {
  const html = `<html><head><title>Data Analyst | Acme</title>
    <meta name="description" content="We are looking for a Data Analyst who will apply statistics to real problems and report the results to our product team every week."></head>
    <body><main><h1>Data Analyst</h1></main></body></html>`;
  const job = parseJobPage(html);
  assert.equal(job.title, 'Data Analyst');
  assert.match(job.description, /^We are looking for a Data Analyst/);
});

test('cleanTitle: removes the company part after | – —, keeps " - " inside a title, trims and cuts long titles', () => {
  assert.equal(cleanTitle('Backend Engineer | Acme Ltd.'), 'Backend Engineer');
  assert.equal(cleanTitle('Backend Engineer – Acme'), 'Backend Engineer');
  assert.equal(cleanTitle('Backend Engineer — Remote | Acme'), 'Backend Engineer — Remote');
  assert.equal(cleanTitle('Key Accounts - Telco'), 'Key Accounts - Telco');
  assert.equal(cleanTitle('  Senior   Dev  '), 'Senior Dev');
  assert.equal(cleanTitle('x'.repeat(500)).length, 300);
  assert.equal(cleanTitle(''), '');
  assert.equal(cleanTitle(undefined), '');
});
