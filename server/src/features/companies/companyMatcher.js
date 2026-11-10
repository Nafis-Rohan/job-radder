// Decides whether a job's company is one of the user's favorites.
// Both names are cleaned the same way, then compared as a WHOLE name (never a part), so
// "Brain Station 23 Ltd." matches "brain station 23" but "Meta" does not match "Metaverse Studio".
// Other spellings are covered by the aliases of the favorite (e.g. "GP" for "Grameenphone").

// Words that only say what kind of company it is. Removed from the END of a name, as many as there are.
const LEGAL_WORDS = new Set([
  'ltd', 'limited', 'inc', 'incorporated', 'plc', 'llc', 'llp', 'corp', 'corporation',
  'co', 'company', 'pvt', 'private', 'pte', 'gmbh', 'bv', 'sdn', 'bhd',
]);

export function normalizeCompany(name) {
  if (typeof name !== 'string') return '';
  const words = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents: "Café" -> "Cafe"
    .normalize('NFC') // put letters like Bangla "য়" back together (NFKD split them)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9ঀ-৿]+/g, ' ') // punctuation -> space (Bangla letters are kept)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const kept = [...words];
  while (kept.length > 1 && LEGAL_WORDS.has(kept[kept.length - 1])) kept.pop();
  return kept.join(' ');
}

// favorites = [{ name, aliases }]. Returns a function: company name -> true / false.
export function buildCompanyMatcher(favorites) {
  const known = new Set();
  for (const favorite of favorites) {
    for (const name of [favorite.name, ...(favorite.aliases ?? [])]) {
      const normalized = normalizeCompany(name);
      if (normalized) known.add(normalized);
    }
  }
  return (companyName) => {
    const normalized = normalizeCompany(companyName);
    return normalized !== '' && known.has(normalized);
  };
}

// From a list of company names (as saved on jobs), the ones that are a favorite.
// Used to turn "favorites only" into a plain list the database can filter on.
export function favoriteCompanyNames(companyNames, favorites) {
  const isFavorite = buildCompanyMatcher(favorites);
  return companyNames.filter(isFavorite);
}
