const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

// Bangladesh mobile: 01712345678, 01712-345678, +8801712345678, +880 1712 345678
const BD_PHONE = '(?<!\\d)(?:\\+?880|0)?[\\s-]?1[3-9]\\d{2}[\\s-]?\\d{6}(?!\\d)';
// International with a leading +: +1 555 123 4567, +44 20 7946 0958
const INTL_PHONE = '\\+\\d{1,3}[\\s.-]?\\(?\\d{1,4}\\)?(?:[\\s.-]?\\d{2,4}){2,4}(?!\\d)';
// US style: (555) 123-4567
const US_PHONE = '\\(\\d{3}\\)\\s?\\d{3}[\\s-]?\\d{4}';
const PHONE_RE = new RegExp(`${INTL_PHONE}|${US_PHONE}|${BD_PHONE}`, 'g');

// "Address: ..." / "Present Address - ..." lines
const ADDRESS_LABEL_RE = /^[ \t]*(?:(?:present|permanent|current|home|mailing)[ \t]+)?address[ \t]*[:\-–].*$/gim;
// Lines with a street-like word followed by a number: "House 12, Road 5, Dhanmondi, Dhaka"
const ADDRESS_STREET_RE = /^.*\b(?:house|road|rd|block|sector|flat|apt|apartment|street|st|lane|avenue|ave)\b\.?[ \t]*(?:no\.?|#)?[ \t]*[-:]?[ \t]*\d+.*$/gim;

const PROFILE_RE = /https?:\/\/(?:www\.)?(?:linkedin|facebook|github|twitter|x|instagram)\.com\/\S+/gi;

export function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

export function maskPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length <= 2) return '***';
  return `${'*'.repeat(digits.length - 2)}${digits.slice(-2)}`;
}

// Replaces emails, phone numbers, street addresses and social profile links with
// placeholders. Use it before any text goes to a log or an outside service.
export function maskPersonalInfo(text) {
  if (!text) return '';

  return String(text)
    .replace(EMAIL_RE, '[email]')
    .replace(PROFILE_RE, '[profile]')
    .replace(ADDRESS_LABEL_RE, '[address]')
    .replace(ADDRESS_STREET_RE, '[address]')
    .replace(PHONE_RE, '[phone]');
}
