import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCompany, buildCompanyMatcher, favoriteCompanyNames } from '../companyMatcher.js';

test('normalizeCompany: letter case, spaces and punctuation do not matter', () => {
  assert.equal(normalizeCompany('  Vivasoft  '), 'vivasoft');
  assert.equal(normalizeCompany('VIVASOFT'), 'vivasoft');
  assert.equal(normalizeCompany('Brain-Station   23'), 'brain station 23');
  assert.equal(normalizeCompany('Tiger.IT'), 'tiger it');
});

test('normalizeCompany: Ltd, Limited, Inc, PLC and friends are removed from the end', () => {
  for (const name of ['Vivasoft Ltd', 'Vivasoft Ltd.', 'Vivasoft Limited', 'Vivasoft, Inc.', 'Vivasoft PLC', 'Vivasoft LLC', 'Vivasoft Co., Ltd.', 'Vivasoft (Pvt.) Ltd.', 'Vivasoft Private Limited']) {
    assert.equal(normalizeCompany(name), 'vivasoft', name);
  }
});

test('normalizeCompany: such a word in the MIDDLE or as the whole name stays', () => {
  assert.equal(normalizeCompany('Limited Edition Labs'), 'limited edition labs');
  assert.equal(normalizeCompany('Ltd'), 'ltd');
  assert.equal(normalizeCompany('Co'), 'co');
});

test('normalizeCompany: "&" and "and" are the same, accents are dropped, Bangla letters are kept', () => {
  assert.equal(normalizeCompany('Johnson & Johnson'), normalizeCompany('Johnson and Johnson'));
  assert.equal(normalizeCompany('Café Group'), 'cafe group');
  assert.equal(normalizeCompany('গ্রামীণফোন লিমিটেড'), 'গ্রামীণফোন লিমিটেড');
});

test('normalizeCompany: empty and non-text input gives an empty string', () => {
  for (const bad of ['', '   ', '...', null, undefined, 42]) assert.equal(normalizeCompany(bad), '', String(bad));
});

test('the matcher matches whole names, with Ltd / case / punctuation differences', () => {
  const isFavorite = buildCompanyMatcher([{ name: 'Brain Station 23', aliases: [] }]);
  assert.equal(isFavorite('Brain Station 23'), true);
  assert.equal(isFavorite('BRAIN STATION 23 LTD.'), true);
  assert.equal(isFavorite('brain-station 23 limited'), true);
});

test('the matcher does NOT match a part of a name or a longer name', () => {
  const isFavorite = buildCompanyMatcher([{ name: 'Meta' }, { name: 'Brain Station 23' }]);
  assert.equal(isFavorite('Metaverse Studio'), false);
  assert.equal(isFavorite('Meta Platforms'), false);
  assert.equal(isFavorite('Brain Station'), false);
  assert.equal(isFavorite('Brain Station 23 Software'), false);
});

test('aliases count as the same company', () => {
  const isFavorite = buildCompanyMatcher([{ name: 'Grameenphone', aliases: ['GP', 'Grameen Phone Ltd'] }]);
  assert.equal(isFavorite('GP'), true);
  assert.equal(isFavorite('Grameen Phone'), true);
  assert.equal(isFavorite('Grameenphone Limited'), true);
  assert.equal(isFavorite('Robi'), false);
});

test('empty names and empty favorites never match', () => {
  assert.equal(buildCompanyMatcher([])('Anything'), false);
  const isFavorite = buildCompanyMatcher([{ name: 'Vivasoft', aliases: ['', '  '] }]);
  assert.equal(isFavorite(''), false);
  assert.equal(isFavorite(null), false);
  assert.equal(isFavorite('...'), false);
});

test('favoriteCompanyNames keeps the original spelling of the companies that are favorites', () => {
  const names = ['Vivasoft Ltd.', 'Pathao', 'GP', 'Metaverse Studio', 'vivasoft'];
  const favorites = [{ name: 'Vivasoft' }, { name: 'Grameenphone', aliases: ['GP'] }];
  assert.deepEqual(favoriteCompanyNames(names, favorites), ['Vivasoft Ltd.', 'GP', 'vivasoft']);
  assert.deepEqual(favoriteCompanyNames([], favorites), []);
});
