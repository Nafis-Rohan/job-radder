const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const NUMBER = '(\\d{1,2}(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
// "2 years", "2+ yrs", "1-3 years", "1 to 3 years", "two years", "three+ years"
const YEARS_RE = new RegExp(
  `(?<![\\d.])${NUMBER}\\s*\\+?\\s*(?:(?:-|–|—|to)\\s*${NUMBER}\\s*\\+?\\s*)?(?:years?|yrs?)\\b`,
  'gi',
);

function toNumber(value) {
  const lower = value.toLowerCase();
  return lower in WORD_NUMBERS ? WORD_NUMBERS[lower] : Number(lower);
}

// Years of experience written in the text ("3+ years"). For a range like "1-3 years" the
// lower number is used. Several mentions: the biggest one wins. Nothing found: null.
export function extractExperience(text) {
  if (!text) return null;

  let best = null;
  for (const match of text.matchAll(YEARS_RE)) {
    const years = toNumber(match[1]);
    if (best === null || years > best) best = years;
  }
  return best;
}

const RANGE_YEARS_RE = new RegExp(
  `(?<![\\d.])${NUMBER}\\s*(\\+)?\\s*(?:(?:-|–|—|to)\\s*${NUMBER}\\s*(\\+)?\\s*)?(?:years?|yrs?)\\b`,
  'gi',
);

// Years a job asks for, as { min, max }:  "1-3 years" -> 1 and 3,  "3+ years" -> 3 and null
// (no upper limit),  "3 years" -> 3 and 3,  nothing written -> both null.
// Several mentions: the one with the biggest minimum wins (same rule as extractExperience).
export function extractExperienceRange(text) {
  const none = { min: null, max: null };
  if (!text) return none;

  let best = none;
  for (const match of text.matchAll(RANGE_YEARS_RE)) {
    const [, first, firstPlus, second, secondPlus] = match;
    const min = toNumber(first);
    let max;
    if (second !== undefined) max = secondPlus ? null : Math.max(min, toNumber(second));
    else max = firstPlus ? null : min;

    if (best.min === null || min > best.min) best = { min, max };
  }
  return best;
}

// ---- CV only: estimate the total experience from date ranges ("Jan 2020 - Present") ----

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s*,?\\s*)?';
const RANGE_RE = new RegExp(
  `${MONTH}((?:19|20)\\d{2})\\s*(?:-|–|—|to)\\s*(?:${MONTH}((?:19|20)\\d{2})|(present|current|now|ongoing|till date|to date))`,
  'gi',
);

const EDUCATION_WORDS = /\b(universit|college|school|institute|b\.?sc|m\.?sc|bachelor|master|ssc|hsc|degree|cgpa|gpa|diploma|graduat|certificat|course|training|bootcamp|academy)/i;
const SKIP_HEADING = /^(education|academic|qualifications?|certifications?|courses?|training|projects?|academic projects?)\b/i;
const OTHER_HEADING = /^(experience|work experience|professional experience|employment|work history|career|skills|technical skills|summary|profile|objective|languages|interests|references|achievements|awards|publications|contact|about)\b/i;

function toDecimalYear(year, monthName) {
  const month = monthName ? MONTHS.indexOf(monthName.toLowerCase().slice(0, 3)) : 0;
  return Number(year) + month / 12;
}

function mergeAndSum(intervals) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let current = null;

  for (const [start, end] of sorted) {
    if (!current || start > current[1]) {
      if (current) total += current[1] - current[0];
      current = [start, end];
    } else if (end > current[1]) {
      current[1] = end;
    }
  }
  if (current) total += current[1] - current[0];
  return total;
}

export function estimateYearsFromDates(text, now = new Date()) {
  if (!text) return 0;

  const nowYear = now.getUTCFullYear() + now.getUTCMonth() / 12;
  const lines = text.split(/\r?\n/);
  const intervals = [];
  let skipSection = false;
  let previousLine = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.length <= 40 && SKIP_HEADING.test(line)) skipSection = true;
    else if (line.length <= 40 && OTHER_HEADING.test(line)) skipSection = false;

    const educationLine = EDUCATION_WORDS.test(line) || EDUCATION_WORDS.test(previousLine);
    previousLine = line;
    if (skipSection || educationLine) continue;

    for (const match of line.matchAll(RANGE_RE)) {
      const [, startMonth, startYear, endMonth, endYear, open] = match;
      const start = toDecimalYear(startYear, startMonth);
      const end = open ? nowYear : toDecimalYear(endYear, endMonth);

      if (start < 1980 || end < start || end > nowYear + 0.25) continue;
      intervals.push([start, end]);
    }
  }

  return Math.round(Math.min(mergeAndSum(intervals), 45) * 10) / 10;
}

// Best guess of the total years on a CV: written statement or date ranges, whichever is bigger.
export function extractCvYears(text, now = new Date()) {
  return Math.max(extractExperience(text) ?? 0, estimateYearsFromDates(text, now));
}
