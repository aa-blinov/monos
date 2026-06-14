import { defaultMarkdownParser } from 'prosemirror-markdown';

const NODE_TYPE_MAP = {
  bullet_list: 'bulletList',
  ordered_list: 'orderedList',
  list_item: 'listItem',
  code_block: 'codeBlock',
  hard_break: 'hardBreak',
  horizontal_rule: 'horizontalRule',
};

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

function parsedMarkdownContent(markdown) {
  const parsed = defaultMarkdownParser.parse(markdown);
  return normalizeForTipTapSchema(parsed.toJSON()).content || [];
}

function splitTableRow(line) {
  const trimmed = String(line || '').trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, '|').trim());
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

function tableCell(type, value) {
  return {
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [{
      type: 'paragraph',
      content: inlineCellContent(value),
    }],
  };
}

function tableRow(cells, width, cellType = 'tableCell') {
  const paddedCells = [...cells];
  while (paddedCells.length < width) paddedCells.push('');
  return {
    type: 'tableRow',
    content: paddedCells.slice(0, width).map((cell) => tableCell(cellType, cell)),
  };
}

function markdownTableNode(lines) {
  const header = splitTableRow(lines[0]);
  if (header.length < 2 || !isTableDelimiterLine(lines[1])) return null;
  const bodyRows = lines.slice(2).map(splitTableRow);
  const width = Math.max(header.length, ...bodyRows.map((row) => row.length));
  return {
    type: 'table',
    content: [
      tableRow(header, width, 'tableHeader'),
      ...bodyRows.map((row) => tableRow(row, width)),
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

function normalizeMarkdownImageText(node) {
  if (!node || typeof node !== 'object') return node;
  if (node.type === 'text' && typeof node.text === 'string' && node.text.includes('![')) {
    return splitMarkdownImages(node.text);
  }
  if (!Array.isArray(node.content)) return node;

  return {
    ...node,
    content: node.content.flatMap((child) => normalizeMarkdownImageText(child)),
  };
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

    const parsed = defaultMarkdownParser.parse(source);
    if (!parsed.textContent.trim() && source.trim()) {
      return normalizeMarkdownImageText(plainTextDocument(source));
    }
    return normalizeMarkdownImageText(normalizeForTipTapSchema(parsed.toJSON()));
  } catch (error) {
    console.error('Failed to parse markdown:', error);
    return normalizeMarkdownImageText(plainTextDocument(source));
  }
}
