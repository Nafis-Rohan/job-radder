// Checks a link a USER typed, before the server ever opens it (SSRF protection:
// without this, someone could make the server call localhost or other internal addresses).
// This is the check on the TEXT of the link. The scraper must also check where the name really points
// (DNS) when it connects, because a public-looking name can point to a private address.

const MAX_LENGTH = 500;

// names that only exist inside a network
const PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.lan', '.home', '.corp', '.intranet'];

// Returns a clean URL object, or null when the link is not acceptable:
// - must be https, no user:password@ part, no custom port
// - must be a real domain name: no IP address (any form), no "localhost", no internal suffix
export function parsePublicHttpsUrl(input) {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_LENGTH) return null;

  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port) return null; // https default (443) only

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;
  // the URL parser turns every IP form (0x7f.1, 2130706433, [::1]) into dotted numbers or [..], both rejected here
  if (host.includes(':') || host.startsWith('[') || /^[0-9.]+$/.test(host)) return null;
  // a normal domain: letters, digits, hyphens, at least one dot (IDN names arrive as "xn--...")
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;

  url.hash = ''; // "#open-position" is not a different page
  return url;
}

export const isPublicHttpsUrl = (input) => parsePublicHttpsUrl(input) !== null;
