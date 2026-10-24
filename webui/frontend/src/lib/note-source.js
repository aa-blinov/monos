import { defaultMarkdownParser } from 'prosemirror-markdown';
import { extendedMarkdownPlugin } from './markdown-extended.js';

// The file is the product: a note must not be rewritten behind the person's back. The editor holds a
// document, and writing that document out again re-spells everything it had to normalise (`*` for `-`,
// `~~~` fences, `5.` lists, footnotes, `![[embed.png]]`). So the text of every top-level block is kept as
// it was read, and a block that is still the very block that was read is written back as that text.
// Only a block the person touched is written by the serializer.

const MarkdownIt = defaultMarkdownParser.tokenizer.constructor;
const splitter = new MarkdownIt('commonmark', { html: false }).enable(['table', 'strikethrough']).use(extendedMarkdownPlugin);

// Which editor nodes a block of source may turn into. A block that turned into something else means the
// two lists did not line up, and nothing is passed through.
const COMPATIBLE = {
  paragraph_open: ['paragraph', 'mathBlock', 'noteEmbed', 'pdfEmbed', 'image'],
  footnote_def_open: ['footnoteDefinition'],
  heading_open: ['heading'],
  fence: ['codeBlock', 'mermaidBlock'],
  code_block: ['codeBlock'],
  hr: ['horizontalRule'],
  bullet_list_open: ['bulletList', 'taskList'],
  ordered_list_open: ['orderedList'],
  blockquote_open: ['blockquote'],
  table_open: ['table'],
  html_block: ['paragraph'],
};

/**
 * Cut a Markdown text into its top-level blocks without losing a character: `lead`, then each block's text and
 * the gap that followed it, then `tail`, put together give the text back.
 *
 * @param {string} markdown
 * @returns {{ eol: string, lead: string, tail: string, blocks: Array<{ text: string, gap: string, kind: string }> }}
 */
export function splitSource(markdown) {
  const raw = String(markdown ?? '');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const text = raw.replace(/\r\n/g, '\n');
  const lineStart = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') lineStart.push(index + 1);
  }
  const startOf = (line) => (line < lineStart.length ? lineStart[line] : text.length + 1);

  const tops = splitter.parse(text, {}).filter((token) => token.level === 0 && token.map);
  const blocks = tops.map((token, index) => {
    const [from, to] = token.map;
    const start = startOf(from);
    const end = Math.min(startOf(to) - 1, text.length);
    const isLast = index + 1 >= tops.length;
    const gap = isLast ? '' : text.slice(end, startOf(tops[index + 1].map[0]));
    return { text: text.slice(start, end), gap, kind: token.type, start, end };
  });
  const lead = blocks.length ? text.slice(0, blocks[0].start) : text;
  const last = blocks[blocks.length - 1];
  const tail = last ? text.slice(last.end) : '';
  return { eol, lead, tail, blocks: blocks.map(({ text: body, gap, kind }) => ({ text: body, gap, kind })) };
}

/**
 * Remember which top-level node came from which block of the text. Returns null when that cannot be told
 * with certainty (the document was built from the text with some blocks split or merged): the note is then
 * written entirely by the serializer, as before.
 *
 * @param {string} markdown the text the document was built from
 * @param {Array<{ type: { name: string }, eq: Function, toJSON: Function }>} nodes the document's top-level nodes
 * @param {{ countNodes: (blockText: string) => number }} options how many nodes one block of text becomes
 */
export function buildSourceMap(markdown, nodes, { countNodes } = {}) {
  const { eol, lead, tail, blocks } = splitSource(markdown);
  if (!blocks.length || !nodes.length) return null;

  // For each block: the nodes it became. One is the usual case; a paragraph with a note embedded in a sentence, or a
  // list that mixes bullets and tasks, becomes several, and passes through only while all of them are still there.
  const spans = [];
  if (blocks.length === nodes.length) {
    blocks.forEach((_, index) => spans.push([index, 1]));
  } else if (typeof countNodes === 'function') {
    let at = 0;
    for (const block of blocks) {
      const count = countNodes(block.text);
      spans.push([at, count]);
      at += count;
    }
    if (at !== nodes.length) return null;
  } else {
    return null;
  }

  const byNode = new WeakMap();
  const originals = new Array(blocks.length).fill(null);
  const groups = new WeakMap(); // first node of a multi-node block -> { index, nodes }
  const groupList = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const [at, count] = spans[index];
    if (count === 0) continue;
    const allowed = COMPATIBLE[blocks[index].kind];
    const members = nodes.slice(at, at + count);
    if (allowed && !members.every((node) => allowed.includes(node.type.name) || count > 1)) return null;
    if (count === 1) {
      byNode.set(members[0], index);
      originals[index] = members[0];
    } else {
      const group = { index, nodes: members };
      groups.set(members[0], group);
      groupList.push(group);
    }
  }
  return { eol, lead, tail, blocks, byNode, groups, groupList, groupStarts: null, originals, count: nodes.length, structural: null };
}

