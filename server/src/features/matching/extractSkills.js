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
  // Count each place in the text once, even if the name and an alias both match there.
  const places = new Set();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) places.add(match.index);
  }
  return places.size;
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
