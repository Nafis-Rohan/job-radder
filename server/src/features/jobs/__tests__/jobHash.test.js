import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobHash } from '../jobHash.js';

const job = { company: 'Pathao', title: 'Backend Engineer', location: 'Dhaka' };

test('gives a 64-character hex hash', () => {
  assert.match(jobHash(job), /^[0-9a-f]{64}$/);
});

test('the same job always gives the same hash', () => {
  assert.equal(jobHash(job), jobHash({ ...job }));
});

test('ignores upper/lower case and extra spaces', () => {
  const messy = { company: '  PATHAO ', title: 'backend   ENGINEER', location: ' dhaka\n' };
  assert.equal(jobHash(messy), jobHash(job));
});

test('a different company, title or location gives a different hash', () => {
  assert.notEqual(jobHash({ ...job, company: 'bKash' }), jobHash(job));
  assert.notEqual(jobHash({ ...job, title: 'Frontend Engineer' }), jobHash(job));
  assert.notEqual(jobHash({ ...job, location: 'Chattogram' }), jobHash(job));
});

test('missing location equals empty location', () => {
  const { location, ...noLocation } = job;
  assert.equal(jobHash(noLocation), jobHash({ ...job, location: '' }));
  assert.equal(jobHash({ ...job, location: null }), jobHash({ ...job, location: '' }));
});

test('a "|" inside a field cannot move the border between fields', () => {
  const a = jobHash({ company: 'a|b', title: 'c', location: 'd' });
  const b = jobHash({ company: 'a', title: 'b|c', location: 'd' });
  assert.notEqual(a, b);
});

test('fields cannot be shifted to fake the same hash', () => {
  const a = jobHash({ company: 'a b', title: 'c', location: 'd' });
  const b = jobHash({ company: 'a', title: 'b c', location: 'd' });
  assert.notEqual(a, b);
});
