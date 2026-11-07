import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareJobs } from '../prepareJobs.js';

const job = {
  source: 'weworkremotely',
  url: 'https://example.com/jobs/1',
  title: 'Senior Backend Engineer',
  company: 'Acme',
  location: 'Worldwide',
  description: 'We need 6+ years of Node.js, PostgreSQL and Docker for our payment and fintech platform.',
  isRemote: true,
  remoteScope: 'Anywhere in the World',
};

test('adds hash, skills, level and domains', () => {
  const { rows } = prepareJobs([job]);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.match(row.hash, /^[0-9a-f]{64}$/);
  assert.ok(row.skills.includes('node.js'));
  assert.ok(row.skills.includes('postgresql'));
  assert.equal(row.level, 'SENIOR');
  assert.ok(row.domains.includes('fintech'));
  assert.equal(row.isRemote, true);
  assert.equal(row.remoteScope, 'Anywhere in the World');
});

test('level comes from the years when the title has no level word', () => {
  const { rows } = prepareJobs([{ ...job, title: 'Backend Engineer', description: '3+ years of Java.' }]);
  assert.equal(rows[0].level, 'MID');
});

test('drops the same job twice in one batch (same url, or same company/title/location)', () => {
  const sameUrl = { ...job, title: 'Another title' };
  const sameHash = { ...job, url: 'https://example.com/jobs/2' };
  const { rows, repeated } = prepareJobs([job, sameUrl, sameHash]);
  assert.equal(rows.length, 1);
  assert.equal(repeated, 2);
});

test('counts bad jobs and never crashes on them', () => {
  const bad = [
    null,
    { ...job, title: '   ' },
    { ...job, company: '' },
    { ...job, url: 'not a url' },
    { ...job, url: 'javascript:alert(1)' },
    { ...job, source: '' },
  ];
  const { rows, invalid } = prepareJobs(bad);
  assert.equal(rows.length, 0);
  assert.equal(invalid, bad.length);
});

test('keeps valid dates, drops invalid ones, and trims long text', () => {
  const posted = new Date('2026-11-05T10:00:00Z');
  const { rows } = prepareJobs([
    { ...job, postedAt: posted, deadline: new Date('nope'), title: 'T'.repeat(500) },
    { ...job, url: 'https://example.com/jobs/9', title: 'Other', deadline: '2026-01-01' },
  ]);
  assert.equal(rows[0].postedAt.getTime(), posted.getTime());
  assert.equal(rows[0].deadline, null);
  assert.equal(rows[0].title.length, 300);
  assert.equal(rows[1].deadline, null); // a string is not a Date
});

test('two titles that only differ after the length limit are not the same job', () => {
  const long = 'T'.repeat(400);
  const { rows, repeated } = prepareJobs([
    { ...job, title: `${long}A` },
    { ...job, url: 'https://example.com/jobs/2', title: `${long}B` },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(repeated, 0);
});

test("the site's own skill tags count as skills", () => {
  const { rows } = prepareJobs([{ ...job, description: 'Join our team.', skillTags: 'Python, Docker' }]);
  assert.ok(rows[0].skills.includes('python'));
  assert.ok(rows[0].skills.includes('docker'));
});

test('non-tech jobs are skipped and counted', () => {
  const { rows, skipped } = prepareJobs([
    { ...job, title: 'HR Executive', description: 'Hire people.', url: 'https://example.com/jobs/hr' },
    { ...job, title: 'Accounts Officer', description: 'Books.', url: 'https://example.com/jobs/acc' },
    job,
  ]);
  assert.equal(rows.length, 1);
  assert.equal(skipped, 2);
});

test('years asked for are saved as minYears and maxYears', () => {
  const [range] = prepareJobs([{ ...job, description: 'We need 1-3 years with Node.js and Docker.' }]).rows;
  assert.equal(range.minYears, 1);
  assert.equal(range.maxYears, 3);
  const [open] = prepareJobs([{ ...job, description: '5+ years with Node.js and Docker.' }]).rows;
  assert.equal(open.minYears, 5);
  assert.equal(open.maxYears, null);
});

test('only 6000 characters of the description are stored, but all of it is read', () => {
  const description = `${'x '.repeat(4000)}We need 4 years of Node.js and Docker.`;
  const [row] = prepareJobs([{ ...job, title: 'Backend Engineer', description }]).rows;
  assert.equal(row.description.length, 6000);
  assert.equal(row.minYears, 4);
  assert.ok(row.skills.includes('node.js'));
});

test('remote jobs start as UNKNOWN eligibility, other jobs have none', () => {
  const { rows } = prepareJobs([job, { ...job, url: 'https://example.com/jobs/3', title: 'Office job', isRemote: false }]);
  assert.equal(rows[0].eligibility, 'UNKNOWN');
  assert.equal(rows[1].eligibility, null);
});
