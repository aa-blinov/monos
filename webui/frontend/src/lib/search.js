export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Words the user actually typed, with search operators removed.
 *
 * Highlighting must look for `квартальные`, not for `body:квартальные`: the
 * operator is a filter instruction, and it never appears in the note text.
 */
export function getSearchTerms(query) {
  const stripped = String(query || '')
    .replace(/^#/, '')
    // `updated:` filters by date: neither it nor its value is in the text.
    .replace(/(^|\s)-?updated:(?:"[^"]*"|\S*)/g, ' ')
    // `body:` only names the field — the words after it are still content.
    .replace(/(^|\s)-?body:(?:"([^"]*)"|)/g, (match, lead, phrase) => (phrase ? ` ${phrase}` : ' '))
    // `path:` and `tag:` filter on metadata; their values never occur in the
    // note text, so highlighting them would look for a word that isn't there.
    .replace(/(^|\s)-?path:(?:"[^"]*"|\S*)/g, ' ')
    .replace(/(^|\s)-?tag:(?:"[^"]*"|\S*)/g, ' ')
    .replace(/"/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const wordTerms = stripped.split(/\s+/).filter(Boolean);
  const uniqueWords = Array.from(new Set(wordTerms));
  if (uniqueWords.length === 0) return [];
  const phrase = uniqueWords.join(' ');
  const terms = uniqueWords.length > 1 && phrase !== stripped ? uniqueWords : [phrase, ...uniqueWords];
  return Array.from(new Set(terms)).sort((a, b) => b.length - a.length);
}

export function highlightExcerpt(excerpt, query) {
  const safeExcerpt = escapeHtml(excerpt || '');
  const terms = getSearchTerms(query);

  if (terms.length === 0) return safeExcerpt;

  const pattern = terms.map(escapeRegExp).join('|');
  const re = new RegExp(`(${pattern})`, 'gi');

  return safeExcerpt.replace(
    re,
    '<mark class="rounded-ui bg-[var(--text-primary)] text-[var(--bg-primary)] px-0.5">$1</mark>'
  );
}

/**
 * The part of an excerpt to show on a result card: it starts a few words before the first match, so the
 * match is in view even when the card shows a single line, and it is at most `maxLength` long.
 */
export function searchSnippet(excerpt, query, maxLength = 120) {
  const text = String(excerpt || '').replace(/\s+/g, ' ').trim();
  const terms = getSearchTerms(query);
  if (!text || terms.length === 0) return text;

  const lowerText = text.toLowerCase();
  const matchIndex = terms
    .map((term) => lowerText.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (matchIndex === undefined) return text.length <= maxLength ? text : text.slice(0, maxLength - 1).trimEnd() + '…';

  // About one word of context: enough to read the match in its sentence, little enough that a
  // one-line card still shows it.
  const LEAD = 8;
  let start = 0;
  if (matchIndex > LEAD) {
    const from = matchIndex - LEAD;
    const space = text.indexOf(' ', from);
    start = space !== -1 && space < matchIndex ? space + 1 : from;
  }
  let end = Math.min(text.length, start + maxLength);
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > matchIndex) end = space;
  }

  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}
