import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  signToken,
  verifyToken,
  signTempToken,
  verifyTempToken,
} from '../tokens.js';

const user = { id: 'user-1', role: 'ADMIN' };

test('a session token verifies and carries id and role', () => {
  const payload = verifyToken(signToken(user));
  assert.equal(payload.sub, 'user-1');
  assert.equal(payload.role, 'ADMIN');
});

test('a temp token verifies as a temp token', () => {
  assert.equal(verifyTempToken(signTempToken(user)).sub, 'user-1');
});

test('a temp token is rejected as a session token', () => {
  assert.throws(() => verifyToken(signTempToken(user)));
});

test('a session token is rejected as a temp token', () => {
  assert.throws(() => verifyTempToken(signToken(user)));
});

test('a garbage token is rejected', () => {
  assert.throws(() => verifyToken('abc'));
  assert.throws(() => verifyTempToken('abc'));
});
