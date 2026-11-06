import { jobHash } from './jobHash.js';
import { extractSkills } from '../matching/extractSkills.js';
import { extractExperience } from '../matching/extractExperience.js';
import { detectLevel } from '../matching/detectLevel.js';
import { detectDomain } from '../matching/detectDomain.js';

const LIMITS = { title: 300, company: 200, location: 200, description: 20_000, remoteScope: 200 };

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

  for (const job of jobs) {
    const title = clean(job?.title, LIMITS.title);
    const company = clean(job?.company, LIMITS.company);
    const url = String(job?.url ?? '').trim();
    if (!title || !company || !isHttpUrl(url) || !job?.source) {
      invalid += 1;
      continue;
    }

    const location = clean(job.location, LIMITS.location);
    const hash = jobHash({ company, title, location });
    if (seenHashes.has(hash) || seenUrls.has(url)) {
      repeated += 1;
      continue;
    }
    seenHashes.add(hash);
    seenUrls.add(url);

    const description = clean(job.description, LIMITS.description);
    const text = `${title}\n${description ?? ''}`;
    const years = extractExperience(text);

    rows.push({
      source: job.source,
      url,
      hash,
      title,
      company,
      location,
      description,
      deadline: validDate(job.deadline),
      experienceText: clean(job.experienceText, 200),
      skills: extractSkills(text),
      level: detectLevel(title, years),
      domains: detectDomain(text),
      postedAt: validDate(job.postedAt),
      isRemote: Boolean(job.isRemote),
      remoteScope: clean(job.remoteScope, LIMITS.remoteScope),
    });
  }

  return { rows, invalid, repeated };
}
