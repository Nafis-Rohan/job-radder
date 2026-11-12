import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRemoteEligibility } from '../remoteEligibility.js';

const check = (remoteScope, extra = {}) => checkRemoteEligibility({ remoteScope, ...extra });

test('worldwide-style scopes are eligible', () => {
  assert.equal(check('Worldwide'), 'ELIGIBLE');
  assert.equal(check('Anywhere in the World'), 'ELIGIBLE');
  assert.equal(check('Global'), 'ELIGIBLE');
  assert.equal(check('Asia'), 'ELIGIBLE');
  assert.equal(check('APAC'), 'ELIGIBLE');
  assert.equal(check('South Asia'), 'ELIGIBLE');
  assert.equal(check('Bangladesh'), 'ELIGIBLE');
});

test('"only" scopes are not eligible', () => {
  assert.equal(check('USA only'), 'NOT_ELIGIBLE');
  assert.equal(check('US Only'), 'NOT_ELIGIBLE');
  assert.equal(check('Europe only'), 'NOT_ELIGIBLE');
  assert.equal(check('UK-based'), 'NOT_ELIGIBLE');
  assert.equal(check('Canada Only'), 'NOT_ELIGIBLE');
});

test('a list of only restricted places is not eligible', () => {
  assert.equal(check('Remote, US or Canada'), 'NOT_ELIGIBLE');
  assert.equal(check('United States, Canada'), 'NOT_ELIGIBLE');
  assert.equal(check('Europe / UK'), 'NOT_ELIGIBLE');
});

test('a list with one open place is not decided by the list rule', () => {
  assert.equal(check('Remote, US or Asia'), 'ELIGIBLE');
});

test('timezone ranges: eligible only when UTC+6 is inside', () => {
  assert.equal(check('UTC-2 to UTC+8'), 'ELIGIBLE');
  assert.equal(check('GMT+3 – GMT+9'), 'ELIGIBLE');
  assert.equal(check('UTC-8 to UTC-4'), 'NOT_ELIGIBLE');
  assert.equal(check('UTC+7 to UTC+9'), 'NOT_ELIGIBLE');
});

test('descriptions are read too', () => {
  assert.equal(
    check('', { description: 'You must be located in the US and authorized to work in the United States.' }),
    'NOT_ELIGIBLE',
  );
  assert.equal(check('', { description: 'Candidates must hold an active security clearance.' }), 'NOT_ELIGIBLE');
  assert.equal(check('', { description: 'We hire people worldwide and work async.' }), 'ELIGIBLE');
});

test('NOT_ELIGIBLE wins over ELIGIBLE', () => {
  assert.equal(check('Worldwide', { description: 'Candidates must be US citizens.' }), 'NOT_ELIGIBLE');
  assert.equal(check('Asia, Europe only'), 'NOT_ELIGIBLE');
});

test('unclear or empty text is UNKNOWN', () => {
  assert.equal(check('Remote'), 'UNKNOWN');
  assert.equal(check(''), 'UNKNOWN');
  assert.equal(checkRemoteEligibility(), 'UNKNOWN');
  assert.equal(check(null, { description: 'Great team, great product.' }), 'UNKNOWN');
});

test('"global" in a description alone does not make a job eligible', () => {
  assert.equal(check('', { description: 'We are a global company building tools.' }), 'UNKNOWN');
});

test('the location is not used for the list rule when a scope exists', () => {
  assert.equal(check('Worldwide', { location: 'United States' }), 'ELIGIBLE');
  assert.equal(check('', { location: 'United States' }), 'NOT_ELIGIBLE');
});

test('words inside other words do not count', () => {
  assert.equal(check('Remote', { description: 'Business hours in Pacific Asian markets' }), 'UNKNOWN');
});
