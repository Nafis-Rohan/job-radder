import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMatch, stackFit, expFit, levelFit, domainFit, labelFor, effectiveWeights, WEIGHTS } from '../score.js';

// a mid-level backend developer in fintech
const cv = {
  skills: ['node.js', 'postgresql', 'docker'],
  yearsExp: 3,
  level: 'MID',
  domains: ['fintech'],
};

test('the weights add up to 1', () => {
  const sum = WEIGHTS.stack + WEIGHTS.exp + WEIGHTS.level + WEIGHTS.domain;
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('job 1: everything fits -> 100, STRONG, no gaps', () => {
  const result = scoreMatch(cv, {
    skills: ['node.js', 'postgresql', 'docker'],
    minYears: 2,
    level: 'MID',
    domains: ['fintech'],
  });
  assert.deepEqual(result, {
    stackFit: 100,
    expFit: 100,
    levelFit: 100,
    domainFit: 100,
    total: 100,
    label: 'STRONG',
    gaps: [],
  });
});

test('job 2: few skills, one level up, no domain named -> 50, PARTIAL, gaps listed', () => {
  const result = scoreMatch(cv, {
    skills: ['node.js', 'java', 'kubernetes', 'aws'],
    minYears: 3,
    level: 'SENIOR',
    domains: [],
  });
  assert.equal(result.stackFit, 25);
  assert.equal(result.expFit, 100);
  assert.equal(result.levelFit, 50);
  assert.equal(result.domainFit, 50);
  assert.equal(result.total, 50); // 0.4*25 + 0.2*100 + 0.2*50 + 0.2*50
  assert.equal(result.label, 'PARTIAL');
  assert.deepEqual(result.gaps, ['java', 'kubernetes', 'aws']);
});

test('job 3: wrong stack, far too senior, other domain -> WEAK', () => {
  const result = scoreMatch(cv, {
    skills: ['php', 'laravel'],
    minYears: 8,
    level: 'LEAD',
    domains: ['ecommerce'],
  });
  assert.deepEqual(
    [result.stackFit, result.expFit, result.levelFit, result.domainFit],
    [0, 0, 0, 30],
  );
  assert.equal(result.total, 6);
  assert.equal(result.label, 'WEAK');
  assert.deepEqual(result.gaps, ['php', 'laravel']);
});

test('job 4: the job lists no skills -> stackFit is null and the other three share the weight', () => {
  const result = scoreMatch(cv, { skills: [], minYears: null, level: 'UNKNOWN', domains: [] });
  assert.equal(result.stackFit, null);
  assert.equal(result.expFit, 70);
  assert.equal(result.levelFit, 70);
  assert.equal(result.domainFit, 50);
  assert.equal(result.total, 63); // (0.2*70 + 0.2*70 + 0.2*50) / 0.6
  assert.equal(result.label, 'GOOD');
  assert.deepEqual(result.gaps, []);
});

test('effectiveWeights: normal weights, or stack 0 and the rest sharing it', () => {
  assert.deepEqual(effectiveWeights(true), { stack: 0.4, exp: 0.2, level: 0.2, domain: 0.2 });
  assert.deepEqual(effectiveWeights(false), { stack: 0, exp: 0.333, level: 0.333, domain: 0.333 });
});

test('effectiveWeights really are the weights scoreMatch used (total = sum of weight x part)', () => {
  const cv = { skills: ['node.js'], yearsExp: 2, level: 'MID', domains: ['fintech'] };
  for (const skills of [[], ['node.js', 'docker']]) {
    const s = scoreMatch(cv, { skills, minYears: 3, level: 'SENIOR', domains: ['fintech'] });
    const w = effectiveWeights(s.stackFit !== null);
    const sum = w.stack * (s.stackFit ?? 0) + w.exp * s.expFit + w.level * s.levelFit + w.domain * s.domainFit;
    assert.ok(Math.abs(sum - s.total) <= 1, `${sum} vs ${s.total}`); // rounded weights: at most 1 point apart
  }
});

test('job 5: most skills, a year more experience asked -> GOOD', () => {
  const result = scoreMatch(cv, {
    skills: ['node.js', 'postgresql', 'redis'],
    minYears: 4,
    level: 'MID',
    domains: ['fintech'],
  });
  assert.equal(result.stackFit, 67);
  assert.equal(result.expFit, 60);
  assert.equal(result.total, 79);
  assert.equal(result.label, 'GOOD');
  assert.deepEqual(result.gaps, ['redis']);
});

test('a CV with no skills still gets a score and sees every job skill as a gap', () => {
  const empty = { skills: [], yearsExp: 0, level: 'UNKNOWN', domains: [] };
  const result = scoreMatch(empty, { skills: ['node.js'], minYears: null, level: 'MID', domains: ['fintech'] });
  assert.equal(result.stackFit, 0);
  assert.deepEqual(result.gaps, ['node.js']);
  assert.ok(result.total >= 0 && result.total <= 100);
});

test('stackFit: share of the job skills the CV has, rounded', () => {
  assert.equal(stackFit(['a', 'b'], ['a', 'b']), 100);
  assert.equal(stackFit(['a'], ['a', 'b', 'c']), 33);
  assert.equal(stackFit(['x'], ['a']), 0);
  assert.equal(stackFit(['a'], []), null);
});

test('expFit: enough 100, 1 short 60, 2 short 30, 3 or more 0, unknown 70', () => {
  assert.equal(expFit(3, 3), 100);
  assert.equal(expFit(5, 2), 100);
  assert.equal(expFit(2, 3), 60);
  assert.equal(expFit(1, 3), 30);
  assert.equal(expFit(0, 3), 0);
  assert.equal(expFit(1, 8), 0);
  assert.equal(expFit(3, null), 70);
  assert.equal(expFit(3, undefined), 70);
});

test('expFit: part of a year counts as a whole year short', () => {
  assert.equal(expFit(2.5, 3), 60); // 0.5 short counts as 1 short
  assert.equal(expFit(1.5, 3), 30); // 1.5 short counts as 2 short
  assert.equal(expFit(0.5, 3), 0); // 2.5 short counts as 3 short
});

test('levelFit: same 100, one step 50, more 0, unknown 70', () => {
  assert.equal(levelFit('MID', 'MID'), 100);
  assert.equal(levelFit('MID', 'SENIOR'), 50);
  assert.equal(levelFit('JUNIOR', 'MID'), 50);
  assert.equal(levelFit('JUNIOR', 'SENIOR'), 0);
  assert.equal(levelFit('INTERN', 'LEAD'), 0);
  assert.equal(levelFit('MID', 'UNKNOWN'), 70);
  assert.equal(levelFit('UNKNOWN', 'MID'), 70);
});

test('domainFit: shared 100, job names none 50, none shared 30', () => {
  assert.equal(domainFit(['fintech', 'saas'], ['saas']), 100);
  assert.equal(domainFit(['fintech'], []), 50);
  assert.equal(domainFit(['fintech'], ['ecommerce']), 30);
  assert.equal(domainFit([], ['ecommerce']), 30);
});

test('labelFor: 80 STRONG, 60 GOOD, 40 PARTIAL, below WEAK', () => {
  assert.equal(labelFor(100), 'STRONG');
  assert.equal(labelFor(80), 'STRONG');
  assert.equal(labelFor(79), 'GOOD');
  assert.equal(labelFor(60), 'GOOD');
  assert.equal(labelFor(59), 'PARTIAL');
  assert.equal(labelFor(40), 'PARTIAL');
  assert.equal(labelFor(39), 'WEAK');
  assert.equal(labelFor(0), 'WEAK');
});
