import Parser from 'rss-parser';
import { httpGet } from '../../shared/utils/http.js';
import { randomSleep } from '../../shared/utils/sleep.js';
import { htmlToText } from '../../shared/utils/htmlToText.js';
import { logger } from '../../shared/utils/logger.js';

const SOURCE = 'weworkremotely';

// Public RSS feeds (robots.txt allows them). If a feed moves, fix it here.
const FEEDS = [
  'https://weworkremotely.com/categories/remote-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss',
];

const parser = new Parser({
  customFields: { item: ['region', 'country', 'state', 'skills', 'expires_at'] },
});

function toDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// The feed title is "Company: Job title".
function splitTitle(rawTitle) {
  const title = String(rawTitle ?? '').trim();
  const index = title.indexOf(': ');
  if (index === -1) return { company: 'Unknown', title };
  return { company: title.slice(0, index).trim(), title: title.slice(index + 2).trim() };
}

// One RSS feed (XML text) -> NormalizedJob[]
export async function parseFeed(xml) {
  const feed = await parser.parseString(xml);

  return feed.items.map((item) => {
    const { company, title } = splitTitle(item.title);
    const region = item.region?.trim() || undefined;
    const country = item.country?.trim() || undefined;

    return {
      source: SOURCE,
      url: item.link || item.guid,
      title,
      company,
      location: country || region,
      description: htmlToText(item.content || item.description || ''),
      postedAt: toDate(item.isoDate || item.pubDate),
      deadline: toDate(item.expires_at),
      isRemote: true,
      remoteScope: region, // raw region text, e.g. "Anywhere in the World"; judged in Phase 12
    };
  });
}

export default {
  name: SOURCE,
  enabled: true,
  async collect() {
    const jobs = [];
    let failedFeeds = 0;

    for (const [index, url] of FEEDS.entries()) {
      if (index > 0) await randomSleep();
      try {
        jobs.push(...(await parseFeed(await httpGet(url))));
      } catch (err) {
        failedFeeds += 1;
        logger.warn({ source: SOURCE, feed: url, errMessage: err.message }, 'Feed failed');
      }
    }

    // every feed failed = the source is down: tell the scan runner
    if (failedFeeds === FEEDS.length) throw new Error('All We Work Remotely feeds failed');
    return jobs;
  },
};
