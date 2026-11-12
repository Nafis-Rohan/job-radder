import { httpGet } from '../../shared/utils/http.js';
import { htmlToText } from '../../shared/utils/htmlToText.js';
import { logger } from '../../shared/utils/logger.js';

const SOURCE = 'remotive';

// Free public API. Terms (https://remotive.com/api-documentation): link back to the job's Remotive
// URL and name Remotive as the source (we keep both), and at most 4 requests a day.
// One scan = one request, and scans run every 6 hours.
const API_URL = 'https://remotive.com/api/remote-jobs?category=software-dev';

function toDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// API response (JSON text) -> NormalizedJob[]
export function parseResponse(body) {
  const data = JSON.parse(body);
  if (!Array.isArray(data?.jobs)) throw new Error('Remotive answer has no jobs list');

  return data.jobs.map((item) => {
    const where = String(item.candidate_required_location ?? '').trim() || undefined;
    return {
      source: SOURCE,
      url: item.url,
      title: item.title,
      company: item.company_name,
      location: where,
      description: htmlToText(item.description || ''),
      postedAt: toDate(item.publication_date),
      // Remotive's own "tags" are ignored on purpose: some jobs list nearly every technology,
      // which would make them look like a match for everything. Skills come from title + description.
      isRemote: true,
      remoteScope: where, // e.g. "LATAM, Europe, USA, Canada, APAC"; judged by remoteEligibility
    };
  });
}

// Their limit is about 4 requests a day. Manual scans must not break it: after a request, the next one
// waits at least 5.5 hours (a scan every 6 hours still gets its jobs). Kept in memory: a server restart
// resets it, which is fine for one user.
export const MIN_GAP_MS = 5.5 * 60 * 60 * 1000;

// `get` and `now` can be replaced in tests (no real call, fake clock).
export function buildRemotive({ get = httpGet, now = Date.now } = {}) {
  let lastRequestAt = null;

  return {
    name: SOURCE,
    enabled: true,
    async collect() {
      if (lastRequestAt !== null && now() - lastRequestAt < MIN_GAP_MS) {
        logger.info({ source: SOURCE }, 'Remotive was asked recently, skipped to respect its request limit');
        return [];
      }
      lastRequestAt = now(); // a failed request counts too
      return parseResponse(await get(API_URL, { headers: { Accept: 'application/json' } }));
    },
  };
}

export default buildRemotive();
