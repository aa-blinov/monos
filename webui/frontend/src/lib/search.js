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
    '<mark class="bg-[var(--text-primary)] text-[var(--bg-primary)] px-0.5">$1</mark>'
  );
}

export function searchSnippet(excerpt, query, maxLength = 120) {
  const text = String(excerpt || '').replace(/\s+/g, ' ').trim();
  const terms = getSearchTerms(query);
  if (!text || terms.length === 0 || text.length <= maxLength) return text;

  const lowerText = text.toLowerCase();
  const matchIndex = terms
    .map((term) => lowerText.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (matchIndex === undefined) return text.slice(0, maxLength - 1).trimEnd() + '…';

  const contextBefore = Math.max(16, Math.floor(maxLength * 0.35));
  let start = Math.max(0, matchIndex - contextBefore);
  let end = Math.min(text.length, start + maxLength);

  if (end - start < maxLength) start = Math.max(0, end - maxLength);
  if (start > 0) start = text.indexOf(' ', start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(' ', end) > start ? text.lastIndexOf(' ', end) : end;

  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}
