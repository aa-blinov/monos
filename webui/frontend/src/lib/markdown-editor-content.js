import { MarkdownParser, defaultMarkdownParser, schema as markdownSchema } from 'prosemirror-markdown';
import { Schema } from '@tiptap/pm/model';
import { convertMarkdownExtras } from './markdown-extras.js';
import { isBlankLineNode } from './blank-line.js';

const NODE_TYPE_MAP = {
  bullet_list: 'bulletList',
  ordered_list: 'orderedList',
  list_item: 'listItem',
  code_block: 'codeBlock',
  hard_break: 'hardBreak',
  horizontal_rule: 'horizontalRule',
};

// prosemirror-markdown turns a newline inside a paragraph into a space. The editor keeps it as a soft break node
// (see soft-break.js), so saving writes the newline back. Same parser, one more node.
// The same schema also carries what the stock one drops and the file therefore lost on the next save: the
// strikethrough mark (`~~x~~`), the number a list starts from, the `)` of `7)` and the marker of a bullet list.
const baseNodes = markdownSchema.spec.nodes;
const softBreakSchema = new Schema({
  nodes: baseNodes
    .update('ordered_list', {
      ...baseNodes.get('ordered_list'),
      attrs: { ...baseNodes.get('ordered_list').attrs, delimiter: { default: '.' } },
    })
    // A setext heading may span lines ("title\ncontinued\n---"); with no place for the line break in the stock heading
    // the parser dropped its whole text.
    .update('heading', { ...baseNodes.get('heading'), content: '(text | image | softBreak)*' })
    .update('bullet_list', {
      ...baseNodes.get('bullet_list'),
      attrs: { ...baseNodes.get('bullet_list').attrs, marker: { default: '-' } },
    })
    .append({
      softBreak: { inline: true, group: 'inline', leaf: true, selectable: false },
    }),
  marks: markdownSchema.spec.marks.append({
    strike: { toDOM: () => ['s', 0] },
  }),
});
// markdown-it is already shipped with the parser; its commonmark preset leaves `~~` out, so it is switched on here
// on a tokenizer of our own (the stock one is shared with whoever else imports the parser).
const MarkdownIt = defaultMarkdownParser.tokenizer.constructor;
const tokenizer = new MarkdownIt('commonmark', { html: false }).enable('strikethrough');
const softBreakParser = new MarkdownParser(softBreakSchema, tokenizer, {
  ...defaultMarkdownParser.tokens,
  softbreak: { node: 'softBreak' },
  s: { mark: 'strike' },
  bullet_list: {
    block: 'bullet_list',
    getAttrs: (token, tokens, index) => ({
      ...defaultMarkdownParser.tokens.bullet_list.getAttrs(token, tokens, index),
      marker: token.markup || '-',
    }),
  },
  ordered_list: {
    block: 'ordered_list',
    getAttrs: (token, tokens, index) => ({
      ...defaultMarkdownParser.tokens.ordered_list.getAttrs(token, tokens, index),
      delimiter: token.markup === ')' ? ')' : '.',
    }),
  },
});

const MARK_TYPE_MAP = {
  em: 'italic',
  strong: 'bold',
};

function mapType(type, typeMap) {
  return typeMap[type] || type;
}

function normalizeForTipTapSchema(node) {
  if (!node || typeof node !== 'object') return node;
  const next = { ...node };
  if (next.type) next.type = mapType(next.type, NODE_TYPE_MAP);
  // The editor's ordered list calls the first number `start`.
  if (next.type === 'orderedList' && next.attrs && 'order' in next.attrs) {
    const { order, ...rest } = next.attrs;
    next.attrs = { ...rest, start: order };
  }
  // A `&nbsp;` line is an empty paragraph again (see blank-line.js).
  if (next.type === 'paragraph' && isBlankLineNode(next)) delete next.content;
  if (Array.isArray(next.marks)) {
    next.marks = next.marks.map((mark) => ({
      ...mark,
      type: mapType(mark.type, MARK_TYPE_MAP),
    }));
  }
  if (Array.isArray(next.content)) {
    next.content = next.content.map(normalizeForTipTapSchema);
  }
  return next;
}

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;

