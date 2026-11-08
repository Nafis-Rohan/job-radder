// Manual scan: runs every enabled collector once and saves the jobs (and a ScanRun row).
// Run from the server folder:  node scripts/runScan.js
import { runScan } from '../src/features/scans/scan.service.js';
import { prisma } from '../src/shared/db/prisma.js';

async function main() {
  const result = await runScan('local');

  for (const [name, r] of Object.entries(result.perSource)) {
    if (r.error) {
      console.error(`[${name}] FAILED: ${r.error}`);
    } else {
      console.log(
        `[${name}] found ${r.found}: ${r.inserted} new, ${r.duplicates} already saved, ` +
          `${r.skipped} not tech (skipped), ${r.invalid} invalid`,
      );
    }
  }
  console.log(`\nScan ${result.runId}: ${result.status}, ${result.newJobs} new jobs.`);
  console.log('Jobs in the database now:', await prisma.job.count());
  // an automated caller must see that something went wrong (SKIPPED is not an error)
  if (result.status === 'FAILED' || result.status === 'PARTIAL') process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('Scan crashed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
