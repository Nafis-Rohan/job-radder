import { prisma } from '../../shared/db/prisma.js';
import { effectiveWeights } from '../matching/score.js';
import { LIST_JOB_FIELDS, NEW_HOURS } from './jobList.service.js';

const HOUR = 60 * 60 * 1000;

// Everything of the list, plus the long texts. The hash is internal and never sent.
const DETAIL_JOB_FIELDS = { ...LIST_JOB_FIELDS, description: true, experienceText: true };

const MATCH_FIELDS = {
  total: true,
  label: true,
  gaps: true,
  stackFit: true,
  expFit: true,
  levelFit: true,
  domainFit: true,
};

// Pure: the job row (with this user's match, if any) -> the answer.
export function toDetail(job, now = new Date()) {
  const { matches, ...fields } = job;
  const match = matches[0] ?? null;
  return {
    ...fields,
    isNew: job.foundAt.getTime() >= now.getTime() - NEW_HOURS * HOUR,
    yearsStated: job.minYears !== null,
    expired: job.deadline !== null && job.deadline.getTime() <= now.getTime(),
    // match = how this job fits the user's active CV. null = it scored under 40, so no match was saved.
    // stackFit null = the job lists no skills: the stack weight is 0 and the other three share it.
    match: match && { ...match, weights: effectiveWeights(match.stackFit !== null) },
  };
}

// One job with the full score breakdown. Jobs are shared by all users, so any logged-in user can open
// any job; the match is always the one of THIS user's active CV. Returns null when the job does not exist.
export async function getJob(userId, id, now = new Date()) {
  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      ...DETAIL_JOB_FIELDS,
      matches: {
        where: { cv: { userId, isActive: true } },
        orderBy: { total: 'desc' },
        take: 1,
        select: MATCH_FIELDS,
      },
    },
  });
  return job ? toDetail(job, now) : null;
}
