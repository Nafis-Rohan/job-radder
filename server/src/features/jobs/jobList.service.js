import { prisma } from '../../shared/db/prisma.js';
import { buildCompanyMatcher, favoriteCompanyNames } from '../companies/companyMatcher.js';
import { listFavorites } from '../companies/companies.service.js';

const HOUR = 60 * 60 * 1000;
const SINCE_HOURS = { '24h': 24, '2d': 48, '7d': 168 };

// A job found in the last 24 hours is "new".
export const NEW_HOURS = 24;

// What the list shows about a job. The long description is left out (it comes with one job, in 8.3).
export const LIST_JOB_FIELDS = {
  id: true,
  source: true,
  url: true,
  title: true,
  company: true,
  location: true,
  level: true,
  minYears: true,
  maxYears: true,
  skills: true,
  domains: true,
  postedAt: true,
  foundAt: true,
  deadline: true,
  isRemote: true,
  remoteScope: true,
  eligibility: true,
};

// Pure: the checks on the Job row. Every filter that is not set adds nothing.
// favoriteNames = the company names (as saved on jobs) that are the user's favorites; only used by favOnly.
export function buildJobFilter(query, now = new Date(), favoriteNames = []) {
  const and = [
    // an expired job is hidden; a job with no deadline stays
    { OR: [{ deadline: null }, { deadline: { gt: now } }] },
  ];
  if (query.since && query.since !== 'all') {
    and.push({ foundAt: { gte: new Date(now.getTime() - SINCE_HOURS[query.since] * HOUR) } });
  }
  if (query.source) and.push({ source: { equals: query.source, mode: 'insensitive' } });
  if (query.company) and.push({ company: { contains: query.company, mode: 'insensitive' } });
  if (query.favOnly) and.push({ company: { in: favoriteNames } }); // no favorites = an empty list = no jobs
  if (query.level?.length) and.push({ level: { in: query.level } });
  // "needs at most N years": a job that does not state years is included (the list marks it)
  if (query.years !== undefined) and.push({ OR: [{ minYears: null }, { minYears: { lte: query.years } }] });
  return { AND: and };
}

// Pure: only the matches of this user's active CV, then the job checks.
export function buildMatchFilter(userId, query, now = new Date(), favoriteNames = []) {
  return {
    cv: { userId, isActive: true },
    ...(query.minScore !== undefined ? { total: { gte: query.minScore } } : {}),
    job: buildJobFilter(query, now, favoriteNames),
  };
}

// Pure: one Match row (with its job) -> one item of the list.
// isFavorite = a function company name -> true / false (see companyMatcher.js).
export function toListItem(match, now = new Date(), isFavorite = () => false) {
  const { job } = match;
  return {
    ...job,
    isFavorite: isFavorite(job.company),
    isNew: job.foundAt.getTime() >= now.getTime() - NEW_HOURS * HOUR,
    yearsStated: job.minYears !== null, // false = the job does not say how much experience it needs
    match: { total: match.total, label: match.label, gaps: match.gaps },
  };
}

// The jobs matched to this user's CV: newest first, best score first among the same time.
export async function listJobs(userId, query, now = new Date()) {
  const favorites = await listFavorites(userId);
  const isFavorite = buildCompanyMatcher(favorites);

  // The database cannot match names the way the matcher does (Ltd, aliases). So for "favorites only" we take
  // the company names of this user's matched jobs (a small list), keep the favorite ones, and filter on those.
  let favoriteNames = [];
  if (query.favOnly && favorites.length > 0) {
    const rows = await prisma.job.findMany({
      where: { matches: { some: { cv: { userId, isActive: true } } } },
      distinct: ['company'],
      select: { company: true },
    });
    favoriteNames = favoriteCompanyNames(rows.map((row) => row.company), favorites);
  }

  const where = buildMatchFilter(userId, query, now, favoriteNames);
  const [total, matches] = await prisma.$transaction([
    prisma.match.count({ where }),
    prisma.match.findMany({
      where,
      orderBy: [{ job: { foundAt: 'desc' } }, { total: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        total: true,
        label: true,
        gaps: true,
        job: { select: LIST_JOB_FIELDS },
      },
    }),
  ]);

  return {
    jobs: matches.map((m) => toListItem(m, now, isFavorite)),
    page: query.page,
    limit: query.limit,
    total,
    pages: Math.ceil(total / query.limit),
  };
}
