// A text event that carries Markdown syntax and more than one character did not come
// from typing a key: it is dictation, an IME commit, or a tool that inserts a line at
// once. Input rules only fire on the keystroke that completes a marker, so such a burst
// would keep its syntax as literal text. The editor parses it instead, the way paste does.
const BLOCK_MARKER = /(^|\n)[ \t]{0,3}(#{1,6}[ \t]|[-*+][ \t]|>[ \t]|```|~~~)/;
// `1.` at a line start is a list only in a multi-line burst: "2024. Report" alone is text.
const ORDERED_MARKER = /(^|\n)[ \t]{0,3}\d{1,9}[.)][ \t]/;
const INLINE_MARKER = /\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)/;

/**
 * @param {string} text the text a single input event is about to insert
 * @returns {boolean} true when the text carries Markdown that should be parsed
 */
export function isMarkdownBurst(text) {
  const value = String(text || '');
  if (value.length < 2) return false;
  if (BLOCK_MARKER.test(value) || INLINE_MARKER.test(value)) return true;
  return value.includes('\n') && ORDERED_MARKER.test(value);
}
