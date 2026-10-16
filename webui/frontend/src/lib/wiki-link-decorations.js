import { wikiLinkSpans } from './wiki-links.js';

const BLOCKED = '\u0001';

/**
 * The wiki links of a ProseMirror document with their positions. Code blocks and inline code are
 * skipped, so `[[x]]` written as code stays code. A link that crosses an image or a formula is not
 * a link.
 *
 * @param {import('@tiptap/pm/model').Node} doc
 * @returns {Array<{ from: number, to: number, target: string, alias: string|null }>}
 */
export function collectWikiLinks(doc) {
  const links = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;
    let text = '';
    const positions = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      const isCode = child.isText && child.marks.some((mark) => mark.type.spec.code);
      const value = child.isText && !isCode ? child.text : BLOCKED.repeat(child.isText ? child.text.length : child.nodeSize);
      for (let i = 0; i < value.length; i += 1) positions.push(start + i);
      text += value;
    });
    for (const span of wikiLinkSpans(text)) {
      links.push({ from: positions[span.start], to: positions[span.end - 1] + 1, target: span.target, alias: span.alias });
    }
    return false;
  });
  return links;
}

/** The link the position is in or touches, or null. */
export function wikiLinkAt(links, pos) {
  return links.find((link) => pos >= link.from && pos <= link.to) || null;
}

/** One key per target as the server matches it: the same name typed in another Unicode form is one link. */
export function wikiLinkKey(target) {
  return String(target || '').normalize('NFC').trim();
}

/**
 * What a resolve-link answer means for the link: it opens one note, it names several, or it leads nowhere.
 *
 * @returns {{ kind: 'found', path: string, name: string } | { kind: 'ambiguous', matches: Array<{ path: string, name: string }> } | { kind: 'missing' }}
 */
export function wikiLinkStatus(answer) {
  if (answer?.ambiguous && Array.isArray(answer.matches) && answer.matches.length) {
    return { kind: 'ambiguous', matches: answer.matches.map((match) => ({ path: match.path, name: match.name })) };
  }
  if (answer?.path) return { kind: 'found', path: answer.path, name: answer.name || answer.path };
  return { kind: 'missing' };
}
