function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-term match, case-insensitive: "java" must not match inside "javascript",
// and "sql" must not match inside "mysql" or "postgresql".
export function buildTermRegex(term, flags = 'i') {
  const escaped = escapeRegex(term.toLowerCase()).replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![a-z0-9_])${escaped}(?![a-z0-9_])`, flags);
}
