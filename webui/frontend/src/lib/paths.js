/**
 * Convert an arbitrary string to a filesystem-safe slug.
 *
 * Rules:
 * - Lowercase
 * - Keep letters (Latin + Cyrillic), digits, and hyphens
 * - Replace everything else (including whitespace) with `-`
 * - Collapse runs of `-` and trim from edges
 * - Non-string input is coerced; returns `''` for empty result
 *
 * @param {*} input
 * @returns {string}
 */
export function slugify(input) {
  if (input === null || input === undefined) return '';
  const source = String(input);
  return source
    .toLowerCase()
    .replace(/[^a-zа-яё0-9-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}
