// Re-checks "can someone in Bangladesh apply?" for every remote job already in the database
// and saves the answer in Job.eligibility. Safe to run again at any time. Nothing else is changed.
// Run from the server folder:  node scripts/recheckEligibility.js
import { prisma } from '../src/shared/db/prisma.js';
import { checkRemoteEligibility } from '../src/features/matching/remoteEligibility.js';

async function main() {
  const jobs = await prisma.job.findMany({
    where: { isRemote: true },
    select: { id: true, remoteScope: true, location: true, description: true, eligibility: true },
  });

  const counts = { ELIGIBLE: 0, NOT_ELIGIBLE: 0, UNKNOWN: 0 };
  let changed = 0;
  for (const job of jobs) {
    const eligibility = checkRemoteEligibility(job);
    counts[eligibility] += 1;
    if (eligibility !== job.eligibility) {
      await prisma.job.update({ where: { id: job.id }, data: { eligibility } });
      changed += 1;
    }
  }
  console.log(`Remote jobs checked: ${jobs.length}, changed: ${changed}`);
  console.log(`ELIGIBLE: ${counts.ELIGIBLE}, NOT_ELIGIBLE: ${counts.NOT_ELIGIBLE}, UNKNOWN: ${counts.UNKNOWN}`);
}

main()
  .catch((err) => {
    console.error('Re-check failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