/**
 * Languages of the fenced blocks, in document order. Closing fences are
 * skipped, and only the info string's first word is taken — that is what
 * CommonMark calls the language.
 */
export function fencedBlockLanguages(markdown) {
  const languages = [];
  let openMarker = '';
  for (const line of String(markdown || '').replace(/\r\n/g, '\n').split('\n')) {
    const match = line.match(FENCE_LINE);
    if (!match) continue;
    const char = match[1][0];
    if (!openMarker) {
      openMarker = char;
      languages.push(match[2] || '');
    } else if (openMarker === char) {
      openMarker = '';
    }
  }
  return languages;
}

function countCodeBlocks(nodes) {
  return (Array.isArray(nodes) ? nodes : [nodes]).reduce((total, node) => {
    if (Array.isArray(node)) return total + countCodeBlocks(node);
    if (node?.type === 'codeBlock') return total + 1;
    return total + (Array.isArray(node?.content) ? countCodeBlocks(node.content) : 0);
  }, 0);
}

/**
 * Put the fence language back on the parsed `codeBlock` nodes.
 *
 * The editor parses through `prosemirror-markdown`'s CommonMark parser, which
 * throws away the info string — so every block arrived without a language and
 * highlighting could only guess it. Re-attaching here keeps the language the
 * author wrote.
 *
 * When the counts disagree the source contains an indented code block (which
 * has no fence), alignment can no longer be trusted, and nothing is assigned:
 * a wrong language is worse than none.
 */
export function withCodeLanguages(content, markdown) {
  const languages = fencedBlockLanguages(markdown);
  if (!languages.length) return content;
  if (countCodeBlocks(content) !== languages.length) return content;

  let index = 0;
  const walk = (nodes) => (Array.isArray(nodes) ? nodes : [nodes]).flatMap((node) => {
    if (Array.isArray(node)) return walk(node);
    if (node?.type === 'codeBlock') {
      const language = languages[index];
      index += 1;
      if (!language) return [node];
      return [{ ...node, attrs: { ...(node.attrs || {}), language } }];
    }
    if (Array.isArray(node?.content)) return [{ ...node, content: walk(node.content) }];
    return [node];
  });

  return walk(content);
}

function parsedMarkdownContent(markdown) {
  const parsed = softBreakParser.parse(markdown);
  const content = convertMarkdownExtras(convertTaskLists(normalizeForTipTapSchema(parsed.toJSON()).content || []));
  return withCodeLanguages(content, markdown);
}

// Пустая задача «- [ ]» — тоже задача: текста после маркера может не быть.
const TASK_MARKER = /^\[([ xX])\](?:\s+|$)/;

/**
 * Turn GitHub task-list items into the `taskList`/`taskItem` nodes TipTap uses.
 *
 * `prosemirror-markdown` implements CommonMark, which has no notion of `- [ ]`.
 * It reads such a line as a bullet whose text happens to start with "[x]", so a
 * note written with real checkboxes arrives in the editor as literal `[x]`
 * characters — the user sees a fake checkbox they cannot tick, and the progress
 * counter in the header has nothing to tick either.
 *
 * Working on the parsed document (rather than rewriting the Markdown text) keeps
 * every other construct exactly as it was.
 */
