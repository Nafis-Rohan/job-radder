import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCv } from '../cvAnalyzer.js';
import { extractExperience } from '../../matching/extractExperience.js';
import { SAMPLE_CV_LINES } from './makePdf.js';

const NOW = new Date('2026-06-15T00:00:00Z');
const analysis = analyzeCv(SAMPLE_CV_LINES.join('\n'), NOW);

test('finds the skills in the CV', () => {
  for (const skill of ['node.js', 'express.js', 'postgresql', 'docker', 'kubernetes', 'aws', 'redis']) {
    assert.ok(analysis.skills.includes(skill), `missing ${skill}`);
  }
  assert.ok(!analysis.skills.includes('java'));
});

test('reads the years: the written "6+ years" beats the date estimate', () => {
  assert.ok(analysis.yearsExp >= 6, `got ${analysis.yearsExp}`);
});

test('the written "6+ years" is read as exactly 6', () => {
  assert.equal(extractExperience(SAMPLE_CV_LINES.join('\n')), 6);
});

test('reads the level from the headline', () => {
  assert.equal(analysis.level, 'SENIOR');
});

test('finds the domain', () => {
  assert.ok(analysis.domains.includes('fintech'));
});

test('keywords hold the role and the top skills', () => {
  assert.ok(analysis.keywords.includes('backend engineer'));
  assert.ok(analysis.keywords.includes('node.js'));
  assert.ok(analysis.keywords.length <= 20);
});

test('uses the years when the headline has no level', () => {
  const result = analyzeCv('Jane Example\nSoftware Engineer\nNode.js developer\nEngineer 2022 - 2024', NOW);
  assert.equal(result.level, 'MID');
});

test('level is UNKNOWN when there are no years and no level word', () => {
  const result = analyzeCv('Jane Example\nSoftware Engineer\nI like Node.js', NOW);
  assert.equal(result.yearsExp, 0);
  assert.equal(result.level, 'UNKNOWN');
});
