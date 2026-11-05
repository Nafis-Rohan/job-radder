import skills from './skills.json' with { type: 'json' };
import { buildTermRegex } from './termMatcher.js';

// Skill names that are also everyday words: only their aliases count ("golang", not "go").
const NAME_IS_COMMON_WORD = new Set(['go']);

const SKILLS = Object.entries(skills).map(([name, aliases]) => ({
  name,
  patterns: (NAME_IS_COMMON_WORD.has(name) ? aliases : [name, ...aliases]).map((term) =>
    buildTermRegex(term, 'gi'),
  ),
}));

function countMentions(text, patterns) {
  let count = 0;
  for (const pattern of patterns) {
    for (const _ of text.matchAll(pattern)) count += 1;
  }
  return count;
}

// Returns canonical skill names found in the text, most mentioned first.
export function extractSkills(text) {
  if (!text) return [];

  return SKILLS.map(({ name, patterns }, index) => ({
    name,
    index,
    count: countMentions(text, patterns),
  }))
    .filter((skill) => skill.count > 0)
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map((skill) => skill.name);
}