function convertTaskLists(nodes) {
  if (!Array.isArray(nodes)) return nodes;

  /** Спускаемся внутрь элементов списка: там могут быть вложенные списки. */
  const descendIntoItems = (list) => ({
    ...list,
    content: (list.content || []).map((item) => (
      Array.isArray(item?.content) ? { ...item, content: convertTaskLists(item.content) } : item
    )),
  });

  const converted = nodes.map((node) => {
    if (node?.type === 'bulletList' && Array.isArray(node.content)) {
      const items = node.content.map((item) => convertListItemToTaskItem(item));
      if (items.length > 0 && items.every((item) => item?.type === 'taskItem')) {
        return [descendIntoItems({ type: 'taskList', attrs: listShape(node), content: items })];
      }

      // Смешанный список: обычные пункты и задачи рядом. Раньше такой список
      // целиком оставался маркированным, и задача теряла галочку — при том что
      // счётчик в заголовке её всё равно считал. Поэтому режем список на
      // последовательные группы и каждую отдаём в своём узле, сохраняя порядок.
      const runs = [];
      for (const item of items) {
        const kind = item?.type === 'taskItem' ? 'task' : 'bullet';
        const last = runs[runs.length - 1];
        if (last && last.kind === kind) last.items.push(item);
        else runs.push({ kind, items: [item] });
      }
      return runs.map((run, at) => {
        // Every piece after the first is the same list continued: `continues` lets the writer join them again.
        const shape = at ? { continues: true } : {};
        return descendIntoItems(
          run.kind === 'task'
            ? { type: 'taskList', attrs: { ...listShape(node), ...shape }, content: run.items }
            : { ...node, attrs: { ...node.attrs, ...shape }, content: run.items },
        );
      });
    }

    if (Array.isArray(node?.content)) {
      return { ...node, content: convertTaskLists(node.content) };
    }
    return node;
  });

  // map выше может вернуть массивы (смешанный список режется на группы).
  return converted.flat();
}

// A task list is the bullet list it came from: loose stays loose, tight stays tight, `*` stays `*`.
function listShape(list) {
  const { tight, marker } = list.attrs || {};
  return { tight: tight !== false, marker: marker || '-' };
}

function convertListItemToTaskItem(item) {
  const first = item?.content?.[0];
  if (item?.type !== 'listItem' || first?.type !== 'paragraph') return item;

  const text = first.content?.[0];
  if (text?.type !== 'text' || !TASK_MARKER.test(text.text || '')) return item;

  const checked = /[xX]/.test(TASK_MARKER.exec(text.text)[1]);
  const rest = { ...text, text: text.text.replace(TASK_MARKER, '') };
  const paragraph = { ...first, content: rest.text ? [rest] : [] };

  // Вложенные списки остаются вложенными; convertTaskLists может вернуть
  // несколько узлов (смешанный список режется на группы), поэтому разворачиваем
  // всё, а не забираем первый элемент — иначе хвост просто исчезает.
  const nested = item.content.slice(1).flatMap((child) => convertTaskLists([child]));
  // TipTap требует абзац внутри задачи, даже пустой: без него пустая задача не встанет в схему.
  return {
    type: 'taskItem',
    attrs: { checked },
    content: [paragraph, ...nested],
  };
}

function toBulletItem(item) {
  const marker = `[${item.attrs.checked ? 'x' : ' '}]`;
  const content = (item.content || []).map((child) => {
    if (child.type !== 'paragraph') return child;
    // Put the marker back so a mixed list round-trips to the same Markdown.
    const [first, ...rest] = child.content || [];
    if (!first || first.type !== 'text') {
      return { ...child, content: [{ type: 'text', text: `${marker} ` }, ...(child.content || [])] };
    }
    return { ...child, content: [{ ...first, text: `${marker} ${first.text || ''}` }, ...rest] };
  });
  return { type: 'listItem', content };
}

function splitTableRow(line) {
  const trimmed = String(line || '').trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, '|').trim());
}

const ALIGN_OF = { ':--': 'left', ':-:': 'center', '--:': 'right' };
function delimiterAlign(cell) {
  const compact = cell.replace(/\s+/g, '');
  const key = (compact.startsWith(':') ? ':' : '-') + '-' + (compact.endsWith(':') ? ':' : '-');
  return ALIGN_OF[key] || null;
}

function isTableDelimiterLine(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
}

function isTableBodyLine(line) {
  return String(line || '').includes('|') && String(line || '').trim() !== '';
}

function inlineCellContent(markdown) {
  const content = parsedMarkdownContent(String(markdown || '').trim());
  if (content.length === 1 && content[0].type === 'paragraph') return content[0].content;
  return markdown.trim() ? [{ type: 'text', text: markdown.trim() }] : undefined;
}

function tableCell(type, value, align = null) {
  return {
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null, align },
    content: [{
      type: 'paragraph',
      content: inlineCellContent(value),
    }],
  };
}

