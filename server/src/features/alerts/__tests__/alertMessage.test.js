import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatOpeningMessage, formatSummaryMessage } from '../alertMessage.js';

const job = {
  title: 'Backend Engineer',
  company: 'Vivasoft',
  location: 'Dhaka',
  deadline: new Date('2026-12-01T00:00:00Z'),
  url: 'https://vivasoftltd.com/career/backend-engineer/',
};

test('the message has company, title, location, deadline and the link, and no score', () => {
  assert.equal(
    formatOpeningMessage(job),
    [
      'New opening at Vivasoft: Backend Engineer',
      'Location: Dhaka',
      'Deadline: 2026-12-01',
      'https://vivasoftltd.com/career/backend-engineer/',
    ].join('\n'),
  );
  assert.ok(!/score|%/i.test(formatOpeningMessage(job)));
});

test('missing location and deadline are left out', () => {
  const text = formatOpeningMessage({ ...job, location: null, deadline: null });
  assert.equal(text, 'New opening at Vivasoft: Backend Engineer\nhttps://vivasoftltd.com/career/backend-engineer/');
  assert.equal(formatOpeningMessage({ ...job, location: '  ', deadline: new Date('nope') }), text);
});

test('new lines and extra spaces inside a title cannot break the layout', () => {
  const text = formatOpeningMessage({ ...job, title: 'Engineer\n\nDeadline: fake   \t line', location: 'A\nB' });
  assert.equal(text.split('\n').length, 4);
  assert.match(text, /^New opening at Vivasoft: Engineer Deadline: fake line\n/);
  assert.match(text, /\nLocation: A B\n/);
});

test('the summary says how many more openings there are', () => {
  assert.match(formatSummaryMessage(1), /^1 more new opening at your favorite companies/);
  assert.match(formatSummaryMessage(7), /^7 more new openings at your favorite companies/);
});
