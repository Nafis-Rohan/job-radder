import { createHash } from 'node:crypto';

// lowercase, trim, and squeeze any run of spaces/tabs/newlines into one space
function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// The same real job found on two sites (or twice on one site) gets the same hash.
// hash = sha256 of the normalized [company, title, location]. A missing location counts as
// empty text. The fields go in as a JSON list, so a "|" inside a title cannot move the
// border between two fields.
export function jobHash({ company, title, location }) {
  const key = JSON.stringify([company, title, location].map(normalize));
  return createHash('sha256').update(key).digest('hex');
}