function tableRow(cells, width, cellType = 'tableCell', aligns = []) {
  const paddedCells = [...cells];
  while (paddedCells.length < width) paddedCells.push('');
  return {
    type: 'tableRow',
    content: paddedCells.slice(0, width).map((cell, column) => tableCell(cellType, cell, aligns[column] || null)),
  };
}

function markdownTableNode(lines) {
  const header = splitTableRow(lines[0]);
  if (header.length < 2 || !isTableDelimiterLine(lines[1])) return null;
  const bodyRows = lines.slice(2).map(splitTableRow);
  const width = Math.max(header.length, ...bodyRows.map((row) => row.length));
  const aligns = splitTableRow(lines[1]).map(delimiterAlign);
  return {
    type: 'table',
    content: [
      tableRow(header, width, 'tableHeader', aligns),
      ...bodyRows.map((row) => tableRow(row, width, 'tableCell', aligns)),
    ],
  };
}

function markdownWithTablesToEditorContent(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const content = [];
  let chunk = [];
  let foundTable = false;
  let fenceMarker = '';

  function flushChunk() {
    const markdown = chunk.join('\n');
    chunk = [];
    if (!markdown.trim()) return;
    content.push(...parsedMarkdownContent(markdown));
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1];
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fenceMarker) fenceMarker = marker;
      else if (fenceMarker === marker) fenceMarker = '';
      chunk.push(line);
      continue;
    }
    if (fenceMarker) {
      chunk.push(line);
      continue;
    }

    if (isTableBodyLine(line) && isTableDelimiterLine(nextLine)) {
      const tableLines = [line, nextLine];
      index += 2;
      while (index < lines.length && isTableBodyLine(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      index -= 1;

      const table = markdownTableNode(tableLines);
      if (table) {
        flushChunk();
        content.push(table);
        foundTable = true;
        continue;
      }
      chunk.push(...tableLines);
      continue;
    }
    chunk.push(line);
  }

  flushChunk();
  return foundTable ? { type: 'doc', content: content.length ? content : undefined } : null;
}

