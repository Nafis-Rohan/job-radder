import domains from './domains.json' with { type: 'json' };
import { buildTermRegex } from './termMatcher.js';

const DOMAINS = Object.entries(domains).map(([name, terms]) => ({
  name,
  patterns: terms.map((term) => buildTermRegex(term, 'i')),
}));

// Returns up to `max` domain names, the ones with the most different matching terms first.
export function detectDomain(text, { max = 3 } = {}) {
  if (!text) return [];

  return DOMAINS.map(({ name, patterns }, index) => ({
    name,
    index,
    hits: patterns.filter((pattern) => pattern.test(text)).length,
  }))
    .filter((domain) => domain.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.index - b.index)
    .slice(0, max)
    .map((domain) => domain.name);
}
