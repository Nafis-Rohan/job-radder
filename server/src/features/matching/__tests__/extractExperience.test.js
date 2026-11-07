import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractExperience,
  extractExperienceRange,
  estimateYearsFromDates,
  extractCvYears,
} from '../extractExperience.js';

test('reads "2 years", "2+ yrs" and "1 year"', () => {
  assert.equal(extractExperience('Need 2 years of experience'), 2);
  assert.equal(extractExperience('2+ yrs in backend'), 2);
  assert.equal(extractExperience('1 year experience'), 1);
});

test('reads ranges: the lower number is used', () => {
  assert.equal(extractExperience('1-3 years of experience'), 1);
  assert.equal(extractExperience('3 to 5 years'), 3);
  assert.equal(extractExperience('3 – 5 years'), 3);
});

test('reads number words', () => {
  assert.equal(extractExperience('two years of Node.js'), 2);
  assert.equal(extractExperience('Five+ years'), 5);
});

test('reads decimals and two-digit numbers', () => {
  assert.equal(extractExperience('2.5 years'), 2.5);
  assert.equal(extractExperience('12 years in software'), 12);
});

test('several mentions: the biggest wins', () => {
  assert.equal(extractExperience('3 years Node.js, 1 year Docker, 5 years SQL'), 5);
});

test('returns null when nothing is written', () => {
  assert.equal(extractExperience('We are hiring a developer'), null);
  assert.equal(extractExperience(''), null);
  assert.equal(extractExperience(null), null);
});

test('does not read dates or months as years of experience', () => {
  assert.equal(extractExperience('Worked from 2019 to 2022'), null);
  assert.equal(extractExperience('6 months internship'), null);
});

const NOW = new Date('2026-06-15T00:00:00Z');

test('estimates years from date ranges, up to "Present"', () => {
  const years = estimateYearsFromDates('Backend Engineer, Acme\nJan 2022 - Present', NOW);
  assert.ok(years > 4 && years < 5, `got ${years}`);
});

test('adds separate jobs and does not double count overlaps', () => {
  const cv = [
    'Experience',
    'Developer A  2018 - 2020',
    'Developer B  2020 - 2023',
    'Freelance    2019 - 2021',
  ].join('\n');
  assert.equal(estimateYearsFromDates(cv, NOW), 5);
});

test('ignores the education section and education lines', () => {
  const cv = [
    'Education',
    'BSc in Computer Science, Some University',
    '2012 - 2016',
    'Experience',
    'Engineer 2020 - 2023',
  ].join('\n');
  assert.equal(estimateYearsFromDates(cv, NOW), 3);
});

test('ignores future end dates', () => {
  assert.equal(estimateYearsFromDates('Course 2030 - 2032', NOW), 0);
});

test('CV years = the bigger of written years and date ranges', () => {
  assert.equal(extractCvYears('10+ years of experience\nEngineer 2022 - 2023', NOW), 10);
  const fromDates = extractCvYears('Experience\nEngineer 2018 - 2024', NOW);
  assert.equal(fromDates, 6);
});

test('range: "1-3 years" gives 1 and 3', () => {
  assert.deepEqual(extractExperienceRange('1-3 years of experience'), { min: 1, max: 3 });
  assert.deepEqual(extractExperienceRange('2 to 4 yrs'), { min: 2, max: 4 });
});

test('range: "3+ years" has no upper limit', () => {
  assert.deepEqual(extractExperienceRange('3+ years of Node.js'), { min: 3, max: null });
  assert.deepEqual(extractExperienceRange('2 - 5+ years'), { min: 2, max: null });
});

test('range: "3 years" gives 3 and 3, nothing written gives nulls', () => {
  assert.deepEqual(extractExperienceRange('at least 3 years'), { min: 3, max: 3 });
  assert.deepEqual(extractExperienceRange('no numbers here'), { min: null, max: null });
  assert.deepEqual(extractExperienceRange(''), { min: null, max: null });
});

test('range: the mention with the biggest minimum wins', () => {
  assert.deepEqual(extractExperienceRange('1 year of Git, 5+ years of backend'), { min: 5, max: null });
});
