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

export function replaceTabs(markdown, setting) {
  const width = Number(normalizeTabsSetting(setting));
  const text = String(markdown ?? '');
  if (!width || !text.includes('\t')) return text;
  let fence = '';
  return text.split('\n').map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker[0];
      else if (marker[0] === fence) fence = '';
      return line;
    }
    if (fence || !line.includes('\t')) return line;
    let column = 0;
    let out = '';
    for (const char of line) {
      if (char === '\t') {
        const spaces = width - (column % width);
        out += ' '.repeat(spaces);
        column += spaces;
      } else {
        out += char;
        column += 1;
      }
    }
    return out;
  }).join('\n');
}
