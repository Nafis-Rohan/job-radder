const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '-', mdash: '-', hellip: '...', bull: '-', middot: '-',
  lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"', laquo: '"', raquo: '"',
  copy: '(c)', reg: '(R)', trade: '(TM)', euro: 'EUR', pound: 'GBP', times: 'x',
};

// A number outside the Unicode range would make String.fromCodePoint throw.
function fromCode(code) {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => fromCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => fromCode(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);
}

// HTML -> readable plain text (job descriptions). Not an HTML sanitizer: the result is
// only ever used as text, never as HTML.
export function htmlToText(html) {
  if (!html) return '';

  const text = String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|ul|ol|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, '');

  return decodeEntities(text)
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
