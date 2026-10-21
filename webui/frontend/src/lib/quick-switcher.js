/**
 * Quick switcher helpers: fuzzy matching and query parsing.
 *
 * The quick switcher (Ctrl+O) lets the user open a note by typing a fragment
 * of its name. It supports:
 *   - fuzzy match against note name (case-insensitive, character order must be
 *     preserved, bonus for matching at the start of a word)
 *   - inline filters: `tag:`, `path:`, `folder:`, `title:`, `note:`,
 *     `category:`, `created:`
 *   - negation with a leading `-`: `-tag:archive`
 *   - repeated filters, which widen: `tag:work tag:urgent`
 *   - quoted exact phrases, and quoted filter values: `path:"Base/EORA"`
 *
 * Every operator reads only fields the tree already returns, so filtering costs
 * no extra request. Operators that would need note bodies (full-text search,
 * `type:task`) are deliberately absent: the tree does not carry content, and a
 * filter that silently never matches is worse than no filter at all.
 *
 * The score is bounded: an exact (case-insensitive) name match wins, prefix
 * match beats a mid-string match, fuzzy falls in last.
 */

const WORD_START_BONUS = 10;
const FIRST_CHAR_BONUS = 30; // match at the very start of the target
const EXACT_BONUS = 100;
const CONSECUTIVE_BONUS = 5;

/** Operators this switcher understands. Anything else stays a search term. */
export const SWITCHER_OPERATORS = ['tag', 'path', 'folder', 'title', 'note', 'category', 'created'];

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

/** Split on whitespace, keeping quoted runs together and keeping the quotes. */
function tokenize(input) {
  const tokens = [];
  let buf = '';
  let inQuote = false;
  for (const c of input) {
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
  return tokens;
}

const unquote = (value) => String(value).replace(/^"|"$/g, '').trim();

/**
 * Parse a quick-switcher input into a search term and inline filters.
 *
 *   "project brief"          → { term: "project brief", filters: {} }
 *   "tag:work project"       → { term: "project", filters: { tag: "work" } }
 *   'path:Notes/2026 "Q4"'   → { term: "Q4", filters: { path: "Notes/2026" } }
 *   "tag:work tag:urgent"    → { term: "", filters: { tag: ["work","urgent"] } }
 *   "-tag:archive"           → { term: "", filters: { "-tag": "archive" } }
 *
 * A repeated operator collects its values into an array, because repeating a
 * filter should widen it (`tag:a tag:b` means "either tag"). Negation keeps the
 * minus in the key (`-tag`) so both can coexist.
 *
 * @param {string} input
 * @returns {{ term: string, filters: Record<string, string|string[]> }}
 */
export function parseQuickSwitcherQuery(input) {
  const safe = String(input || '').trim();
  if (!safe) return { term: '', filters: {} };

  const filters = {};
  const termTokens = [];

  const addFilter = (key, value) => {
    const existing = filters[key];
    if (existing === undefined) filters[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else filters[key] = [existing, value];
  };

  for (const token of tokenize(safe)) {
    const match = token.match(/^(-?)([A-Za-z]+):(.+)$/);
    const operator = match?.[2]?.toLowerCase();
    if (match && SWITCHER_OPERATORS.includes(operator)) {
      addFilter(match[1] ? `-${operator}` : operator, unquote(match[3]));
    } else {
      termTokens.push(unquote(token));
    }
  }

  return { term: termTokens.join(' ').trim(), filters };
}

/** Folder of a note, i.e. everything before the file name. */
function folderOf(path) {
  const value = String(path || '');
  const cut = value.lastIndexOf('/');
  return cut === -1 ? '' : value.slice(0, cut);
}

function noteTags(item) {
  if (Array.isArray(item.tags)) return item.tags;
  const meta = item.metadata;
  if (meta && Array.isArray(meta.tags)) return meta.tags;
  return [];
}

function noteTitleOf(item) {
  return String(item.title ?? item.name ?? item.label ?? '');
}

function noteCategoryOf(item) {
  const meta = item.metadata;
  return String(meta?.category ?? item.category ?? '');
}

function noteCreatedOf(item) {
  const meta = item.metadata;
  return String(meta?.date ?? meta?.created ?? item.dateCreated ?? '');
}

function matchesValue(filter, values) {
  const list = (Array.isArray(filter) ? filter : [filter])
    .map((v) => String(v).toLowerCase())
    .filter(Boolean);
  if (!list.length) return true;
  const haystack = values.map((v) => String(v ?? '').toLowerCase());
  return list.some((needle) => haystack.some((value) => value === needle || value.includes(needle)));
}

/**
 * Does one item satisfy the parsed filters?
 *
 * @param {{ term: string, filters: Record<string, string|string[]> }} parsed
 * @param {{ name?: string, path?: string, title?: string, tags?: string[] }} item
 * @returns {boolean}
 */
export function matchesNoteFilters(parsed, item) {
  const filters = parsed?.filters || {};
  for (const [key, value] of Object.entries(filters)) {
    const negated = key.startsWith('-');
    const operator = negated ? key.slice(1) : key;
    const target = (Array.isArray(value) ? value : [value])
      .map((v) => String(v).toLowerCase())
      .filter(Boolean);
    if (!target.length) continue;

    let hit = false;
    switch (operator) {
      case 'tag':
        hit = matchesValue(value, noteTags(item));
        break;
      case 'path':
        hit = matchesValue(value, [item.path]);
        break;
      case 'folder':
        hit = matchesValue(value, [folderOf(item.path)]);
        break;
      case 'title':
      case 'note':
        hit = matchesValue(value, [noteTitleOf(item), item.name]);
        break;
      case 'category':
        hit = matchesValue(value, [noteCategoryOf(item)]);
        break;
      case 'created':
        // A date filter is a prefix match, so `created:2026-10` finds the month.
        hit = String(noteCreatedOf(item)).toLowerCase().startsWith(
          (Array.isArray(value) ? value[0] : String(value)).toLowerCase(),
        );
        break;
      default:
        hit = true;
    }

    if (hit === negated) return false;
  }
  return true;
}

/**
 * Rank notes against a parsed quick-switcher query. Notes that fail the inline
 * filters are dropped.
 *
 * @param {string} input raw query string (parsed internally)
 * @param {Array<{name: string, path: string, tags?: string[]}>} notes
 * @returns {Array<{item: any, score: number}>}
 */
export function rankQuickSwitcherResults(input, notes) {
  const parsed = parseQuickSwitcherQuery(input);
  const { term } = parsed;
  const items = Array.isArray(notes) ? notes : [];

  return items
    .map((item) => {
      if (!matchesNoteFilters(parsed, item)) return null;

      let score = 0;
      if (term) {
        const nameScore = fuzzyScore(term, noteTitleOf(item));
        const pathScore = fuzzyScore(term, item.path) * 0.5;
        score = Math.max(nameScore, pathScore);
        if (score === 0) return null;
      }

      return { item, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}
