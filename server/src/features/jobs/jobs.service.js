import { prisma } from '../../shared/db/prisma.js';
import { prepareJobs } from './prepareJobs.js';

// Saves the jobs a collector found. A job already in the database (same hash or same url)
// is skipped, so running a scan twice saves each job once.
// Returns { received, inserted, duplicates, invalid }.
export async function saveJobs(jobs) {
  const { rows, invalid, repeated } = prepareJobs(jobs);
  if (rows.length === 0) {
    return { received: jobs.length, inserted: 0, duplicates: repeated, invalid };
  }

  const existing = await prisma.job.findMany({
    where: {
      OR: [{ hash: { in: rows.map((r) => r.hash) } }, { url: { in: rows.map((r) => r.url) } }],
    },
    select: { hash: true, url: true },
  });
  const knownHashes = new Set(existing.map((j) => j.hash));
  const knownUrls = new Set(existing.map((j) => j.url));
  const fresh = rows.filter((r) => !knownHashes.has(r.hash) && !knownUrls.has(r.url));

  // skipDuplicates: if two scans race, the unique hash/url columns still stop a double insert
  const { count } = fresh.length
    ? await prisma.job.createMany({ data: fresh, skipDuplicates: true })
    : { count: 0 };

  return {
    received: jobs.length,
    inserted: count,
    duplicates: repeated + (rows.length - count),
    invalid,
  };
}
