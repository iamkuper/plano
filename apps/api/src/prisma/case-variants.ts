// Spellings of a search term that a database with a "C" locale (where ILIKE
// doesn't fold Cyrillic) would still match: as typed, lower, UPPER and
// Capitalised. With a UTF-8 locale ILIKE already covers all of them.
export function caseVariants(term: string): string[] {
  const t = term.trim();
  if (!t) return [];
  const capitalised = t[0].toUpperCase() + t.slice(1).toLowerCase();
  return [...new Set([t, t.toLowerCase(), t.toUpperCase(), capitalised])];
}
