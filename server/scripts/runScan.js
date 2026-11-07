// Manual scan: runs every enabled collector once and saves the jobs.
// Run from the server folder:  node scripts/runScan.js
// Phase 6 replaces this with the real scan runner (locks, ScanRun history, scheduler).
import { getCollectors } from '../src/features/collectors/index.js';
import { saveJobs } from '../src/features/jobs/jobs.service.js';
import { prisma } from '../src/shared/db/prisma.js';

async function main() {
  const totals = { found: 0, inserted: 0, duplicates: 0, invalid: 0, skipped: 0, failedSources: 0 };

  for (const collector of getCollectors()) {
    console.log(`\n[${collector.name}] collecting...`);
    try {
      const jobs = await collector.collect({ keywords: [] });
      const result = await saveJobs(jobs);
      console.log(
        `[${collector.name}] found ${jobs.length}: ${result.inserted} new, ` +
          `${result.duplicates} already saved, ${result.skipped} not tech (skipped), ${result.invalid} invalid`,
      );
      totals.found += jobs.length;
      totals.inserted += result.inserted;
      totals.duplicates += result.duplicates;
      totals.invalid += result.invalid;
      totals.skipped += result.skipped;
    } catch (err) {
      // one broken source must never stop the others
      totals.failedSources += 1;
      console.error(`[${collector.name}] FAILED: ${err.message}`);
    }
  }

  console.log('\nDone.', totals);
  console.log('Jobs in the database now:', await prisma.job.count());
  // an automated caller must see that a source failed
  if (totals.failedSources > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('Scan crashed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
