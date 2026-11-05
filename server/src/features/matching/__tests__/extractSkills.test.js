import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSkills } from '../extractSkills.js';

test('finds skills and their aliases', () => {
  const skills = extractSkills('Built REST APIs with NodeJS, Express.js and Postgres.');
  assert.ok(skills.includes('node.js'));
  assert.ok(skills.includes('express.js'));
  assert.ok(skills.includes('postgresql'));
  assert.ok(skills.includes('rest api'));
});

test('is case-insensitive', () => {
  assert.ok(extractSkills('DOCKER and kubernetes').includes('docker'));
  assert.ok(extractSkills('DOCKER and kubernetes').includes('kubernetes'));
});

test('java does not match inside javascript', () => {
  const skills = extractSkills('I write JavaScript every day');
  assert.ok(skills.includes('javascript'));
  assert.ok(!skills.includes('java'));
});

test('sql does not match inside mysql or postgresql', () => {
  const skills = extractSkills('MySQL and PostgreSQL');
  assert.ok(skills.includes('mysql'));
  assert.ok(skills.includes('postgresql'));
  assert.ok(!skills.includes('sql'));
});

test('git does not match inside github, but github counts as git', () => {
  assert.ok(extractSkills('Hosted on GitHub').includes('git'));
  assert.ok(!extractSkills('digital transformation').includes('git'));
});

test('handles symbols: c++, c#, .net, ci/cd', () => {
  const skills = extractSkills('C++, C#, ASP.NET Core and CI/CD pipelines');
  assert.ok(skills.includes('c++'));
  assert.ok(skills.includes('c#'));
  assert.ok(skills.includes('.net'));
  assert.ok(skills.includes('ci/cd'));
});

test('go is only found as golang, not as the plain word', () => {
  assert.ok(extractSkills('Backend in Golang').includes('go'));
  assert.ok(!extractSkills('We go to market fast').includes('go'));
});

test('most mentioned skills come first', () => {
  const skills = extractSkills('react react react vue docker');
  assert.equal(skills[0], 'react');
  assert.ok(skills.indexOf('react') < skills.indexOf('vue.js'));
  assert.ok(skills.indexOf('react') < skills.indexOf('docker'));
});

test('one mention counts once, even if the name and an alias both match', () => {
  const skills = extractSkills('node.js docker docker');
  assert.deepEqual(skills.slice(0, 2), ['docker', 'node.js']);
});

test('LLM or LangChain alone does not mean OpenAI', () => {
  assert.ok(!extractSkills('I built LLM apps with LangChain').includes('openai'));
});

test('returns an empty list for empty or unrelated text', () => {
  assert.deepEqual(extractSkills(''), []);
  assert.deepEqual(extractSkills(null), []);
  assert.deepEqual(extractSkills('We love gardening and cooking.'), []);
});
