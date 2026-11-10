import { prisma } from '../../shared/db/prisma.js';
import { logger } from '../../shared/utils/logger.js';
import { safeGet } from '../../shared/utils/safeHttp.js';
import { createRobotsChecker } from '../../shared/utils/robots.js';
import { parsePublicHttpsUrl } from '../../shared/utils/safeUrl.js';
import { sleep } from '../../shared/utils/sleep.js';
import { findJobLinks, parseJobPage } from './careerPageParser.js';

// Reads the career pages of everybody's favorite companies and returns their open jobs.
// Polite on purpose: robots.txt is followed, one request at a time with a pause between requests to the same site,
// a job page we already saved is never opened again, and the whole run has a time limit.

export const SOURCE = 'careerpage';
export const MAX_COMPANIES = 40; // career pages read per scan
export const MAX_NEW_JOBS_PER_COMPANY = 20; // new job pages opened per company per scan
export const BUDGET_MS = 10 * 60 * 1000; // the collector stops starting new requests after this long
const MAX_CRAWL_DELAY_MS = 10_000; // a site's Crawl-delay above this is capped

// pause between two requests to the same site: 2 to 4 seconds
const defaultGap = () => 2000 + Math.random() * 2000;

// Everything outside can be replaced in tests (network, database, clock, pauses).
export function createCareerPageCollector({
  get = safeGet,
  loadFavorites = () => prisma.favoriteCompany.findMany({ select: { name: true, careersUrl: true }, orderBy: { createdAt: 'asc' } }),
  findKnownUrls = async (urls) => (await prisma.job.findMany({ where: { url: { in: urls } }, select: { url: true } })).map((row) => row.url),
  wait = sleep,
  gapMs = defaultGap,
  budgetMs = BUDGET_MS,
  now = () => Date.now(),
} = {}) {
  return {
    name: SOURCE,
    enabled: true,

    // Returns NormalizedJob[]. Throws only when EVERY career page failed (the source is then reported as failed).
    async collect() {
      const stopAt = now() + budgetMs;
      const lastRequestAt = new Map(); // site -> time of the last request

      // one request, after the pause that is due for that site
      async function politeGet(url, crawlDelayMs = 0) {
        const host = new URL(url).hostname;
        const gap = Math.min(Math.max(gapMs(), crawlDelayMs), MAX_CRAWL_DELAY_MS);
        const due = (lastRequestAt.get(host) ?? 0) + gap - now();
        if (due > 0) await wait(due);
        lastRequestAt.set(host, now());
        return get(url);
      }

      // robots.txt is a request to the site too: it gets the same pause
      const robots = createRobotsChecker({ get: (url) => politeGet(url) });

      // robots.txt first, then the page. Returns the response, or throws with the reason.
      async function readPage(url) {
        const verdict = await robots.check(url);
        if (!verdict.allowed) throw new Error(verdict.reason);
        const response = await politeGet(url, verdict.crawlDelayMs);
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return response;
      }

      // ---- which pages to read: one per career page link, with the name of the first favorite that has it ----
      const pages = new Map();
      for (const favorite of await loadFavorites()) {
        const url = parsePublicHttpsUrl(favorite.careersUrl);
        if (url && !pages.has(url.href)) pages.set(url.href, favorite.name);
      }
      const companies = [...pages].slice(0, MAX_COMPANIES);
      if (companies.length === 0) return [];

      const jobs = [];
      const failures = [];

      for (const [careersUrl, company] of companies) {
        if (now() > stopAt) {
          failures.push(`${company}: not read, the time limit was reached`);
          continue;
        }

        try {
          const list = await readPage(careersUrl);
          const links = findJobLinks(list.body, list.url || careersUrl);
          const known = new Set(links.length ? await findKnownUrls(links) : []);
          const fresh = links.filter((link) => !known.has(link)).slice(0, MAX_NEW_JOBS_PER_COMPANY);

          let opened = 0;
          let notJobs = 0;
          for (const link of fresh) {
            if (now() > stopAt) break;
            try {
              const page = await readPage(link);
              const job = parseJobPage(page.body);
              if (!job) {
                notJobs += 1;
                continue;
              }
              jobs.push({
                source: SOURCE,
                url: link,
                title: job.title,
                company, // the name of the favorite, so the job is recognised as theirs
                location: job.location,
                description: job.description,
                postedAt: job.postedAt,
                deadline: job.deadline,
                isRemote: job.isRemote,
                keepAllRoles: true, // every opening of a favorite company counts, not only tech roles
              });
              opened += 1;
            } catch (err) {
              logger.warn({ source: SOURCE, company, link, errMessage: err.message }, 'Job page skipped');
            }
          }
          logger.info({ source: SOURCE, company, links: links.length, known: known.size, opened, notJobs }, 'Career page read');
        } catch (err) {
          failures.push(`${company}: ${err.message}`);
          logger.warn({ source: SOURCE, company, careersUrl, errMessage: err.message }, 'Career page failed');
        }
      }

      // every career page failed = the source did not work: tell the scan runner
      if (failures.length === companies.length) {
        throw new Error(`Career pages failed: ${failures.join('; ')}`.slice(0, 500));
      }
      return jobs;
    },
  };
}

export default createCareerPageCollector();
