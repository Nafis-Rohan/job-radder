import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireRole } from '../requireRole.js';

function run(user, ...roles) {
  const req = { user };
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;

  requireRole(...roles)(req, res, () => {
    nextCalled = true;
  });

  return { res, nextCalled };
}

test('lets through a user with an allowed role', () => {
  const { res, nextCalled } = run({ role: 'ADMIN' }, 'ADMIN');
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('blocks a user with the wrong role with 403', () => {
  const { res, nextCalled } = run({ role: 'USER' }, 'ADMIN');
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('blocks a missing user with 401', () => {
  const { res, nextCalled } = run(undefined, 'ADMIN');
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('accepts any role from a list', () => {
  const { nextCalled } = run({ role: 'USER' }, 'ADMIN', 'USER');
  assert.equal(nextCalled, true);
});
