import { httpGet } from '../../shared/utils/http.js';
import { htmlToText } from '../../shared/utils/htmlToText.js';

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

export default {
  name: SOURCE,
  enabled: true,
  async collect() {
    return parseResponse(await httpGet(API_URL, { headers: { Accept: 'application/json' } }));
  },
};
