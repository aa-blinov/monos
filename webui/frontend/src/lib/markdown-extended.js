/**
 * Extended Markdown that the CommonMark parser leaves as plain text: `==highlight==`, `H~2~O`, `x^2^` and
 * footnotes (`[^1]` and `[^1]: text`). They are markdown-it plugins, so the editor's parser and the block splitter in
 * `note-source.js` see the same blocks. Written here instead of pulling in `markdown-it-mark`, `-sub`, `-sup` and
 * `-footnote`: the four are a few dozen lines each in spirit, and the desktop build ships every dependency.
 */

const isSpace = (char) => char === undefined || /\s/.test(char);

/**
 * A pair of the same marker around some text. `spaces: false` is the subscript and superscript rule (no whitespace
 * between the markers, which is what keeps `~5 minutes` and `2^10 and 3^4` as prose). The closing marker is looked
 * for with `skipToken`, so one inside a code span or behind a backslash does not close anything.
 */
function pairedMark({ name, tag, marker, spaces }) {
  const length = marker.length;
  const first = marker[0];
  return (state, silent) => {
    const { src, pos } = state;
    if (src.slice(pos, pos + length) !== marker) return false;
    // `==` is not the start of `===`, `~` is not half of the `~~` of a strikethrough.
    if (src[pos - 1] === first || src[pos + length] === first || isSpace(src[pos + length])) return false;

    const resume = state.pos;
    let close = -1;
    state.pos = pos + length;
    while (state.pos < state.posMax) {
      const at = state.pos;
      if (src.slice(at, at + length) === marker && !isSpace(src[at - 1]) && src[at + length] !== first) {
        close = at;
        break;
      }
      state.md.inline.skipToken(state);
    }
    state.pos = resume;
    // The text rule skips a whole run of words at once, so the whitespace is looked for in the source, not per token.
    if (close < 0 || (!spaces && /\s/.test(src.slice(pos + length, close)))) return false;

    if (!silent) {
      const open = state.push(`${name}_open`, tag, 1);
      open.markup = marker;
      const max = state.posMax;
      state.pos = pos + length;
      state.posMax = close;
      state.md.inline.tokenize(state);
      state.posMax = max;
      const end = state.push(`${name}_close`, tag, -1);
      end.markup = marker;
    }
    state.pos = close + length;
    return true;
  };
}

export const markPlugin = (md) => md.inline.ruler.after('strikethrough', 'mark', pairedMark({ name: 'mark', tag: 'mark', marker: '==', spaces: true }));
export const subPlugin = (md) => md.inline.ruler.after('strikethrough', 'sub', pairedMark({ name: 'sub', tag: 'sub', marker: '~', spaces: false }));
export const supPlugin = (md) => md.inline.ruler.after('strikethrough', 'sup', pairedMark({ name: 'sup', tag: 'sup', marker: '^', spaces: false }));

/** The three paired marks. `markdown-it` calls a plugin with the instance, so `md.use(inlineMarksPlugin)` installs them. */
export function inlineMarksPlugin(md) {
  markPlugin(md);
  subPlugin(md);
  supPlugin(md);
}

const FOOTNOTE_LABEL = '[^\\]\\s\\[]{1,64}';
const FOOTNOTE_REF = new RegExp(`^\\[\\^(${FOOTNOTE_LABEL})\\]`);
const FOOTNOTE_DEF = new RegExp(`^\\[\\^(${FOOTNOTE_LABEL})\\]:[ \\t]?`);

function footnoteRefRule(state, silent) {
  const { src, pos } = state;
  if (src[pos] !== '[' || src[pos + 1] !== '^') return false;
  const match = FOOTNOTE_REF.exec(src.slice(pos, pos + 80));
  if (!match) return false;
  // `[^1](url)` is a link whose text starts with a caret, not a footnote.
  if (src[pos + match[0].length] === '(') return false;
  if (!silent) state.push('footnote_ref', 'sup', 0).meta = { label: match[1] };
  state.pos = pos + match[0].length;
  return true;
}

// A definition is a block of its own, even when it is only a URL: `[^1]: https://x.org` would otherwise be taken for
// a link reference and vanish from the document (and `[^1]` in the text would turn into a link).
function footnoteDefinitionRule(state, startLine, endLine, silent) {
  // Top level only: inside a list item or a quote the block would not fit the editor's schema.
  if (state.level !== 0 || state.blkIndent !== 0) return false;
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const match = FOOTNOTE_DEF.exec(state.src.slice(start, state.eMarks[startLine]));
  if (!match) return false;
  if (silent) return true;

  const terminators = state.md.block.ruler.getRules('paragraph');
  let nextLine = startLine + 1;
  for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine += 1) {
    if (state.sCount[nextLine] - state.blkIndent > 3 || state.sCount[nextLine] < 0) continue;
    const at = state.bMarks[nextLine] + state.tShift[nextLine];
    if (FOOTNOTE_DEF.test(state.src.slice(at, state.eMarks[nextLine]))) break;
    if (terminators.some((rule) => rule(state, nextLine, endLine, true))) break;
  }

  const content = state.getLines(startLine, nextLine, state.blkIndent, false).trim().replace(FOOTNOTE_DEF, '');
  const parentType = state.parentType;
  state.parentType = 'paragraph';
  const open = state.push('footnote_def_open', 'p', 1);
  open.meta = { label: match[1] };
  open.map = [startLine, nextLine];
  open.markup = `[^${match[1]}]:`;
  const inline = state.push('inline', '', 0);
  inline.content = content;
  inline.map = [startLine, nextLine];
  inline.children = [];
  state.push('footnote_def_close', 'p', -1);
  state.parentType = parentType;
  state.line = nextLine;
  return true;
}

/** `[^label]` in text and `[^label]: text` as a block. A reference with no definition is demoted afterwards (see `markdown-editor-content.js`). */
export function footnotesPlugin(md) {
  md.inline.ruler.before('link', 'footnote_ref', footnoteRefRule);
  md.block.ruler.before('reference', 'footnote_def', footnoteDefinitionRule);
}

/** Everything above, for the parser that reads a note. */
export function extendedMarkdownPlugin(md) {
  md.use(inlineMarksPlugin).use(footnotesPlugin);
}
