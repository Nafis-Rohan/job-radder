import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDomain } from '../detectDomain.js';

test('finds a domain from its words', () => {
  assert.deepEqual(detectDomain('Built a mobile banking and payment gateway'), ['fintech']);
});

test('finds several domains, strongest first', () => {
  const domains = detectDomain(
    'E-commerce marketplace with checkout and inventory, plus a payment gateway',
  );
  assert.equal(domains[0], 'e-commerce');
  assert.ok(domains.includes('fintech'));
});

test('returns at most max domains', () => {
  const text = 'fintech e-commerce healthcare education logistics telecom';
  assert.equal(detectDomain(text).length, 3);
  assert.equal(detectDomain(text, { max: 5 }).length, 5);
});

test('does not match inside other words', () => {
  assert.deepEqual(detectDomain('The pharmacy of ideas'), ['healthcare']);
  assert.deepEqual(detectDomain('We use continuous delivery'), []);
});

test('empty list when nothing matches', () => {
  assert.deepEqual(detectDomain('Generic software engineer'), []);
  assert.deepEqual(detectDomain(''), []);
  assert.deepEqual(detectDomain(null), []);
});
