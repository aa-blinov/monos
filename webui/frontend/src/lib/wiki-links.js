const WIKI_LINK_PATTERN = /^\[\[([^\]\n]+)\]\]$/;
const WIKI_LINK_GLOBAL = /\[\[([^\]\n]+)\]\]/g;

/**
 * Parse a single wiki-link `[[Target]]` or `[[Target|Alias]]` into parts.
 * Returns `null` for any non-matching input.
 *
 * @param {string} input
 * @returns {{ target: string, alias: string|null } | null}
 */
export function parseWikiLink(input) {
  if (typeof input !== 'string') return null;
  const match = WIKI_LINK_PATTERN.exec(input);
  if (!match) return null;

  const inner = match[1].trim();
  if (!inner) return null;

  const pipeIndex = inner.indexOf('|');
  if (pipeIndex === -1) {
    return { target: inner.trim(), alias: null };
  }

  const target = inner.slice(0, pipeIndex).trim();
  const alias = inner.slice(pipeIndex + 1).trim();
  if (!target) return null;
  return { target, alias: alias || null };
}

/**
 * Build a wiki-link string from a target and optional alias.
 *
 * @param {string} target
 * @param {string|null|undefined} [alias]
 * @returns {string}
 */
export function formatWikiLink(target, alias) {
  if (alias) return `[[${target}|${alias}]]`;
  return `[[${target}]]`;
}

/**
 * Find all wiki-links in a piece of text. Invalid links (empty target,
 * unclosed brackets) are skipped. Duplicates are preserved in order
 * of appearance, but identical target+alias pairs are deduped.
 *
 * @param {string} text
 * @returns {Array<{ target: string, alias: string|null }>}
 */
export function findWikiLinks(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const results = [];
  const seen = new Set();
  for (const match of text.matchAll(WIKI_LINK_GLOBAL)) {
    const inner = match[1].trim();
    if (!inner) continue;
    const pipeIndex = inner.indexOf('|');
    const target = pipeIndex === -1 ? inner : inner.slice(0, pipeIndex);
    const alias = pipeIndex === -1 ? null : inner.slice(pipeIndex + 1);
    if (!target.trim()) continue;
    const normalizedTarget = target.trim();
    const normalizedAlias = alias ? alias.trim() : null;
    if (!normalizedTarget) continue;
    const key = `${normalizedTarget}\u0000${normalizedAlias || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ target: normalizedTarget, alias: normalizedAlias });
  }
  return results;
}

// `\u0001` stands for text a link cannot cross: inline code, an image, a formula. A `!` before the
// brackets makes an embed, which is drawn as a block of its own and is not a link.
const WIKI_LINK_SPAN = /(!?)\[\[([^[\]\n\u0001]+)\]\]/g;

/**
 * Every wiki link in a line of text with its place: `start` is the first `[`, `end` is just past
 * the last `]`. Embeds (`![[…]]`) and links with an empty target are left out.
 *
 * @param {string} text
 * @returns {Array<{ start: number, end: number, target: string, alias: string|null }>}
 */
export function wikiLinkSpans(text) {
  if (typeof text !== 'string' || !text.includes('[[')) return [];
  const spans = [];
  for (const match of text.matchAll(WIKI_LINK_SPAN)) {
    if (match[1]) continue;
    const inner = match[2];
    const pipe = inner.indexOf('|');
    const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    if (!target) continue;
    const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim() || null;
    const start = match.index + match[1].length;
    spans.push({ start, end: match.index + match[0].length, target, alias });
  }
  return spans;
}

/**
 * Where a new note for a link that leads nowhere goes: `[[Projects/Plan#Steps]]` makes the note
 * `Plan` in the folder `Projects`. A `#` that follows a space belongs to the name (`Issue #42`);
 * one glued to a word starts a heading.
 *
 * @param {string} target
 * @returns {{ title: string, category: string }}
 */
export function newNoteForWikiLink(target) {
  let name = String(target || '').trim();
  const heading = name.match(/^(.*?\S)#(.+)$/);
  if (heading) name = heading[1];
  const slash = name.lastIndexOf('/');
  const title = (slash === -1 ? name : name.slice(slash + 1)).trim();
  const category = slash === -1 ? '' : name.slice(0, slash).split('/').map((part) => part.trim()).filter(Boolean).join('/');
  return { title, category };
}
