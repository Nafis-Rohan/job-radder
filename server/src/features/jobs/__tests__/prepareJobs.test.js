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

test('keeps only valid dates and trims long text', () => {
  const { rows } = prepareJobs([
    { ...job, postedAt: new Date('nope'), deadline: '2026-01-01', title: 'T'.repeat(500) },
  ]);
  assert.equal(rows[0].postedAt, null);
  assert.equal(rows[0].deadline, null);
  assert.equal(rows[0].title.length, 300);
});
