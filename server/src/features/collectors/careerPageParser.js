import * as cheerio from 'cheerio';
import { htmlToText } from '../../shared/utils/htmlToText.js';
import { parsePublicHttpsUrl } from '../../shared/utils/safeUrl.js';

// Reads a favorite company's career page. No network here: HTML text in, plain data out.
// 1) findJobLinks: the career page -> the links of the individual job pages
// 2) parseJobPage: one job page -> { title, description, location, postedAt, deadline, isRemote }
// It works from the link alone (no per-site settings): job links are the links on the SAME site under the
// career page's path (e.g. /career/<job>/), and a job page is read from its structured JobPosting data when the
// page has it, otherwise from its heading / title and main text.

export const MAX_LINKS = 60;
const MAX_DESCRIPTION = 20_000;
const MAX_TITLE = 300;

// text that is not content: removed before the page text is read
const JUNK = 'script, style, noscript, template, nav, header, footer, aside, form, iframe, svg, button';

// a link text like "Apply Now" or "View details" (the card of a job on a list page)
const APPLY_TEXT = /\b(apply|view (?:job|role|position|opening|details?)|read more|learn more|see details?)\b/i;
// words that a real job page has
const JOB_WORDS =
  /\b(apply|responsibilit\w*|requirements?|qualifications?|what you(?:'|’)ll (?:do|bring)|about the (?:role|job|position)|job (?:description|summary)|overview|we are (?:looking|seeking|hiring))\b/i;
const FILE_EXTENSION = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|png|jpe?g|gif|webp|svg|mp[34]|xml|json|txt)$/i;
// /jobs/<name>, /careers/<name>, /openings/<name> ... anywhere in the path
const JOB_PATH = /\/(?:jobs?|careers?|positions?|openings?|vacanc(?:y|ies)|opportunit(?:y|ies))\/[^/?#]+/i;

const bareHost = (host) => host.toLowerCase().replace(/^www\./, '');
const withSlash = (path) => (path.endsWith('/') ? path : `${path}/`);
const squeeze = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

// ---------- structured data (JSON-LD) ----------

// All JobPosting objects described in the page's <script type="application/ld+json"> blocks.
export function extractJobPostings(html) {
  const $ = cheerio.load(html);
  const found = [];

  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    const type = node['@type'];
    if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) found.push(node);
    if (node['@graph']) visit(node['@graph']);
  };

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      visit(JSON.parse($(element).contents().text().trim()));
    } catch {
      // a broken block is skipped
    }
  });
  return found;
}

function postingLocation(posting) {
  const places = [].concat(posting.jobLocation ?? []);
  const names = [];
  for (const place of places) {
    const address = place?.address ?? place;
    if (typeof address === 'string') names.push(address);
    else if (address) names.push(...[address.addressLocality, address.addressRegion, address.addressCountry].map((part) => (typeof part === 'object' ? part?.name : part)));
  }
  const unique = [...new Set(names.map(squeeze).filter(Boolean))];
  return unique.length ? unique.join(', ') : undefined;
}

const toDate = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

// ---------- 1) job links of a career page ----------

// html = the career page, pageUrl = its address. Returns absolute https links, without duplicates.
export function findJobLinks(html, pageUrl) {
  const base = new URL(pageUrl);
  const careerPath = withSlash(base.pathname);
  const $ = cheerio.load(html);

  const accept = (href) => {
    let url;
    try {
      url = parsePublicHttpsUrl(new URL(href, base).href); // also drops the #fragment
    } catch {
      return null;
    }
    if (!url || bareHost(url.hostname) !== bareHost(base.hostname)) return null; // other sites are never followed
    url.hostname = base.hostname; // www.x.com and x.com are the same page: always the spelling of the career page
    if (FILE_EXTENSION.test(url.pathname)) return null;
    for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);

    const path = withSlash(url.pathname);
    if (path === careerPath) return null; // the career page itself (page=2, #top ...)
    const underCareerPath = careerPath !== '/' && path.startsWith(careerPath);
    return underCareerPath || JOB_PATH.test(url.pathname) ? url.href : null;
  };

  const candidates = new Map(); // link -> true when its text looks like "Apply now"
  $('a[href]').each((_, element) => {
    const link = accept($(element).attr('href'));
    if (!link) return;
    const applyLike = APPLY_TEXT.test(squeeze($(element).text())) || APPLY_TEXT.test($(element).attr('aria-label') ?? '');
    candidates.set(link, candidates.get(link) || applyLike);
  });

  // links from structured data on the list page
  for (const posting of extractJobPostings(html)) {
    const link = typeof posting.url === 'string' ? accept(posting.url) : null;
    if (link && !candidates.has(link)) candidates.set(link, true);
  }

  // If some links look like job cards ("Apply Now"), only those are used: the other links under the career
  // path are then most likely menu or info pages (benefits, culture ...).
  const all = [...candidates.keys()];
  const applyLinks = all.filter((link) => candidates.get(link));
  return (applyLinks.length > 0 ? applyLinks : all).slice(0, MAX_LINKS);
}

// ---------- 2) one job page ----------

// "Backend Engineer | Acme Ltd." -> "Backend Engineer"
export function cleanTitle(raw) {
  const text = squeeze(raw);
  // only the LAST " | " / " – " / " — " and what follows it (the company name) is cut off
  const withoutCompany = text.match(/^(.*\S)\s+(?:\||–|—)\s+[^|–—]+$/);
  return (withoutCompany ? withoutCompany[1] : text).slice(0, MAX_TITLE).trim();
}

// html = the job page. Returns null when it does not look like a job posting.
export function parseJobPage(html) {
  const posting = extractJobPostings(html)[0];

  if (posting && posting.title) {
    const description = htmlToText(String(posting.description ?? '')).slice(0, MAX_DESCRIPTION);
    return {
      title: cleanTitle(posting.title),
      description,
      location: postingLocation(posting),
      postedAt: toDate(posting.datePosted),
      deadline: toDate(posting.validThrough),
      isRemote: [].concat(posting.jobLocationType ?? []).some((type) => /telecommute/i.test(String(type))),
    };
  }

  // no structured data: title from the heading, then the social title, then the page title
  const $ = cheerio.load(html);
  const heading = squeeze($('h1').first().text());
  const title = cleanTitle(
    heading.length >= 3 && heading.length <= 200 ? heading : $('meta[property="og:title"]').attr('content') || $('title').first().text(),
  );
  if (title.length < 3) return null;

  // main text: the <main> / <article> part if there is one, without scripts, menus and forms
  const area = $('main').first().length ? $('main').first() : $('article').first().length ? $('article').first() : $('body');
  area.find(JUNK).remove();
  let description = htmlToText(area.html() ?? '').slice(0, MAX_DESCRIPTION);
  if (description.length < 60) description = squeeze($('meta[name="description"]').attr('content'));

  // a page about benefits or culture is not a job: it needs real text with job words
  if (description.length < 100 || !JOB_WORDS.test(description)) return null;

  return { title, description, location: undefined, postedAt: undefined, deadline: undefined, isRemote: false };
}
