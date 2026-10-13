/**
 * Helpers for the note's category field: clean up what the user typed, and
 * suggest categories that already exist in the vault. Suggestions come from
 * `/api/categories` as `{ name, count }`, most used first.
 */

/** Trim and collapse inner spaces, so "  Work   notes " is stored as "Work notes". */
export function normalizeCategory(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * The spelling to store for `raw`. If a category with the same name in another
 * case already exists, use that existing spelling, so "work" joins "Work"
 * instead of splitting the vault into two categories.
 */
export function canonicalCategory(raw, suggestions = []) {
  const wanted = normalizeCategory(raw);
  if (!wanted) return '';
  const lower = wanted.toLowerCase();
  const existing = suggestions.find((item) => item.name.toLowerCase() === lower);
  return existing ? existing.name : wanted;
}

/**
 * Suggestions to show for what is typed now. An empty query gives the most used
 * categories. Otherwise matches that start with the query come first, then
 * matches that contain it. Case is ignored.
 */
export function filterCategories(suggestions = [], query = '', limit = 8) {
  const wanted = normalizeCategory(query).toLowerCase();
  if (!wanted) return suggestions.slice(0, limit);
  const starts = [];
  const contains = [];
  for (const item of suggestions) {
    const name = item.name.toLowerCase();
    if (name.startsWith(wanted)) starts.push(item);
    else if (name.includes(wanted)) contains.push(item);
  }
  return [...starts, ...contains].slice(0, limit);
}
