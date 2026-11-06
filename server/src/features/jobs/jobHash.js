import { createHash } from 'node:crypto';

// lowercase, trim, and squeeze any run of spaces/tabs/newlines into one space
function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// The same real job found on two sites (or twice on one site) gets the same hash.
// hash = sha256(company | title | location). A missing location counts as empty text.
export function jobHash({ company, title, location }) {
  const key = [company, title, location].map(normalize).join('|');
  return createHash('sha256').update(key).digest('hex');
}
