// How well does one job fit one CV? Pure function: no database, no network.
// The formula is in docs/architecture.md section 6.
//
// Uses what is already saved on the job (skills, level, domains, minYears), so nothing is read twice.

export const WEIGHTS = { stack: 0.4, exp: 0.2, level: 0.2, domain: 0.2 };

const LEVEL_ORDER = ['INTERN', 'JUNIOR', 'MID', 'SENIOR', 'LEAD'];

// skills the job asks for that the CV has, as a percent. A job with no listed skills gives null.
export function stackFit(cvSkills, jobSkills) {
  if (jobSkills.length === 0) return null;
  const have = new Set(cvSkills);
  const matched = jobSkills.filter((skill) => have.has(skill)).length;
  return Math.round((matched / jobSkills.length) * 100);
}

// Years of experience: enough = 100, one year short = 60, two = 30, three or more = 0.
// The job does not say = 70 (do not punish a missing number). Part of a year counts as a whole one.
export function expFit(cvYears, requiredYears) {
  if (requiredYears === null || requiredYears === undefined) return 70;
  const gap = Math.ceil(requiredYears - cvYears);
  if (gap <= 0) return 100;
  if (gap === 1) return 60;
  if (gap === 2) return 30;
  return 0;
}

// Same level = 100, one step apart = 50, more = 0. Either side unknown = 70.
export function levelFit(cvLevel, jobLevel) {
  const a = LEVEL_ORDER.indexOf(cvLevel);
  const b = LEVEL_ORDER.indexOf(jobLevel);
  if (a === -1 || b === -1) return 70;
  const distance = Math.abs(a - b);
  if (distance === 0) return 100;
  if (distance === 1) return 50;
  return 0;
}

// A shared domain = 100. The job names no domain = 50 (unknown). Names some, none shared = 30.
export function domainFit(cvDomains, jobDomains) {
  if (jobDomains.length === 0) return 50;
  const have = new Set(cvDomains);
  return jobDomains.some((domain) => have.has(domain)) ? 100 : 30;
}

export function labelFor(total) {
  if (total >= 80) return 'STRONG';
  if (total >= 60) return 'GOOD';
  if (total >= 40) return 'PARTIAL';
  return 'WEAK';
}

// cv  = { skills, yearsExp, level, domains }
// job = { skills, minYears, level, domains }
// Returns { stackFit, expFit, levelFit, domainFit, total, label, gaps }.
export function scoreMatch(cv, job) {
  const jobSkills = job.skills ?? [];
  const parts = {
    stackFit: stackFit(cv.skills ?? [], jobSkills),
    expFit: expFit(cv.yearsExp ?? 0, job.minYears),
    levelFit: levelFit(cv.level, job.level),
    domainFit: domainFit(cv.domains ?? [], job.domains ?? []),
  };

  // No skills on the job: the stack part is left out and the other three share its weight.
  let weighted = WEIGHTS.exp * parts.expFit + WEIGHTS.level * parts.levelFit + WEIGHTS.domain * parts.domainFit;
  let weightSum = WEIGHTS.exp + WEIGHTS.level + WEIGHTS.domain;
  if (parts.stackFit !== null) {
    weighted += WEIGHTS.stack * parts.stackFit;
    weightSum += WEIGHTS.stack;
  }

  const total = Math.round(weighted / weightSum);
  const have = new Set(cv.skills ?? []);

  return { ...parts, total, label: labelFor(total), gaps: jobSkills.filter((skill) => !have.has(skill)) };
}
