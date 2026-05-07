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
