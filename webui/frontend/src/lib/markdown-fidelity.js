import { Extension } from '@tiptap/core';
import { defaultMarkdownSerializer } from 'prosemirror-markdown';

// The serializer behind the editor was written for round-trips through HTML, and it escapes whatever could
// possibly mean something: every `[`, every `~`, every `<`. A note written by hand or by another app carries
// those characters as plain text, so the next save turned `[^1]` into `\[^1\]`, `a < b` into `a &lt; b` and
// `~~x~~` into `\~\~x\~\~`. Here a character is escaped only where it would read back as something else.

const PUNCTUATION = /[!-/:-@[-`{-~]/;

// A definition (`[x]: https://…`) is the one place where a bracket at the start of a line is syntax.
const LINK_DEFINITION = /^\[[^\]]+\]:\s*\S+(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/;
const TASK_MARKER = /^\[[ xX]\](?:\s|$)/;

// `~`, `^` and `==` pair up into a subscript, a superscript and a highlight. A literal one is written with a
// backslash only when another of its kind could close it: `~5 minutes` and `a == b` stay as they are, `~x~` typed as text does not.
// The same text is read back as the marks otherwise, and a note must not change meaning on its way through the file.
function pairsAcrossWord(source, index, char) {
  for (const step of [-1, 1]) {
    for (let at = index + step; at >= 0 && at < source.length && !/\s/.test(source[at]); at += step) {
      if (source[at] === char) return true;
    }
  }
  return false;
}

function startsPairedEquals(source, index) {
  if (source[index] !== '=' || source[index + 1] !== '=' || source[index - 1] === '=') return false;
  let end = index;
  while (source[end] === '=') end += 1;
  return source.indexOf('==', end) >= 0 || source.lastIndexOf('==', index - 1) >= 0;
}

/**
 * Text as it is written into the file: backslashes, emphasis marks and brackets only where they would change
 * what the text reads as.
 *
 * @param {string} text
 * @param {{ startOfLine?: boolean, inTable?: boolean }} [where]
 */
export function escapeInline(text, { startOfLine = false, inTable = false } = {}) {
  const source = String(text ?? '');
  // `](` and `][` are what turns bracketed text into a link or an image, so brackets are escaped in such a text only.
  const linkLike = source.includes('](') || source.includes('][');
  let out = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const before = source[index - 1];
    const after = source[index + 1];
    const spaceBefore = before === undefined || /\s/.test(before);
    const spaceAfter = after === undefined || /\s/.test(after);
    if (char === '\\') {
      out += after === undefined || PUNCTUATION.test(after) ? '\\\\' : char;
    } else if (char === '`') {
      out += '\\`';
    } else if (char === '*') {
      // A lone star between spaces opens no emphasis; at the edge of the text the neighbour is unknown.
      out += before !== undefined && after !== undefined && spaceBefore && spaceAfter ? char : '\\*';
    } else if (char === '_') {
      const intraword = before !== undefined && after !== undefined && /\w/.test(before) && /\w/.test(after);
      const alone = before !== undefined && after !== undefined && spaceBefore && spaceAfter;
      out += intraword || alone ? char : '\\_';
    } else if (char === '~') {
      out += before === '~' || after === '~' || pairsAcrossWord(source, index, '~') ? '\\~' : char;
    } else if (char === '^') {
      out += pairsAcrossWord(source, index, '^') ? '\\^' : char;
    } else if (char === '=') {
      out += startsPairedEquals(source, index) ? '\\=' : char;
    } else if (char === '[' || char === ']') {
      out += linkLike ? `\\${char}` : char;
    } else if (char === '&') {
      out += /^&#?\w+;/.test(source.slice(index)) ? '&amp;' : char;
    } else if (char === '|' && inTable) {
      out += '\\|';
    } else {
      out += char;
    }
  }
  if (startOfLine) {
    out = out
      .replace(/^(\+[ ]|[-*>])/, '\\$&')
      .replace(/^(\s*)(#{1,6})(\s|$)/, '$1\\$2$3')
      .replace(/^(\s*\d+)([.)])(\s|$)/, '$1\\$2$3')
      .replace(/^(=+|-+)\s*$/, '\\$&');
    if (TASK_MARKER.test(out)) out = `\\${out}`;
    else if (LINK_DEFINITION.test(out)) out = `\\${out}`;
  }
  return out;
}

function atLineStart(state) {
  return Boolean(state.atBlockStart) || /(^|\n)$/.test(state.out);
}

export function serializeText(state, node) {
  state.text(escapeInline(node.text, { startOfLine: atLineStart(state), inTable: state.inTable }), false);
}

function adjacentLists(node, parent, index) {
  let count = 0;
  while (index - count > 0 && parent.child(index - count - 1).type.name === node.type.name) count += 1;
  return count;
}

export function serializeOrderedList(state, node, parent, index) {
  const start = node.attrs.start ?? 1;
  const widest = String(start + node.childCount - 1).length;
  const space = state.repeat(' ', widest + 2);
  // The marker the note was written with. Two lists in a row alternate it, as before: that is what keeps them two lists.
  let paren = node.attrs.delimiter === ')';
  if (adjacentLists(node, parent, index) % 2) paren = !paren;
  const separator = paren ? ') ' : '. ';
  state.renderList(node, space, (i) => {
    const number = String(start + i);
    return state.repeat(' ', widest - number.length) + number + separator;
  });
}

export function serializeBulletList(state, node) {
  // A bullet or task run cut from a mixed list goes on in the same list: no blank line, no second list.
  if (node.attrs.continues && state.closed && LIST_NODES.has(state.closed.type.name)) {
    state.flushClose(state.closed.attrs.tight === false ? 2 : 1);
  }
  return state.renderList(node, '  ', () => `${node.attrs.marker || '-'} `);
}

const LIST_NODES = new Set(['bulletList', 'taskList']);

/** Whether this node is the rest of the mixed list that the node before it began (see markdown-editor-content.js). */
export function continuesList(node, previous) {
  return Boolean(node?.attrs?.continues && previous && LIST_NODES.has(previous.type.name) && LIST_NODES.has(node.type.name));
}

const ALIGN_ROW = { left: ':---', center: ':---:', right: '---:' };

// The stock table writer puts `---` under every column, so a column set to `:---:` or `---:` lost it as soon as
// the table was edited. The alignment is kept on the header cells and written back under them.
export function serializeTable(state, node, parent, index, stock) {
  const header = node.firstChild;
  const aligns = [];
  header?.forEach((cell) => aligns.push(cell.attrs.align || null));
  const start = state.out.length;
  stock(state, node, parent, index);
  if (!aligns.some(Boolean)) return;
  const written = state.out.slice(start).split('\n');
  const first = written.findIndex((line) => line.startsWith('| '));
  if (first < 0 || !/^\| --- (\| --- )*\|$|^\| --- \|$/.test(written[first + 1] || '')) return;
  written[first + 1] = `| ${aligns.map((align) => ALIGN_ROW[align] || '---').join(' | ')} |`;
  state.out = state.out.slice(0, start) + written.join('\n');
}

// A fence is longer than any run of backticks inside it, or the first run in the code would end the block.
export function serializeCodeBlock(state, node) {
  const longest = Math.max(0, ...(node.textContent.match(/`+/g) || []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  state.write(`${fence}${node.attrs.language || ''}\n`);
  state.text(node.textContent, false);
  state.ensureNewLine();
  state.write(fence);
  state.closeBlock(node);
}

// `![[picture.png]]` stays that way when the paragraph around it is edited.
export function serializeImage(state, node, parent, index) {
  if (node.attrs.wiki && /^_attachments\//.test(node.attrs.src || '')) {
    state.write(`![[${node.attrs.src.replace(/^_attachments\//, '')}]]`);
    return;
  }
  defaultMarkdownSerializer.nodes.image(state, node, parent, index);
}

const overrides = {
  text: serializeText,
  orderedList: serializeOrderedList,
  bulletList: serializeBulletList,
  taskList: serializeBulletList,
  codeBlock: serializeCodeBlock,
};

/**
 * What the list nodes need to remember about the file they came from: the first number and the `)` of an
 * ordered list, the bullet character, and whether a task list is tight (the stock task list had no such
 * attribute, so every checklist was written loose, with a blank line between its items).
 */
export const MarkdownFidelity = Extension.create({
  name: 'markdownFidelity',
  // After the markdown extension (50), which creates the serializer in its own onBeforeCreate; this one patches it.
  priority: 10,

  addGlobalAttributes() {
    return [
      { types: ['orderedList'], attributes: { delimiter: { default: '.', rendered: false } } },
      { types: ['bulletList', 'taskList'], attributes: { marker: { default: '-', rendered: false } } },
      // Set on the second and later pieces of a list that mixed bullets and tasks, so that it is written as one list.
      { types: ['bulletList', 'taskList'], attributes: { continues: { default: false, rendered: false } } },
      {
        types: ['tableHeader', 'tableCell'],
        attributes: {
          align: {
            default: null,
            parseHTML: (element) => element.style?.textAlign || null,
            renderHTML: (attributes) => (attributes.align ? { style: `text-align: ${attributes.align}` } : {}),
          },
        },
      },
      { types: ['taskList'], attributes: { tight: { default: true, rendered: false } } },
    ];
  },

  onBeforeCreate() {
    const serializer = this.editor.storage.markdown?.serializer;
    if (!serializer) return;
    // The serializer builds its table of node writers on every call, from the extensions; ours go over the top.
    const stock = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(serializer), 'nodes')?.get;
    if (!stock) return;
    Object.defineProperty(serializer, 'nodes', {
      configurable: true,
      get() {
        const nodes = stock.call(this);
        const stockTable = nodes.table;
        return {
          ...nodes,
          ...overrides,
          table: stockTable && ((state, node, parent, index) => serializeTable(state, node, parent, index, stockTable)),
        };
      },
    });
  },
});
