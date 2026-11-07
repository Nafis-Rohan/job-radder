import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTechJob } from '../isTechJob.js';

const tech = (title, skills = []) => isTechJob({ title, skills });

test('software and IT titles are tech', () => {
  for (const title of [
    'Senior Backend Engineer',
    'Software Engineer (Node.js)',
    'Full-Stack Developer',
    'DevOps Engineer',
    'QA Engineer',
    'Data Scientist',
    'Mobile App Developer (Flutter)',
    'Machine Learning Engineer',
    'Cloud Architect',
    'Site Reliability Engineer',
    'Cyber Security Analyst',
    'Tech Lead',
    'IT Support Officer',
  ]) {
    assert.equal(tech(title), true, title);
  }
});

test('HR, BBA, EEE, sales and similar jobs are not tech', () => {
  for (const title of [
    'HR Executive',
    'Human Resources Manager',
    'Technical Recruiter',
    'Talent Acquisition Specialist',
    'Accounts Officer',
    'Sales Engineer',
    'Web Sales Executive',
    'Electrical Engineer',
    'EEE Graduate Engineer',
    'Civil Engineer',
    'Digital Marketing Manager',
    'Customer Support Specialist',
    'Merchandiser',
  ]) {
    assert.equal(tech(title), false, title);
  }
});

test('a clearly software title wins over a non-tech word', () => {
  assert.equal(tech('HR Software Developer'), true);
  assert.equal(tech('Sales Software Engineer'), true);
});

test('an unclear title is decided by the skills found in the text', () => {
  assert.equal(tech('Specialist', ['node.js', 'docker']), true);
  assert.equal(tech('Specialist', ['excel']), false);
  assert.equal(tech('Specialist'), false);
  assert.equal(tech('', []), false);
});
