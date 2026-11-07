// Decides if a job is a tech job. Only tech jobs are saved (HR, BBA, EEE, sales... are not).
// The word lists are easy to change: add a word here if a good job is skipped.

// 1) Clearly software work. These win even if a non-tech word is also in the title
//    ("HR Software Developer").
const STRONG_TECH =
  /\b(?:developers?|programmers?|software|devops|dev[- ]?ops|sre|site reliability|sdet|qa|back[- ]?end|front[- ]?end|full[- ]?stack|data (?:engineer|scientist|analyst)|machine learning|cyber ?security|security engineer|dba|embedded|firmware|programming)\b/i;

// 2) Clearly not software work.
const NON_TECH =
  /\b(?:hr|human resources?|recruit(?:er|ers|ment)?|talent acquisition|bba|accountants?|accounts?|accounting|auditor|finance officer|sales|business development|marketing|brand|content writer|copywriter|merchandiser|receptionist|admin(?:istrative)? (?:officer|assistant|executive)|executive assistant|driver|electrical|electronics?|eee|civil|mechanical|chemical|textile|garments?|nurse|teacher|lawyer|legal|procurement|supply chain|logistics|customer (?:support|service|success|value)|call cent(?:er|re))\b/i;

// 3) Tech words that could also appear in other jobs, so they only count after the check above.
const WEAK_TECH =
  /\b(?:web|mobile|android|ios|flutter|react|node|java|python|golang|php|laravel|django|\.net|ai|ml|llm|cloud|database|network engineer|system administrator|sysadmin|blockchain|game|ui\/ux|ux|tech lead|technical lead|cto|it support|it officer|it manager|technology|solutions? architect|engineering manager|tester)\b/i;

// Needs the job title and the skills found in the text (list of canonical skill names).
export function isTechJob({ title, skills = [] }) {
  const text = String(title ?? '');
  if (STRONG_TECH.test(text)) return true;
  if (NON_TECH.test(text)) return false;
  if (WEAK_TECH.test(text)) return true;
  // unclear title ("Engineer", "Specialist"): two or more tech skills in the text decide
  return skills.length >= 2;
}
