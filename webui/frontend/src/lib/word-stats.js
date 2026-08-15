/**
 * Compute reading-time-relevant statistics for a piece of text.
 *
 * Returns the number of words, the number of characters with and without
 * spaces, and the estimated reading time in minutes. Reading speed is
 * assumed to be 200 wpm (the standard for English technical prose). For
 * fewer than 200 words the function rounds up to 1 minute so the UI never
 * shows a "0 min read" badge.
 *
 * @param {string} text raw text (markdown or plain)
 * @returns {{ words: number, chars: number, charsNoSpaces: number, readingMinutes: number }}
 */
const WORDS_PER_MINUTE = 200;

export function wordStats(text) {
  const safe = String(text || '');
  const words = safe.trim() ? safe.trim().split(/\s+/).length : 0;
  const chars = safe.length;
  const charsNoSpaces = safe.replace(/\s+/g, '').length;
  const readingMinutes = words === 0
    ? 0
    : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
  return { words, chars, charsNoSpaces, readingMinutes };
}

/**
 * Human-readable reading-time label.
 *
 * - 0 minutes → "< 1 min"
 * - 1+ minutes → "{N} min read"
 *
 * @param {number} minutes
 * @returns {string}
 */
export function formatReadingTime(minutes) {
  if (!minutes || minutes < 1) return '< 1 min';
  return `${Math.round(minutes)} min read`;
}
