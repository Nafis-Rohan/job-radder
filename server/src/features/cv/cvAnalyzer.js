import { extractSkills } from '../matching/extractSkills.js';
import { extractCvYears } from '../matching/extractExperience.js';
import { detectLevel } from '../matching/detectLevel.js';
import { detectDomain } from '../matching/detectDomain.js';
import { buildTermRegex } from '../matching/termMatcher.js';

const ROLE_TERMS = [
  'backend developer', 'backend engineer', 'frontend developer', 'frontend engineer',
  'full stack developer', 'full stack engineer', 'software engineer', 'software developer',
  'web developer', 'mobile developer', 'android developer', 'ios developer',
  'devops engineer', 'data engineer', 'data scientist', 'data analyst',
  'machine learning engineer', 'qa engineer', 'cloud engineer',
  'site reliability engineer', 'system administrator',
].map((term) => ({ term, pattern: buildTermRegex(term, 'i') }));

const MAX_KEYWORDS = 20;
const TOP_SKILLS_AS_KEYWORDS = 12;

// The first lines of a CV (name, title, contact) are where the level usually appears.
function headlineOf(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(' ');
}

// CV text -> { skills, keywords, yearsExp, level, domains }
export function analyzeCv(text, now = new Date()) {
  const skills = extractSkills(text);
  const yearsExp = extractCvYears(text, now);
  const level = detectLevel(headlineOf(text), yearsExp > 0 ? yearsExp : null);
  const domains = detectDomain(text);

  const roleText = text.replace(/[-–]/g, ' ');
  const roles = ROLE_TERMS.filter(({ pattern }) => pattern.test(roleText)).map(({ term }) => term);
  const keywords = [...new Set([...roles, ...skills.slice(0, TOP_SKILLS_AS_KEYWORDS)])].slice(
    0,
    MAX_KEYWORDS,
  );

  return { skills, keywords, yearsExp, level, domains };
}
