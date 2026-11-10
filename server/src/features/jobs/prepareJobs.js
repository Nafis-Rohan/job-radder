import { jobHash } from './jobHash.js';
import { extractSkills } from '../matching/extractSkills.js';
import { extractExperience, extractExperienceRange } from '../matching/extractExperience.js';
import { isTechJob } from './isTechJob.js';
import { detectLevel } from '../matching/detectLevel.js';
import { detectDomain } from '../matching/detectDomain.js';

const LIMITS = { title: 300, company: 200, location: 200, description: 6000, remoteScope: 200 };
// The text is read in full (up to this size) for skills and years; only 6000 characters are stored.
const READ_LIMIT = 20_000;

const clean = (value, max) => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
};
const validDate = (value) => (value instanceof Date && !Number.isNaN(value.getTime()) ? value : null);

function isHttpUrl(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// NormalizedJob[] -> rows ready for the database (hash + skills/level/domains added).
// Bad jobs are counted, repeats inside the same batch are dropped. No database here.
export function prepareJobs(jobs) {
  const rows = [];
  const seenHashes = new Set();
  const seenUrls = new Set();
  let invalid = 0;
  let repeated = 0;
  let skipped = 0; // not a tech job

  for (const job of jobs) {
    const title = clean(job?.title, LIMITS.title);
    const company = clean(job?.company, LIMITS.company);
    const url = String(job?.url ?? '').trim();
    if (!title || !company || !isHttpUrl(url) || !job?.source) {
      invalid += 1;
      continue;
    }

    const location = clean(job.location, LIMITS.location);
    // hash the full text, before it is cut to the column limits
    const hash = jobHash({ company: job.company, title: job.title, location: job.location });
    if (seenHashes.has(hash) || seenUrls.has(url)) {
      repeated += 1;
      continue;
    }
    seenHashes.add(hash);
    seenUrls.add(url);

    const fullDescription = clean(job.description, READ_LIMIT);
    const text = `${title}\n${fullDescription ?? ''}`;
    const years = extractExperience(text);
    const { min: minYears, max: maxYears } = extractExperienceRange(text);
    const skillText = `${text}\n${clean(job.skillTags, 500) ?? ''}`; // + the site's own tags
    const skills = extractSkills(skillText);

    // only tech jobs are kept (saves database space too), except jobs a collector marks keepAllRoles:
    // a favorite company's career page: the user wants to hear about every opening there
    if (!job.keepAllRoles && !isTechJob({ title, skills })) {
      skipped += 1;
      continue;
    }

    rows.push({
      source: job.source,
      url,
      hash,
      title,
      company,
      location,
      description: fullDescription?.slice(0, LIMITS.description) ?? null,
      deadline: validDate(job.deadline),
      experienceText: clean(job.experienceText, 200),
      minYears,
      maxYears,
      skills,
      level: detectLevel(title, years),
      domains: detectDomain(text),
      postedAt: validDate(job.postedAt),
      isRemote: Boolean(job.isRemote),
      remoteScope: clean(job.remoteScope, LIMITS.remoteScope),
      // remote jobs start as UNKNOWN until Phase 12 judges them; other jobs stay empty (NULL)
      eligibility: job.isRemote ? 'UNKNOWN' : null,
    });
  }

  return { rows, invalid, repeated, skipped };
}
