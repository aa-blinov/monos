/**
 * The text a note card shows: the note's sentences without the Markdown that makes them.
 *
 * Code, tables' rules, task boxes, callout markers and frontmatter are left out. After a heading, a list
 * item or a table row the next line follows " · ", so a list reads "milk · bread · coffee" instead of
 * running together; after a sentence of running text it follows a space.
 */
const SENTENCE_END = /[.!?:;…»"”)]$/;

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
    const isBlock = /^\[![\w-]+\]|^[ \t]*#{1,6}[ \t]|^[ \t]*(?:[-*+]|\d+[.)])[ \t]|\|/.test(unquoted);
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
    if (line && !/^last opened:/i.test(line)) lines.push({ line, isBlock });
  }

  let out = '';
  let previousIsBlock = false;
  for (const { line, isBlock } of lines) {
    if (!out) out = line;
    else out += (!previousIsBlock && SENTENCE_END.test(out) ? ' ' : ' · ') + line;
    previousIsBlock = isBlock;
    if (out.length > maxLength) break;
  }
  return out.length > maxLength ? `${out.slice(0, maxLength - 1).trimEnd()}…` : out;
}
