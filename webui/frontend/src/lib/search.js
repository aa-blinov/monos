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

export function getSearchTerms(query) {
  return Array.from(new Set(
    String(query || '')
      .replace(/^#/, '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
  )).sort((a, b) => b.length - a.length);
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
