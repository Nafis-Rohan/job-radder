// Order matters: the first rule that matches wins.
const RULES = [
  ['LEAD', /\b(?:lead|principal|staff|head of|architect|engineering manager|director|cto)\b/i],
  ['SENIOR', /\b(?:senior|sr)\b\.?/i],
  ['INTERN', /\b(?:intern|internship|trainee)\b/i],
  ['JUNIOR', /\b(?:junior|jr|entry[- ]level|fresher)\b\.?/i],
  ['MID', /\b(?:mid[- ]?level|intermediate)\b/i],
];

function levelFromYears(years) {
  if (years === null || years === undefined) return 'UNKNOWN';
  if (years < 0.5) return 'INTERN';
  if (years < 2) return 'JUNIOR';
  if (years < 5) return 'MID';
  if (years < 10) return 'SENIOR';
  return 'LEAD';
}

// Pass a job title (or a CV headline), not a whole description: words like "lead" are
// common in long texts. If the text names no level, the years of experience decide.
export function detectLevel(text, years = null) {
  for (const [level, pattern] of RULES) {
    if (text && pattern.test(text)) return level;
  }
  return levelFromYears(years);
}
