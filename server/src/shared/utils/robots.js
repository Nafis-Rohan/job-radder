import { safeGet } from './safeHttp.js';

// Reads a site's robots.txt and says whether we may open a page. We follow it for every site we scrape.
// Rules (RFC 9309): the rules of OUR group (user agent "jobradar") are used; if there is none, the group "*".
// Among the rules that match a path, the longest one wins; if an Allow and a Disallow are equally long, Allow wins.
// "*" in a pattern means any text, "$" at the end means "the path ends here".

export const AGENT = 'jobradar';
const MAX_ROBOTS_CHARS = 500 * 1024; // sites may ignore what comes after 500 KiB

// text -> [{ agents: ['*'], rules: [{ allow, path }], crawlDelay }]
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;

  for (const rawLine of String(text ?? '').slice(0, MAX_ROBOTS_CHARS).split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      // several user-agent lines in a row share the rules below them
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    if (field === 'sitemap') continue; // not part of a group
    lastWasAgent = false;
    if (!current) continue; // a rule before any user-agent line is ignored

    if (field === 'allow' || field === 'disallow') {
      if (value !== '') current.rules.push({ allow: field === 'allow', path: value }); // "Disallow:" (empty) = allow all
    } else if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = seconds;
    }
  }
  return groups;
}

// The rules and crawl delay that apply to `agent`.
export function rulesFor(groups, agent = AGENT) {
  const pick = (name) => groups.filter((group) => group.agents.includes(name));
  const own = pick(agent);
  const chosen = own.length > 0 ? own : pick('*');
  return {
    rules: chosen.flatMap((group) => group.rules),
    crawlDelay: chosen.map((group) => group.crawlDelay).find((value) => value !== null) ?? null,
  };
}

function patternToRegExp(pattern) {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

// path = the path and query of the page, like "/career/?page=2"
export function isPathAllowed(rules, path) {
  let best = null;
  for (const rule of rules) {
    if (!patternToRegExp(rule.path).test(path)) continue;
    const longer = !best || rule.path.length > best.path.length;
    const tieAllow = best && rule.path.length === best.path.length && rule.allow && !best.allow;
    if (longer || tieAllow) best = rule;
  }
  return best ? best.allow : true; // no rule matches: allowed
}

// Makes a checker with a memory: robots.txt of a site is fetched once per checker (make one per scan).
// check(url) -> { allowed, crawlDelayMs, reason }.
// robots.txt missing (4xx) = no rules. A broken or unreachable one (5xx, network error) = we do NOT scrape that site.
export function createRobotsChecker({ get = safeGet, agent = AGENT } = {}) {
  const sites = new Map(); // origin -> Promise<{ rules, crawlDelay, blocked? }>

  async function load(origin) {
    try {
      const response = await get(`${origin}/robots.txt`);
      if (response.status >= 500) return { blocked: `robots.txt unavailable (${response.status})` };
      if (response.status >= 400) return { rules: [], crawlDelay: null }; // no robots.txt: no rules
      return rulesFor(parseRobots(response.body), agent);
    } catch (err) {
      return { blocked: `robots.txt could not be read (${err.message})` };
    }
  }

  return {
    async check(link) {
      const url = new URL(link);
      if (!sites.has(url.origin)) sites.set(url.origin, load(url.origin));
      const site = await sites.get(url.origin);

      if (site.blocked) return { allowed: false, crawlDelayMs: 0, reason: site.blocked };
      const allowed = isPathAllowed(site.rules, url.pathname + url.search);
      return {
        allowed,
        crawlDelayMs: site.crawlDelay === null ? 0 : Math.round(site.crawlDelay * 1000),
        reason: allowed ? null : 'Disallowed by robots.txt',
      };
    },
  };
}
