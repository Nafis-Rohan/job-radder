import axios from 'axios';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { parsePublicHttpsUrl } from './safeUrl.js';

// Fetching pages from links a USER gave us (favorite companies' career pages).
// safeUrl.js checks the TEXT of the link. This file checks where the name REALLY points, at the moment
// we connect, because a public-looking name can point to a private address (localhost, the cloud
// metadata address, the home network...). Both checks are needed.

const USER_AGENT = 'Mozilla/5.0 (compatible; JobRadar/1.0; personal job search)';
const MAX_BYTES = 2 * 1024 * 1024;

// ---- addresses we never connect to ----
const blocked = new net.BlockList();
const V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
const V6 = [
  ['::', 96], // :: and ::1 and the old "IPv4-compatible" form
  ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32], ['2002::', 16], // translation, discard, documentation, 6to4
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], // private, link-local, multicast
];
for (const [address, prefix] of V4) blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of V6) blocked.addSubnet(address, prefix, 'ipv6');

// IPv4 written inside IPv6 (::ffff:127.0.0.1). It is not in the list above on purpose: Node's list would
// then treat EVERY IPv4 address as blocked. A real public website never answers like this, so it is refused.
function isMappedIpv4(address) {
  try {
    return /^\[::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}\]$/.test(new URL(`http://[${address}]/`).hostname);
  } catch {
    return false;
  }
}

// true = never connect. Anything that is not a valid IP address counts as blocked.
export function isPrivateAddress(address) {
  const family = net.isIP(String(address));
  if (family === 0) return true;
  if (family === 6 && isMappedIpv4(address)) return true;
  return blocked.check(String(address), family === 4 ? 'ipv4' : 'ipv6');
}

// A replacement for dns.lookup that refuses names pointing to a blocked address.
// If ANY answer is blocked, the whole name is refused. `resolve` can be replaced in tests.
export function createGuardedLookup(resolve = dns.lookup) {
  return (hostname, options, callback) => {
    const opts = typeof options === 'function' ? {} : { ...options };
    const done = typeof options === 'function' ? options : callback;

    resolve(hostname, { ...opts, all: true }, (err, addresses) => {
      if (err) return done(err);
      if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
        return done(new Error('Blocked: this address is not a public website'));
      }
      if (opts.all) return done(null, addresses);
      return done(null, addresses[0].address, addresses[0].family);
    });
  };
}

const bareHost = (host) => host.replace(/^www\./, '').toLowerCase();

// A redirect is followed only inside the same site, over https (www.x.com <-> x.com is the same site).
export function isAllowedRedirect(originHost, redirect) {
  return (
    redirect.protocol === 'https:' &&
    bareHost(redirect.hostname) === bareHost(originHost) &&
    parsePublicHttpsUrl(`https://${redirect.hostname}/`) !== null
  );
}

// Only text pages. A PDF, an image or a download is not read.
export const isTextContentType = (value) => /^(text\/|application\/(xhtml\+xml|xml|json|ld\+json))/i.test(String(value ?? ''));

// `adapter` and `lookup` can be replaced in tests.
export function createSafeGet({ adapter, lookup = createGuardedLookup() } = {}) {
  const client = axios.create({
    timeout: 15_000, // a slow site must never hang a scan
    maxContentLength: MAX_BYTES,
    maxBodyLength: 0,
    maxRedirects: 3,
    responseType: 'text',
    transformResponse: (data) => data,
    validateStatus: () => true, // the caller decides what a 404 means (for robots.txt it means "no rules")
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' },
    httpsAgent: new https.Agent({ lookup, keepAlive: false }),
    ...(adapter ? { adapter } : {}),
  });

  // Returns { status, body, contentType, url }. Throws when the link is not allowed or the connection fails.
  return async function safeGet(link) {
    const parsed = parsePublicHttpsUrl(link);
    if (!parsed) throw new Error('Blocked: the link must be a public https address');

    const response = await client.get(parsed.href, {
      beforeRedirect(redirect) {
        if (!isAllowedRedirect(parsed.hostname, redirect)) throw new Error('Redirect to another site was blocked');
      },
    });

    const contentType = String(response.headers?.['content-type'] ?? '');
    if (response.status < 400 && !isTextContentType(contentType)) {
      throw new Error(`Not a text page (${contentType || 'no content type'})`);
    }
    return {
      status: response.status,
      body: typeof response.data === 'string' ? response.data : '',
      contentType,
      url: response.request?.res?.responseUrl || parsed.href,
    };
  };
}

export const safeGet = createSafeGet();
