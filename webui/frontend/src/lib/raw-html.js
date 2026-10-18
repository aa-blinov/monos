/**
 * Does the note hold raw HTML (a tag or a comment) outside code?
 *
 * The visual editor keeps text, not markup: a `<div>` or a `<!-- comment -->` becomes plain text there and is saved
 * as `&lt;div&gt;`, which changes the file. A note that has any is opened as source text, where nothing is rewritten.
 * Code fences, inline code and the front matter do not count; an autolink (`<https://example.com>`) is not HTML.
 */
const TAG = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/;
const COMMENT = /<!--/;

export function hasRawHtml(markdown) {
  let text = String(markdown ?? '');
  text = text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  text = text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '');
  text = text.replace(/`[^`\n]*`/g, '');
  return TAG.test(text) || COMMENT.test(text);
}
