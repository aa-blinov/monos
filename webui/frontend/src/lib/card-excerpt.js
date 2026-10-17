/**
 * The text a note card shows: the note's sentences without the Markdown that makes them.
 *
 * Code, tables' rules, task boxes, callout markers and frontmatter are left out. After a heading, a list
 * item or a table row the next line follows a comma (a colon after a heading), so a list reads "milk, bread,
 * coffee" instead of running together; after a sentence it follows a space. No separator is a dot.
 */
// A line that closed itself with punctuation needs no separator; one that only ends in a quote or bracket does.
const CLOSED = /[.!?…:;]$/;
const WRAPPED = /[»"”)]$/;

export function cardExcerpt(markdown, maxLength = 240) {
  const text = String(markdown || '')
    .replace(/\r\n?/g, '\n')
    .replace(/^---\n[\s\S]*?\n---(?:\n|$)/, '')
    .replace(/&nbsp;/g, ' ');

  const lines = [];
  let fence = null;
  for (const raw of text.split('\n')) {
    const fenceMark = raw.match(/^[ \t]*(`{3,}|~{3,})/);
    if (fence) {
      if (fenceMark && fenceMark[1][0] === fence[0] && fenceMark[1].length >= fence.length) fence = null;
      continue;
    }
    if (fenceMark) {
      fence = fenceMark[1];
      continue;
    }
    // A table's rule row carries no words.
    if (/^[ \t]*\|?[ \t]*:?-{2,}:?(?:[ \t]*\|[ \t]*:?-{2,}:?)*[ \t]*\|?[ \t]*$/.test(raw)) continue;
    const unquoted = raw.replace(/^[ \t]*>[ \t]?/, '');
    const isHeading = /^[ \t]*#{1,6}[ \t]/.test(unquoted);
    const isBlock = isHeading || /^\[![\w-]+\]|^[ \t]*(?:[-*+]|\d+[.)])[ \t]|\|/.test(unquoted);
    const line = unquoted
      .replace(/^\[![\w-]+\][+-]?[ \t]*/, '')
      .replace(/^[ \t]*#{1,6}[ \t]+/, '')
      .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]*)?/, '')
      .replace(/!\[\[[^\]]*\]\]/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, target, alias) => (alias || target).trim())
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/(?<![\w*])[*_]([^*_\n]+)[*_](?![\w*])/g, '$1')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\$\$?([^$]+)\$\$?/g, '$1')
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|').map((cell) => cell.trim()).filter(Boolean).join(' – ')
      .replace(/\s+/g, ' ')
      .trim();
    if (line && !/^last opened:/i.test(line)) lines.push({ line, isBlock, isHeading });
  }

  let out = '';
  let previous = null;
  for (const entry of lines) {
    const { line } = entry;
    if (!out) out = line;
    else {
      let glue;
      if (!previous.isBlock) glue = CLOSED.test(out) || WRAPPED.test(out) ? ' ' : ', ';
      else if (CLOSED.test(out)) glue = ' ';
      else glue = previous.isHeading ? ': ' : ', ';
      out += glue + line;
    }
    previous = entry;
    if (out.length > maxLength) break;
  }
  return out.length > maxLength ? `${out.slice(0, maxLength - 1).trimEnd()}…` : out;
}
