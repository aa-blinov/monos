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
