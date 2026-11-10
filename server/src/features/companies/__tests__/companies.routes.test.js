import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import app from '../../../app.js';
import { buildCompaniesRouter } from '../companies.routes.js';
import { buildCompaniesController } from '../companies.controller.js';

const loginAs = (id) => [
  (req, res, next) => {
    req.user = { id, role: 'USER' };
    next();
  },
];

// A fake service that records its calls and answers with `answer`.
function fakeService(answer = {}) {
  const calls = [];
  const record = (name) => async (...args) => {
    calls.push({ name, args });
    return typeof answer[name] === 'function' ? answer[name](...args) : answer[name];
  };
  return {
    calls,
    service: {
      MAX_FAVORITES_PER_USER: 30,
      listFavorites: record('list'),
      createFavorite: record('create'),
      updateFavorite: record('update'),
      deleteFavorite: record('delete'),
    },
  };
}

async function withServer(service, fn) {
  const router = buildCompaniesRouter({ guard: loginAs('user-1'), controller: buildCompaniesController({ service }) });
  const server = express().use(express.json()).use('/api/companies', router).listen(0);
  const base = `http://localhost:${server.address().port}/api/companies`;
  const send = (path, method, body) =>
    fetch(`${base}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    await fn(send);
  } finally {
    server.close();
  }
}

const body = { name: 'Vivasoft', careersUrl: 'https://vivasoftltd.com/career/' };

test('not logged in: 401 on every route (real app)', async () => {
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}/api/companies`;
  try {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${base}/abc`, { method: 'PATCH' })).status, 401);
    assert.equal((await fetch(`${base}/abc`, { method: 'DELETE' })).status, 401);
  } finally {
    server.close();
  }
});

test('list: 200 and always the logged-in user', async () => {
  const { service, calls } = fakeService({ list: [{ id: 'c1', name: 'Vivasoft' }] });
  await withServer(service, async (send) => {
    const res = await send('', 'GET');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { companies: [{ id: 'c1', name: 'Vivasoft' }] });
  });
  assert.deepEqual(calls[0].args, ['user-1']);
});

test('create: 201 with the company; the checked body (clean link, aliases) reaches the service', async () => {
  const { service, calls } = fakeService({ create: { status: 'ok', company: { id: 'c1', name: 'Vivasoft' } } });
  await withServer(service, async (send) => {
    const res = await send('', 'POST', { ...body, careersUrl: 'https://vivasoftltd.com/career/#open-position', aliases: ['Viva', 'viva'] });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { company: { id: 'c1', name: 'Vivasoft' } });
  });
  assert.deepEqual(calls[0].args, ['user-1', { name: 'Vivasoft', aliases: ['Viva'], careersUrl: 'https://vivasoftltd.com/career/' }]);
});

test('create: 409 for a duplicate and for the limit', async () => {
  for (const [status, text] of [['duplicate', 'You already have this company'], ['limit', 'You can have at most 30 favorite companies']]) {
    const { service } = fakeService({ create: { status } });
    await withServer(service, async (send) => {
      const res = await send('', 'POST', body);
      assert.equal(res.status, 409, status);
      assert.deepEqual(await res.json(), { error: text });
    });
  }
});

test('create: 400 for a missing or unsafe career page, and the service is never called', async () => {
  const { service, calls } = fakeService({ create: { status: 'ok', company: {} } });
  await withServer(service, async (send) => {
    for (const bad of [
      { name: 'Vivasoft' },
      { ...body, careersUrl: 'http://vivasoftltd.com/career/' },
      { ...body, careersUrl: 'https://169.254.169.254/latest/meta-data/' },
      { ...body, careersUrl: 'https://localhost/' },
      { ...body, userId: 'someone-else' },
    ]) {
      const res = await send('', 'POST', bad);
      assert.equal(res.status, 400, JSON.stringify(bad));
      assert.equal((await res.json()).error, 'Validation failed');
    }
  });
  assert.equal(calls.length, 0);
});

test('update: 200, 404 when not found, 409 for a duplicate, 400 for an empty body', async () => {
  const ok = fakeService({ update: { status: 'ok', company: { id: 'c1', name: 'New' } } });
  await withServer(ok.service, async (send) => {
    const res = await send('/c1', 'PATCH', { name: 'New' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { company: { id: 'c1', name: 'New' } });
    assert.equal((await send('/c1', 'PATCH', {})).status, 400);
  });
  assert.deepEqual(ok.calls[0].args, ['user-1', 'c1', { name: 'New' }]);

  const missing = fakeService({ update: { status: 'notfound' } });
  await withServer(missing.service, async (send) => {
    const res = await send('/nope', 'PATCH', { name: 'New' });
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'Company not found' });
  });

  const duplicate = fakeService({ update: { status: 'duplicate' } });
  await withServer(duplicate.service, async (send) => {
    assert.equal((await send('/c1', 'PATCH', { name: 'Other' })).status, 409);
  });
});

test('delete: 200 or 404', async () => {
  const yes = fakeService({ delete: true });
  await withServer(yes.service, async (send) => {
    const res = await send('/c1', 'DELETE');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });
  assert.deepEqual(yes.calls[0].args, ['user-1', 'c1']);

  const no = fakeService({ delete: false });
  await withServer(no.service, async (send) => {
    assert.equal((await send('/nope', 'DELETE')).status, 404);
  });
});
