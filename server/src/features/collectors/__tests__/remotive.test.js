import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseResponse, buildRemotive, MIN_GAP_MS } from '../remotive.js';
import { checkRemoteEligibility } from '../../matching/remoteEligibility.js';

const BODY = JSON.stringify({
  'job-count': 3,
  jobs: [
    {
      id: 1,
      url: 'https://remotive.com/remote-jobs/software-development/senior-node-1',
      title: 'Senior Node.js Engineer',
      company_name: 'Acme',
      tags: ['python', 'java', 'go', 'rust'],
      publication_date: '2026-11-10T14:25:05',
      candidate_required_location: 'LATAM, Europe, USA, Canada, APAC',
      description: '<p>We need 5+ years of <strong>Node.js</strong> and Docker.</p>',
    },
    {
      id: 2,
      url: 'https://remotive.com/remote-jobs/software-development/backend-2',
      title: 'Backend Developer',
      company_name: 'Beta',
      publication_date: 'not a date',
      candidate_required_location: 'USA Only',
      description: 'Plain text',
    },
    {
      id: 3,
      url: 'https://remotive.com/remote-jobs/software-development/dev-3',
      title: 'Developer',
      company_name: 'Gamma',
      description: '',
    },
  ],
});

test('turns the API answer into normalized jobs', () => {
  const [job] = parseResponse(BODY);
  assert.equal(job.source, 'remotive');
  assert.equal(job.url, 'https://remotive.com/remote-jobs/software-development/senior-node-1');
  assert.equal(job.title, 'Senior Node.js Engineer');
  assert.equal(job.company, 'Acme');
  assert.equal(job.isRemote, true);
  assert.equal(job.remoteScope, 'LATAM, Europe, USA, Canada, APAC');
  assert.equal(job.location, 'LATAM, Europe, USA, Canada, APAC');
  assert.equal(job.description, 'We need 5+ years of Node.js and Docker.');
  assert.equal(job.postedAt.getUTCFullYear(), 2026);
});

test('the site tags are not passed on', () => {
  const [job] = parseResponse(BODY);
  assert.equal(job.skillTags, undefined);
});

test('a bad date or a missing location becomes empty, not a crash', () => {
  const jobs = parseResponse(BODY);
  assert.equal(jobs[1].postedAt, undefined);
  assert.equal(jobs[2].remoteScope, undefined);
  assert.equal(jobs[2].location, undefined);
});

test('the location text feeds the eligibility check', () => {
  const jobs = parseResponse(BODY);
  assert.equal(checkRemoteEligibility(jobs[0]), 'ELIGIBLE'); // APAC is in the list
  assert.equal(checkRemoteEligibility(jobs[1]), 'NOT_ELIGIBLE');
  assert.equal(checkRemoteEligibility(jobs[2]), 'UNKNOWN');
});

test('an answer that is not a jobs list is an error', () => {
  assert.throws(() => parseResponse('{"message":"blocked"}'), /no jobs list/);
  assert.throws(() => parseResponse('not json'));
});

test('a second request inside the limit window is not sent', async () => {
  let calls = 0;
  let time = 1_000_000;
  const remotive = buildRemotive({ get: async () => (calls += 1, BODY), now: () => time });

  assert.equal((await remotive.collect()).length, 3);
  time += 60_000; // a minute later (a manual scan)
  assert.deepEqual(await remotive.collect(), []);
  assert.equal(calls, 1);

  time += MIN_GAP_MS; // the next scheduled scan
  assert.equal((await remotive.collect()).length, 3);
  assert.equal(calls, 2);
});

test('a failed request also starts the wait', async () => {
  let calls = 0;
  const remotive = buildRemotive({
    get: async () => {
      calls += 1;
      throw new Error('down');
    },
    now: () => 5,
  });
  await assert.rejects(remotive.collect(), /down/);
  assert.deepEqual(await remotive.collect(), []);
  assert.equal(calls, 1);
});
