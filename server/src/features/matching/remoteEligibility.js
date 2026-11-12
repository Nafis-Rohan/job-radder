import rules from './remoteRules.json' with { type: 'json' };
import { buildTermRegex } from './termMatcher.js';

// Can someone in Bangladesh (UTC+6) apply to this remote job?
// Answers ELIGIBLE, NOT_ELIGIBLE or UNKNOWN. NOT_ELIGIBLE wins over ELIGIBLE.
//
// Where the words are looked for:
// - "where" = the remote scope; only when there is no scope, the location (it can be the company's
//   country, so a scope always wins over it).
// - "No" words and timezone ranges: in "where" and in the description.
// - strong "Yes" words (worldwide, bangladesh...): in "where" and in the description.
// - weak "Yes" words (asia, apac, global, anywhere...): in "where" only, because a description
//   can mention them for other reasons ("we have an office in Asia").

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
const ELIGIBLE_WHERE_REGEXES = rules.eligibleInScopeOnly.map((phrase) => buildTermRegex(phrase));

const RESTRICTED = new Set(rules.restrictedPlaces);
const IGNORED = new Set(rules.ignoredScopeWords);
const BANGLADESH_MINUTES = rules.bangladeshUtcOffset * 60;

// "UTC-2 to UTC+8", "GMT+3 – GMT+9", "UTC+5:30 to UTC+8": sign, hours, optional minutes
const ZONE_RANGE =
  /(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?\s*(?:to|-|–|—|and)\s*(?:(?:utc|gmt)\s*)?([+-])\s*(\d{1,2})(?::?(\d{2}))?/gi;

const anyMatch = (regexes, text) => regexes.some((regex) => regex.test(text));
const toMinutes = (sign, hours, minutes) => (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes ?? 0));

// Does the written range include UTC+6? null when no range is written.
function zoneRangeVerdict(text) {
  let verdict = null;
  for (const match of text.matchAll(ZONE_RANGE)) {
    const from = toMinutes(match[1], match[2], match[3]);
    const to = toMinutes(match[4], match[5], match[6]);
    const [low, high] = from <= to ? [from, to] : [to, from];
    if (low <= BANGLADESH_MINUTES && BANGLADESH_MINUTES <= high) return 'ELIGIBLE';
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
  const where = scope || String(location ?? '').trim();
  const all = `${where}\n${String(description ?? '')}`;

  const zone = zoneRangeVerdict(all);

  if (anyMatch(NOT_ELIGIBLE_REGEXES, all) || zone === 'NOT_ELIGIBLE' || onlyRestrictedPlaces(where)) {
    return 'NOT_ELIGIBLE';
  }

  if (zone === 'ELIGIBLE' || anyMatch(ELIGIBLE_REGEXES, all) || anyMatch(ELIGIBLE_WHERE_REGEXES, where)) {
    return 'ELIGIBLE';
  }
  return 'UNKNOWN';
}
