import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listJobsQuerySchema, jobIdParamSchema } from '../jobs.schemas.js';

const parse = (query) => listJobsQuerySchema.safeParse(query);

test('an empty query gets the defaults', () => {
  const result = parse({});
  assert.equal(result.success, true);
  assert.deepEqual(result.data, { since: 'all', page: 1, limit: 20 });
});

test('numbers arrive as text from the URL and are converted', () => {
  const { data } = parse({ minScore: '60', years: '2.5', page: '3', limit: '50' });
  assert.equal(data.minScore, 60);
  assert.equal(data.years, 2.5);
  assert.equal(data.page, 3);
  assert.equal(data.limit, 50);
});

test('since accepts only 24h, 2d, 7d, all', () => {
  for (const ok of ['24h', '2d', '7d', 'all']) assert.equal(parse({ since: ok }).success, true, ok);
  for (const bad of ['1h', '30d', '', 'ALL']) assert.equal(parse({ since: bad }).success, false, bad);
});

test('level: one value, a comma list, repeated parameters, any letter case', () => {
  assert.deepEqual(parse({ level: 'JUNIOR' }).data.level, ['JUNIOR']);
  assert.deepEqual(parse({ level: 'junior, mid' }).data.level, ['JUNIOR', 'MID']);
  assert.deepEqual(parse({ level: ['SENIOR', 'LEAD'] }).data.level, ['SENIOR', 'LEAD']);
  assert.equal(parse({}).data.level, undefined);
});

test('level: UNKNOWN and made-up values are rejected', () => {
  assert.equal(parse({ level: 'UNKNOWN' }).success, false);
  assert.equal(parse({ level: 'JUNIOR,BOSS' }).success, false);
});

test('score, years, page and limit must be in range', () => {
  for (const bad of [{ minScore: '101' }, { minScore: '-1' }, { minScore: '1.5' }, { minScore: 'abc' }]) {
    assert.equal(parse(bad).success, false, JSON.stringify(bad));
  }
  for (const bad of [{ years: '-1' }, { years: '61' }, { page: '0' }, { limit: '0' }, { limit: '101' }]) {
    assert.equal(parse(bad).success, false, JSON.stringify(bad));
  }
  assert.equal(parse({ minScore: '0', years: '0' }).success, true);
});

test('source and company are trimmed; empty means no filter', () => {
  const { data } = parse({ source: '  bdjobs ', company: '' });
  assert.equal(data.source, 'bdjobs');
  assert.equal(data.company, undefined);
  assert.equal(parse({ company: 'x'.repeat(101) }).success, false);
});

test('unknown parameters are ignored, not saved', () => {
  const { data } = parse({ favOnly: 'true', hack: '1' });
  assert.deepEqual(Object.keys(data).sort(), ['limit', 'page', 'since']);
});

test('the job id parameter must not be empty', () => {
  assert.equal(jobIdParamSchema.safeParse({ id: 'cmw9abc' }).success, true);
  assert.equal(jobIdParamSchema.safeParse({ id: '' }).success, false);
  assert.equal(jobIdParamSchema.safeParse({}).success, false);
});