function structuralIndex(map, node) {
  if (!map.structural) {
    map.structural = new Map();
    map.originals.forEach((original, index) => {
      if (!original) return;
      const key = JSON.stringify(original.toJSON());
      if (!map.structural.has(key)) map.structural.set(key, index);
    });
  }
  const found = map.structural.get(JSON.stringify(node.toJSON()));
  return found === undefined ? -1 : found;
}

// The multi-node block that starts with this node: the same node object, or one exactly like it.
function groupFor(map, node) {
  const direct = map.groups.get(node);
  if (direct) return direct;
  if (!map.groupList.length) return null;
  if (!map.groupStarts) {
    map.groupStarts = new Map();
    map.groupList.forEach((group) => map.groupStarts.set(JSON.stringify(group.nodes[0].toJSON()), group));
  }
  return map.groupStarts.get(JSON.stringify(node.toJSON())) || null;
}

const BLANK_LINE = /\n[ \t]*\n/;

const KIND_OF_NODE = {
  heading: 'heading_open',
  horizontalRule: 'hr',
  codeBlock: 'fence',
  mermaidBlock: 'fence',
  bulletList: 'bullet_list_open',
  taskList: 'bullet_list_open',
  orderedList: 'ordered_list_open',
  blockquote: 'blockquote_open',
  table: 'table_open',
  footnoteDefinition: 'footnote_def_open',
};
const kindOfNode = (node) => KIND_OF_NODE[node.type.name] || 'paragraph_open';

// Two blocks may touch (no blank line between them) when the second ends a paragraph before it by what it is
// (a list, a heading, a rule, a fence, a quote), or the first ends by itself (a heading, a rule, a fence). Two
// paragraphs may not: they would read back as one.
const SELF_ENDING = new Set(['heading_open', 'hr', 'fence']);
const CONTINUES_PARAGRAPH = new Set(['paragraph_open', 'code_block', 'html_block']);
function mayTouch(previousKind, nextKind) {
  return SELF_ENDING.has(previousKind) || !CONTINUES_PARAGRAPH.has(nextKind);
}

/**
 * Write the document: blocks that are still as they were read keep their text and the gap after them, the rest
 * come from `renderBlock`.
 *
 * @param {object|null} map from buildSourceMap, or null to write everything with `renderBlock`
 * @param {Array} nodes the document's top-level nodes
 * @param {(node: object, index: number) => string} renderBlock
 * @param {{ isTrailingGap?: (node: object, previous: object|null) => boolean, joinGap?: (node: object, previous: object) => string|null }} [options]
 *   `joinGap` names the gap of a node that goes on the list before it (a mixed list cut in pieces by the editor)
 */
export function writeWithSource(map, nodes, renderBlock, { isTrailingGap = () => false, joinGap = () => null } = {}) {
  const pieces = [];
  let previous = null;
  let previousOrigin = -1;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    let origin = map?.byNode.get(node) ?? -1;
    let consumed = 1;
    if (map && origin < 0) {
      const group = groupFor(map, node);
      if (group && group.nodes.every((member, offset) => nodes[index + offset] === member || nodes[index + offset]?.eq(member))) {
        origin = group.index;
        consumed = group.nodes.length;
      } else {
        origin = structuralIndex(map, node);
      }
    }
    if (origin < 0 && index === nodes.length - 1 && isTrailingGap(node, previous)) break;
    const text = origin >= 0 ? map.blocks[origin].text : renderBlock(node, index);
    if (previous) {
      let gap = '\n\n';
      if (map) {
        // The gap the note had after the block before; for a block edited in place, the gap of the block it replaces.
        const slot = previousOrigin >= 0 ? previousOrigin : (map.count === nodes.length ? index - 1 : -1);
        // The last block has no gap after it: a block written behind it is a new one and needs its blank line.
        const recorded = slot >= 0 ? map.blocks[slot]?.gap : undefined;
        const wanted = recorded?.includes('\n') ? recorded : undefined;
        const tightOk = origin >= 0 && origin === previousOrigin + 1;
        const previousKind = previousOrigin >= 0 ? map.blocks[previousOrigin].kind : kindOfNode(previous);
        const nextKind = origin >= 0 ? map.blocks[origin].kind : kindOfNode(node);
        if (wanted !== undefined && (tightOk || BLANK_LINE.test(wanted) || mayTouch(previousKind, nextKind))) gap = wanted;
      }
      const joined = joinGap(node, previous);
      pieces.push(joined === null ? gap : joined);
    }
    pieces.push(text);
    previous = nodes[index + consumed - 1];
    previousOrigin = origin;
    index += consumed - 1;
  }
  const body = pieces.join('');
  if (!map) return body;
  const joined = (map.lead || '') + body + (body ? map.tail : '');
  return map.eol === '\r\n' ? joined.replace(/\n/g, '\r\n') : joined;
}
