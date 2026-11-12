import rules from './remoteRules.json' with { type: 'json' };
import { buildTermRegex } from './termMatcher.js';

// Can someone in Bangladesh (UTC+6) apply to this remote job?
// Answers ELIGIBLE, NOT_ELIGIBLE or UNKNOWN. NOT_ELIGIBLE wins over ELIGIBLE.

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const placeGroup = `(?:the )?(?:${[...rules.restrictedPlaces]
  .sort((a, b) => b.length - a.length)
  .map((place) => escapeRegex(place).replace(/\s+/g, '\\s+'))
  .join('|')})`;

const NOT_ELIGIBLE_REGEXES = [
  ...rules.notEligibleTemplates.map(
    (template) => new RegExp(`(?<![a-z0-9_])${template.replace('{place}', placeGroup)}(?![a-z0-9_])`, 'i'),
  ),
  ...rules.notEligiblePhrases.map((phrase) => buildTermRegex(phrase)),
];
const ELIGIBLE_REGEXES = rules.eligiblePhrases.map((phrase) => buildTermRegex(phrase));
const ELIGIBLE_SCOPE_REGEXES = rules.eligibleInScopeOnly.map((phrase) => buildTermRegex(phrase));

const RESTRICTED = new Set(rules.restrictedPlaces);
const IGNORED = new Set(rules.ignoredScopeWords);

const ZONE_RANGE =
  /(?:utc|gmt)\s*([+-]\s*\d{1,2})(?::?\d{2})?\s*(?:to|-|–|—|and)\s*(?:(?:utc|gmt)\s*)?([+-]\s*\d{1,2})(?::?\d{2})?/gi;

const anyMatch = (regexes, text) => regexes.some((regex) => regex.test(text));

// "UTC-2 to UTC+8" -> does the range include UTC+6? null when no range is written.
function zoneRangeVerdict(text) {
  let verdict = null;
  for (const match of text.matchAll(ZONE_RANGE)) {
    const from = Number(match[1].replace(/\s+/g, ''));
    const to = Number(match[2].replace(/\s+/g, ''));
    const [low, high] = from <= to ? [from, to] : [to, from];
    if (low <= rules.bangladeshUtcOffset && rules.bangladeshUtcOffset <= high) return 'ELIGIBLE';
    verdict = 'NOT_ELIGIBLE';
  }
  return verdict;
}

// "Remote, US or Canada": every place in the list is a restricted one -> no.
function onlyRestrictedPlaces(field) {
  const places = field
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,;/|&]|\bor\b|\band\b/)
    .map((part) => part.replace(/^\s*the\s+/, '').replace(/\s+/g, ' ').trim())
    .filter((part) => part && !IGNORED.has(part));
  return places.length > 0 && places.every((place) => RESTRICTED.has(place));
}

export function checkRemoteEligibility({ remoteScope, location, description } = {}) {
  const scope = String(remoteScope ?? '').trim();
  const place = String(location ?? '').trim();
  const all = [scope, place, String(description ?? '')].join('\n');
  const scopeText = [scope, place].join('\n');

  const zone = zoneRangeVerdict(all);

  const notEligible =
    anyMatch(NOT_ELIGIBLE_REGEXES, all) ||
    zone === 'NOT_ELIGIBLE' ||
    // the location is only used when there is no scope (it can be the company's country)
    onlyRestrictedPlaces(scope || place);
  if (notEligible) return 'NOT_ELIGIBLE';

  if (zone === 'ELIGIBLE' || anyMatch(ELIGIBLE_REGEXES, all) || anyMatch(ELIGIBLE_SCOPE_REGEXES, scopeText)) {
    return 'ELIGIBLE';
  }
  return 'UNKNOWN';
}
