/**
 * Tabs to spaces.
 *
 * A tab is drawn as a different number of columns in every viewer, so a list indented with tabs looks nested in one
 * place and flat in another. With the setting on, a note is saved with spaces: each tab becomes the spaces that
 * reach the next tab stop (2 or 4 columns). Fenced code stays as written: a Makefile needs its tabs.
 */
import { persisted } from './stores/persisted.js';

export const TAB_WIDTHS = ['off', '2', '4'];

export function normalizeTabsSetting(value) {
  return TAB_WIDTHS.includes(String(value)) ? String(value) : 'off';
}

/** The saved choice: 'off' | '2' | '4'. */
export const tabsToSpaces = persisted('tabsToSpaces', 'off', { deserialize: normalizeTabsSetting });

const ORDERED_ITEM = /^\s*\d+[.)]\s/;

/** Spaces in place of the tabs in one line, up to the next tab stop; inline code spans are left alone. */
function expandLine(line, width) {
  let column = 0;
  let out = '';
  let codeTicks = 0;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '`') {
      let run = 1;
      while (line[i + run] === '`') run += 1;
      if (codeTicks === 0) codeTicks = run;
      else if (codeTicks === run) codeTicks = 0;
      out += line.slice(i, i + run);
      column += run;
      i += run - 1;
    } else if (char === '\t' && codeTicks === 0) {
      const spaces = width - (column % width);
      out += ' '.repeat(spaces);
      column += spaces;
    } else {
      out += char;
      column += 1;
    }
  }
  return out;
}

export function replaceTabs(markdown, setting) {
  const width = Number(normalizeTabsSetting(setting));
  const text = String(markdown ?? '');
  if (!width || !text.includes('\t')) return text;
  const lines = text.split('\n');
  const out = [];
  let fence = null; // { char, length } of the open fenced block
  let inPre = false;
  for (const line of lines) {
    const open = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      // A fence closes on the same character, at least as long, with nothing after it.
      if (open && open[1][0] === fence.char && open[1].length >= fence.length && open[2].trim() === '') fence = null;
      out.push(line);
      continue;
    }
    if (open) {
      fence = { char: open[1][0], length: open[1].length };
      out.push(line);
      continue;
    }
    if (inPre || /<pre[\s>]/i.test(line)) {
      inPre = !/<\/pre>/i.test(line);
      out.push(line);
      continue;
    }
    if (!line.includes('\t')) {
      out.push(line);
      continue;
    }
    // Under an ordered item (`1. `) a nested line needs three columns at least, so two spaces would flatten it.
    let lineWidth = width;
    if (width < 4 && /^\t/.test(line)) {
      for (let back = out.length - 1; back >= 0; back -= 1) {
        if (out[back].trim() === '') continue;
        if (ORDERED_ITEM.test(out[back])) lineWidth = 4;
        break;
      }
    }
    out.push(expandLine(line, lineWidth));
  }
  return out.join('\n');
}