function splitMarkdownImages(text) {
  const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
  const content = [];
  let lastIndex = 0;
  let match;

  while ((match = imagePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      content.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }
    content.push({
      type: 'image',
      attrs: {
        src: match[2],
        alt: match[1] || '',
        title: match[3] || null,
      },
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    content.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return content.length ? content : [{ type: 'text', text }];
}

const EMBED_FORM = /^!\[\[([^\]|#]+?)\.(png|jpe?g|gif|webp|svg)\]\]$/i;
const IMAGE_MARKDOWN_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
// Одна форма на оба случая: `![[image.png]]` и `![[Заметка]]`. Расширение в
// конце необязательное, поэтому обе разбираются за один проход — иначе в тексте
// «![[a.png]] и ![[Заметка]]» находилась только первая половина, а вторая
// оставалась литералом.
const EMBED_ANYWHERE_RE = /!\[\[([^\]|#\n]+?)(?:\.(png|jpe?g|gif|webp|svg|pdf))?\]\]/gi;

function embedImageNode(target) {
  const name = String(target).split('/').pop() || target;
  return {
    type: 'image',
    attrs: {
      src: `_attachments/${target}`,
      alt: name.replace(/\.[^.]+$/, '') || 'image',
      title: null,
      // Written back as `![[…]]`: the note was written that way and stays that way.
      wiki: true,
    },
  };
}

/**
 * Obsidian / Outline style embeds: `![[diagram.png]]`.
 *
 * They arrive from other tools as literal text — the block shows its own source
 * instead of the picture. Rewriting them at parse time converges on the one
 * image form the editor writes itself (`![name](_attachments/…)`), so the note
 * normalises on the next save. Only pictures are rewritten: `![[Note]]` is a
 * wiki link, and this app renders those as text on purpose.
 *
 * Text is split rather than pattern-matched wholesale, because a paragraph may
 * hold several embeds and an embed may sit inside a sentence — both occur in
 * the corpus (`![[a]]![[b]]![[c]]`).
 */
export function normalizeObsidianEmbeds(text) {
  const source = String(text ?? '');
  if (!source.includes('![[')) return null;

  const content = [];
  let lastIndex = 0;
  EMBED_ANYWHERE_RE.lastIndex = 0;
  let match;
  while ((match = EMBED_ANYWHERE_RE.exec(source)) !== null) {
    if (match.index > lastIndex) {
      content.push({ type: 'text', text: source.slice(lastIndex, match.index) });
    }
    const name = match[1].trim();
    const extension = match[2] ? match[2].toLowerCase() : '';
    if (extension === 'pdf') content.push(pdfEmbedNode(`${name}.pdf`));
    else content.push(extension ? embedImageNode(`${name}.${extension}`) : noteEmbedNode(name));
    lastIndex = match.index + match[0].length;
  }
  if (!content.length) return null;
  if (lastIndex < source.length) {
    content.push({ type: 'text', text: source.slice(lastIndex) });
  }
  return content;
}

function noteEmbedNode(name) {
  return { type: 'noteEmbed', attrs: { name } };
}

// A PDF sits in the note's `_attachments` folder like a picture; the node shows its pages.
function pdfEmbedNode(target) {
  const name = String(target).split('/').pop() || target;
  return { type: 'pdfEmbed', attrs: { name, src: `_attachments/${target}` } };
}

function normalizeMarkdownImageText(node) {
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'text' && typeof node.text === 'string') {
    const embeds = normalizeObsidianEmbeds(node.text);
    if (embeds) return embeds;
    if (node.text.includes('![')) {
      return splitMarkdownImages(node.text);
    }
  }
  if (!Array.isArray(node.content)) return node;

  const content = node.content.flatMap((child) => normalizeMarkdownImageText(child));
  // A block embed cannot sit inside a paragraph, so the paragraph is cut around it.
  if (node.type === 'paragraph' && content.some((child) => BLOCK_EMBED_TYPES.has(child?.type))) {
    return splitParagraphAroundBlocks({ ...node, content });
  }
  return { ...node, content };
}

const BLOCK_EMBED_TYPES = new Set(['noteEmbed', 'pdfEmbed']);

// Paragraph, block, paragraph: the text on each side of a block embed keeps its own paragraph.
// A run of whitespace alone is dropped, so `![[a.pdf]] ` does not leave an empty paragraph.
function splitParagraphAroundBlocks(paragraph) {
  const pieces = [];
  let run = [];
  const flush = () => {
    if (run.some((child) => child.type !== 'text' || child.text?.trim())) {
      pieces.push({ ...paragraph, content: run });
    }
    run = [];
  };
  for (const child of paragraph.content) {
    if (BLOCK_EMBED_TYPES.has(child.type)) {
      flush();
      pieces.push(child);
    } else {
      run.push(child);
    }
  }
  flush();
  return pieces;
}

export function plainTextDocument(text) {
  const blocks = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trimEnd())
    .filter((block) => block.trim());

  return {
    type: 'doc',
    content: (blocks.length ? blocks : ['']).map((block) => ({
      type: 'paragraph',
      content: block ? [{ type: 'text', text: block }] : undefined,
    })),
  };
}

export function markdownToEditorContent(markdown) {
  const source = String(markdown || '').replace(/\u0000/g, '');
  if (!source.trim()) return plainTextDocument('');

  try {
    const tableDocument = markdownWithTablesToEditorContent(source);
    if (tableDocument) {
      return normalizeMarkdownImageText(tableDocument);
    }

    const parsed = softBreakParser.parse(source);
    if (!parsed.textContent.trim() && source.trim()) {
      return normalizeMarkdownImageText(plainTextDocument(source));
    }
    const normalized = normalizeForTipTapSchema(parsed.toJSON());
    normalized.content = withCodeLanguages(
      convertMarkdownExtras(convertTaskLists(normalized.content || [])),
      source,
    );
    return normalizeMarkdownImageText(normalized);
  } catch (error) {
    console.error('Failed to parse markdown:', error);
    return normalizeMarkdownImageText(plainTextDocument(source));
  }
}
