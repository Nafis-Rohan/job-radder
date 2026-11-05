import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskEmail, maskPhone, maskPersonalInfo } from '../mask.js';

test('masks emails', () => {
  assert.equal(maskPersonalInfo('Mail me: john.doe+cv@gmail.com now'), 'Mail me: [email] now');
});

test('masks Bangladesh phone numbers in common formats', () => {
  for (const phone of ['01712345678', '01712-345678', '+8801712345678', '+880 1712 345678', '8801712345678']) {
    assert.equal(maskPersonalInfo(`Call ${phone} please`), 'Call [phone] please', phone);
  }
});

test('masks international and US phone numbers', () => {
  assert.equal(maskPersonalInfo('Phone: +44 20 7946 0958'), 'Phone: [phone]');
  assert.equal(maskPersonalInfo('Phone: (555) 123-4567'), 'Phone: [phone]');
});

test('masks address lines', () => {
  const text = 'Name\nAddress: somewhere\nHouse 12, Road 5, Dhanmondi, Dhaka\nSkills';
  assert.equal(maskPersonalInfo(text), 'Name\n[address]\n[address]\nSkills');
});

test('masks social profile links', () => {
  assert.equal(
    maskPersonalInfo('See https://www.linkedin.com/in/someone-123 for more'),
    'See [profile] for more',
  );
});

test('keeps normal CV text, years and versions untouched', () => {
  const text = 'Node.js 22, 2019 - 2022, 3+ years, built 1200 requests per minute';
  assert.equal(maskPersonalInfo(text), text);
});

test('handles empty input', () => {
  assert.equal(maskPersonalInfo(''), '');
  assert.equal(maskPersonalInfo(null), '');
});

test('maskEmail and maskPhone hide most of the value', () => {
  assert.equal(maskEmail('john@gmail.com'), 'j***@gmail.com');
  assert.equal(maskEmail('not-an-email'), '***');
  assert.equal(maskPhone('+880 1712-345678'), '***********78');
  assert.equal(maskPhone('1'), '***');
});
