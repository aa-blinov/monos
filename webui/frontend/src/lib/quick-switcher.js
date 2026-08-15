/**
 * Quick switcher helpers: fuzzy matching and query parsing.
 *
 * The quick switcher (Cmd+O) lets the user open a note by typing a
 * fragment of its name. It supports:
 *   - fuzzy match against note name (case-insensitive, character order
 *     must be preserved, bonus for matching at the start of a word)
 *   - inline filters `tag:foo` and `path:bar/qua`
 *   - quoted exact phrases
 *
 * The score is bounded: an exact (case-insensitive) name match wins,
 * prefix match beats a mid-string match, fuzzy falls in last.
 */

const WORD_START_BONUS = 10;
const FIRST_CHAR_BONUS = 30; // match at the very start of the target
const EXACT_BONUS = 100;
const CONSECUTIVE_BONUS = 5;

/**
 * Score a fuzzy match of `query` against `target` (both lowercased
 * before comparison). Returns 0 for non-matches.
 *
 * @param {string} query
 * @param {string} target
 * @returns {number}
 */
export function fuzzyScore(query, target) {
  if (!query || !target) return 0;
  const q = String(query).toLowerCase();
  const t = String(target).toLowerCase();
  if (q === t) return EXACT_BONUS + t.length;
  if (!q || !t) return 0;

  let score = 0;
  let qi = 0;
  let lastMatch = -2;
  let matchedCount = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      matchedCount++;
      score += 1;
      if (ti === lastMatch + 1) score += CONSECUTIVE_BONUS;
      if (ti === 0) score += FIRST_CHAR_BONUS;
      else if (/[\s\-_/.]/.test(t[ti - 1])) score += WORD_START_BONUS;
      lastMatch = ti;
      qi++;
    }
  }

  // если ни один char из q не нашёлся в t → 0
  if (matchedCount === 0) return 0;
  // штраф за несовпавшие chars из q (partial match)
  score -= (q.length - matchedCount) * 2;
  return Math.max(0, score);
}

/**
 * Parse a quick-switcher input string into a search term and a map of
 * inline filters.
 *
 * Examples:
 *   "project brief"        → { term: "project brief", filters: {} }
 *   "tag:work project"     → { term: "project", filters: { tag: "work" } }
 *   'path:Notes/2026 "Q4"' → { term: "Q4", filters: { path: "Notes/2026" } }
 *
 * @param {string} input
 * @returns {{ term: string, filters: Record<string,string> }}
 */
export function parseQuickSwitcherQuery(input) {
  const safe = String(input || '').trim();
  if (!safe) return { term: '', filters: {} };

  const filters = {};
  const termTokens = [];

  // Split on whitespace but keep quoted phrases intact
  const tokens = [];
  let buf = '';
  let inQuote = false;
  for (let i = 0; i < safe.length; i++) {
    const c = safe[i];
    if (c === '"') {
      inQuote = !inQuote;
      buf += c;
      continue;
    }
    if (!inQuote && /\s/.test(c)) {
      if (buf) { tokens.push(buf); buf = ''; }
      continue;
    }
    buf += c;
  }
  if (buf) tokens.push(buf);

  for (const tok of tokens) {
    const m = tok.match(/^([A-Za-z]+):(.+)$/);
    if (m && (m[1] === 'tag' || m[1] === 'path')) {
      filters[m[1]] = m[2].replace(/^"|"$/g, '').trim();
    } else {
      termTokens.push(tok.replace(/^"|"$/g, ''));
    }
  }

  return { term: termTokens.join(' ').trim(), filters };
}

/**
 * Rank a list of notes against a parsed quick-switcher query. Each result
 * gets a `{ item, score }` shape; notes that fail the inline filters are
 * dropped.
 *
 * @param {string} input raw query string (will be parsed internally)
 * @param {Array<{name: string, path: string, tags?: string[]}>} notes
 * @returns {Array<{item: any, score: number}>}
 */
export function rankQuickSwitcherResults(input, notes) {
  const { term, filters } = parseQuickSwitcherQuery(input);
  const items = Array.isArray(notes) ? notes : [];

  return items
    .map((item) => {
      let score = 0;

      if (filters.tag) {
        const tags = (item.tags || []).map((t) => String(t).toLowerCase());
        if (!tags.includes(String(filters.tag).toLowerCase())) return null;
      }
      if (filters.path) {
        if (!String(item.path || '').toLowerCase().includes(String(filters.path).toLowerCase())) {
          return null;
        }
      }

      if (term) {
        const nameScore = fuzzyScore(term, item.name);
        const pathScore = fuzzyScore(term, item.path) * 0.5;
        score = Math.max(nameScore, pathScore);
        if (score === 0) return null;
      }

      return { item, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}
