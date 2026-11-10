import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCompanySchema, updateCompanySchema, companyIdParamSchema } from '../companies.schemas.js';

const create = (body) => createCompanySchema.safeParse(body);
const valid = { name: 'Vivasoft', careersUrl: 'https://vivasoftltd.com/career/' };

test('a name and a career page are enough; aliases default to an empty list', () => {
  const { success, data } = create(valid);
  assert.equal(success, true);
  assert.deepEqual(data, { name: 'Vivasoft', aliases: [], careersUrl: 'https://vivasoftltd.com/career/' });
});

test('the career page is required', () => {
  const result = create({ name: 'Vivasoft' });
  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].path[0], 'careersUrl');
  assert.equal(create({ name: 'Vivasoft', careersUrl: '' }).success, false);
});

test('the career page must be a public https link; the #fragment is removed', () => {
  for (const bad of ['http://vivasoftltd.com/career/', 'https://localhost/', 'https://127.0.0.1/', 'https://169.254.169.254/', 'vivasoftltd.com/career', 'https://user:pw@example.com/']) {
    assert.equal(create({ ...valid, careersUrl: bad }).success, false, bad);
  }
  assert.equal(create({ ...valid, careersUrl: 'https://vivasoftltd.com/career/#open-position' }).data.careersUrl, 'https://vivasoftltd.com/career/');
});

test('the name is trimmed, must be real, and at most 100 letters', () => {
  assert.equal(create({ ...valid, name: '  Vivasoft  ' }).data.name, 'Vivasoft');
  for (const bad of ['', '   ', '...', 'x'.repeat(101), 42, null]) {
    assert.equal(create({ ...valid, name: bad }).success, false, String(bad));
  }
});

test('aliases: trimmed, the same alias twice is saved once, at most 20, no empty ones', () => {
  assert.deepEqual(create({ ...valid, aliases: ['GP ', 'gp', 'Grameen Phone Ltd', 'Grameen Phone'] }).data.aliases, ['GP', 'Grameen Phone Ltd']);
  assert.equal(create({ ...valid, aliases: Array.from({ length: 21 }, (_, i) => `alias ${i}`) }).success, false);
  assert.equal(create({ ...valid, aliases: [''] }).success, false);
  assert.equal(create({ ...valid, aliases: 'GP' }).success, false);
});

test('unknown fields such as userId are rejected, not saved', () => {
  assert.equal(create({ ...valid, userId: 'someone-else' }).success, false);
  assert.equal(create({ ...valid, id: 'x' }).success, false);
});

test('update: any of the fields, but at least one, and the same rules', () => {
  assert.equal(updateCompanySchema.safeParse({}).success, false);
  assert.equal(updateCompanySchema.safeParse({ name: 'New Name' }).success, true);
  assert.equal(updateCompanySchema.safeParse({ aliases: [] }).success, true);
  assert.equal(updateCompanySchema.safeParse({ careersUrl: 'http://example.com/' }).success, false);
  assert.equal(updateCompanySchema.safeParse({ userId: 'x' }).success, false);
});

test('the id parameter must not be empty', () => {
  assert.equal(companyIdParamSchema.safeParse({ id: 'abc' }).success, true);
  assert.equal(companyIdParamSchema.safeParse({ id: '' }).success, false);
});
