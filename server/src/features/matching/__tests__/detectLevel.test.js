import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLevel } from '../detectLevel.js';

test('reads the level from the title', () => {
  assert.equal(detectLevel('Senior Backend Engineer'), 'SENIOR');
  assert.equal(detectLevel('Sr. Software Engineer'), 'SENIOR');
  assert.equal(detectLevel('Junior Node.js Developer'), 'JUNIOR');
  assert.equal(detectLevel('Jr. Developer'), 'JUNIOR');
  assert.equal(detectLevel('Software Engineering Intern'), 'INTERN');
  assert.equal(detectLevel('Tech Lead'), 'LEAD');
  assert.equal(detectLevel('Principal Engineer'), 'LEAD');
  assert.equal(detectLevel('Mid-level Python Developer'), 'MID');
});

test('lead wins over senior ("Senior Tech Lead")', () => {
  assert.equal(detectLevel('Senior Tech Lead'), 'LEAD');
});

test('does not mistake other words for levels', () => {
  assert.equal(detectLevel('Software Engineer', 3), 'MID');
  assert.equal(detectLevel('Leading the team is not a title'), 'UNKNOWN');
});

test('uses years of experience when the text has no level', () => {
  assert.equal(detectLevel('Software Engineer', 0), 'INTERN');
  assert.equal(detectLevel('Software Engineer', 1), 'JUNIOR');
  assert.equal(detectLevel('Software Engineer', 3), 'MID');
  assert.equal(detectLevel('Software Engineer', 6), 'SENIOR');
  assert.equal(detectLevel('Software Engineer', 12), 'LEAD');
});

test('a written level beats the years', () => {
  assert.equal(detectLevel('Junior Developer', 8), 'JUNIOR');
});

test('UNKNOWN when there is nothing to decide with', () => {
  assert.equal(detectLevel('Software Engineer'), 'UNKNOWN');
  assert.equal(detectLevel('', null), 'UNKNOWN');
  assert.equal(detectLevel(null), 'UNKNOWN');
});
