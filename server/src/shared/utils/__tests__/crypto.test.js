import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from '../crypto.js';

const key = randomBytes(32);

test('decrypt returns the original text', () => {
  const text = 'JBSWY3DPEHPK3PXP';
  assert.equal(decrypt(encrypt(text, key), key), text);
});

test('works with unicode and empty text', () => {
  assert.equal(decrypt(encrypt('বাংলা 日本語 ✓', key), key), 'বাংলা 日本語 ✓');
  assert.equal(decrypt(encrypt('', key), key), '');
});

test('same text gives a different ciphertext each time (random IV)', () => {
  assert.notEqual(encrypt('same', key), encrypt('same', key));
});

test('does not contain the plain text', () => {
  assert.ok(!encrypt('my-secret-value', key).includes('my-secret-value'));
});

test('fails with the wrong key', () => {
  const payload = encrypt('secret', key);
  assert.throws(() => decrypt(payload, randomBytes(32)));
});

test('fails if the ciphertext was changed', () => {
  const [iv, tag, data] = encrypt('secret', key).split(':');
  const tampered = Buffer.from(data, 'base64');
  tampered[0] ^= 1;
  assert.throws(() => decrypt([iv, tag, tampered.toString('base64')].join(':'), key));
});

test('fails on a malformed payload', () => {
  assert.throws(() => decrypt('not-valid', key));
});
