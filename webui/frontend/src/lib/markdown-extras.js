/**
 * Markdown constructs that `prosemirror-markdown` does not know about.
 *
 * It implements CommonMark, so a `$$…$$` formula and a ```mermaid fence arrive in
 * the editor as plain paragraphs and code blocks. Left alone, the person sees
 * `$E = mc^2$` as literal text and a diagram as a wall of code — which is exactly
 * what the note author did not want.
 *
 * Everything here works on the already-parsed document, so no other Markdown
 * construct is disturbed, and every function is pure: the conversion is covered
 * by node:test without a browser in sight.
 */

// `$…$` must not swallow currency: the character after the opening `$` and the
// one before the closing `$` may not be whitespace. `$5 and $10` stays text.
const INLINE_MATH = /(?<!\\)\$(?![\s$])([^$\n]*?[^\\\s$])\$(?!\d)/;

/**
 * The Markdown parser names the fence language `params`, while the editor's
 * code block calls it `language`; both spellings occur depending on which path
 * parsed the note, so accept either.
 */
function fenceLanguage(node) {
  return String(node?.attrs?.language ?? node?.attrs?.params ?? '').toLowerCase();
}

function isMermaidCodeBlock(node) {
  return node?.type === 'codeBlock' && fenceLanguage(node) === 'mermaid';
}

function toMermaidBlock(node) {
  return { type: 'mermaidBlock', attrs: { code: (node.content?.[0]?.text || '').replace(/\n$/, '') } };
}

function paragraphText(node) {
  return (node?.content || []).map((child) => child.text || '').join('');
}

/** `$$x$$` alone in a paragraph is a display formula, not a sentence. */
function blockMathLatex(paragraph) {
  const text = paragraphText(paragraph);
  const match = text.match(/^\s*\$\$([\s\S]+?)\$\$\s*$/);
  return match ? match[1].trim() : '';
}

/**
 * Split one text node into plain text and inline-math nodes.
 *
 * Marks are copied onto every plain-text piece — dropping them would silently
 * unbold or unitalicise a whole sentence just because a `$` appeared somewhere
 * in the paragraph. The formula piece gets no marks: KaTeX draws it, and a mark
 * around it has nothing to apply to.
 */
function splitInlineMath(text, marks) {
  const carried = Array.isArray(marks) && marks.length ? marks : undefined;
  const parts = [];
  let rest = String(text);

  while (rest) {
    const match = INLINE_MATH.exec(rest);
    if (!match) {
      parts.push(marks ? { type: 'text', text: rest, marks } : { type: 'text', text: rest });
      break;
    }
    if (match.index > 0) {
      const before = rest.slice(0, match.index);
      parts.push(carried ? { type: 'text', text: before, marks: carried } : { type: 'text', text: before });
    }
    parts.push({ type: 'inlineMath', attrs: { latex: match[1] } });
    rest = rest.slice(match.index + match[0].length);
  }

  return parts;
}

function convertNodeChildren(children) {
  const out = [];
  for (const child of children || []) {
    if (child.type === 'text') {
      out.push(...splitInlineMath(child.text || '', child.marks));
      continue;
    }
    out.push(child);
  }
  return out;
}

function convertNode(node) {
  if (!node || typeof node !== 'object') return node;

  if (isMermaidCodeBlock(node)) return toMermaidBlock(node);

  if (node.type === 'paragraph') {
    const latex = blockMathLatex(node);
    if (latex) return { type: 'mathBlock', attrs: { latex } };
    return { ...node, content: convertNodeChildren(node.content) };
  }

  if (Array.isArray(node.content)) {
    return { ...node, content: node.content.map(convertNode) };
  }
  return node;
}

/** Apply the conversion across a whole document's top-level nodes. */
export function convertMarkdownExtras(nodes) {
  return (Array.isArray(nodes) ? nodes : []).map(convertNode);
}

/**
 * Pull a formula out of a note's text — used to render math inside a task item
 * or any other inline container the converter above does not rewrite.
 * Returns `null` when there is no formula.
 */
export function findInlineMath(latex) {
  const match = INLINE_MATH.exec(String(latex || ''));
  return match ? match[1] : null;
}
