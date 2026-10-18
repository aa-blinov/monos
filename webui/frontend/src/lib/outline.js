/**
 * Build a table of contents from a markdown source.
 *
 * Returns an ordered list of headings with their level (1-6), plain text,
 * stable anchor id (GitHub-style slug with deduplication for repeats) and
 * the 1-based line number where the heading appears in the source.
 *
 * Supports:
 *   - ATX headings: `# H`, `## H ##` (closing hashes are optional)
 *   - Setext headings: `Title\n=====` (H1) or `Title\n-----` (H2)
 *   - Ignores headings inside fenced code blocks and blockquotes
 *
 * @param {string} markdown raw markdown source
 * @returns {Array<{level: number, text: string, anchor: string, line: number}>}
 */

/**
 * A heading as the reader sees it: the source text without its inline markup. `## **Intro**` is "Intro" in the
 * outline, and it must be, for a click on the outline finds the heading by comparing with the editor's text, which
 * holds no `**`. Emphasis, strike-through, code spans, links and images lose their markers; `[[wiki links]]` stay as
 * the editor shows them; `snake_case`, `2 * 3 * 4` and escaped characters are left alone.
 */
export function plainHeadingText(raw) {
  const codes = [];
  const keep = (value) => `\u0000${codes.push(value) - 1}\u0000`;
  let text = String(raw || '')
    .replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, (_, char) => keep(char))
    .replace(/`([^`]+)`/g, (_, code) => keep(code));
  text = text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(?<!\[)\[([^[\]]+)\]\([^)]*\)/g, '$1')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '$1')
    .replace(/\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*/g, '$1')
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '$1')
    .replace(/(?<![\w_])__(?=\S)(.+?)(?<=\S)__(?![\w_])/g, '$1')
    .replace(/\*(?=[^\s*])(.+?)(?<=[^\s*])\*/g, '$1')
    .replace(/(?<![\w_])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![\w_])/g, '$1')
    ;
  return text.replace(/\u0000(\d+)\u0000/g, (_, index) => codes[Number(index)]).trim();
}

function slugifyAnchor(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\u0400-\u04FF\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'heading';
}

/**
 * Strip fenced code blocks and blockquote lines so their inner `#` chars
 * are not picked up as headings.
 */
function stripCodeAndQuotes(markdown) {
  // Returns a parallel array of { text, inFence, inQuote, inFrontmatter } so
  // the main loop can decide whether a heading-looking line is real.
  const lines = markdown.split('\n');
  const out = [];
  let inFence = false;
  let inFrontmatter = false;
  let frontmatterSeenOpen = false;
  for (const [index, line] of lines.entries()) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
      out.push({ text: '', inFence, inQuote: false, inFrontmatter: false });
      continue;
    }
    if (inFence) {
      out.push({ text: '', inFence, inQuote: false, inFrontmatter: false });
      continue;
    }
    // YAML frontmatter: --- at line start
    // Only a --- on the very first line opens it; later ones are horizontal rules or setext underlines.
    if (/^---\s*$/.test(line) && (frontmatterSeenOpen || index === 0)) {
      if (!frontmatterSeenOpen) {
        // opening
        inFrontmatter = true;
        frontmatterSeenOpen = true;
      } else {
        // closing
        inFrontmatter = false;
      }
      out.push({ text: '', inFence: false, inQuote: false, inFrontmatter: false });
      continue;
    }
    if (inFrontmatter) {
      out.push({ text: '', inFence: false, inQuote: false, inFrontmatter: true });
      continue;
    }
    // blockquote line: ">" prefix → not a heading
    const inQuote = /^\s*>/.test(line);
    out.push({ text: line, inFence: false, inQuote, inFrontmatter: false });
  }
  return out;
}

export function extractOutline(markdown) {
  const text = String(markdown || '');
  if (!text.trim()) return [];

  const cleaned = stripCodeAndQuotes(text);
  const out = [];
  const usedAnchors = new Map();

  function addAnchor(rawText) {
    const base = slugifyAnchor(rawText);
    const seen = usedAnchors.get(base) || 0;
    usedAnchors.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
  }

  for (let i = 0; i < cleaned.length; i++) {
    const { text: line, inFence, inQuote, inFrontmatter } = cleaned[i];
    if (inFence || inQuote || inFrontmatter) continue;
    const lineNumber = i + 1;

    // ATX heading: 1-6 leading #, optional trailing #s
    // Поддерживаем экранированный \# (когда заголовок хранится внутри
    // YAML frontmatter, tiptap-markdown экранирует # чтобы не сломать YAML)
    const atx = line.match(/^\s*\\?(#{1,6})\s+(.+?)\s*\\?#*\s*$/);
    if (atx) {
      const level = atx[1].length;
      const text = plainHeadingText(atx[2]);
      out.push({ level, text, anchor: addAnchor(text), line: lineNumber });
      continue;
    }

    // Setext: line is plain text, next line is === (H1) or --- (H2)
    if (line.trim() && i + 1 < cleaned.length) {
      const nextLine = cleaned[i + 1].text.trim();
      if (/^=+\s*$/.test(nextLine)) {
        const title = plainHeadingText(line);
        out.push({ level: 1, text: title, anchor: addAnchor(title), line: lineNumber });
        i++;
        continue;
      }
      if (/^-+\s*$/.test(nextLine)) {
        const title = plainHeadingText(line);
        out.push({ level: 2, text: title, anchor: addAnchor(title), line: lineNumber });
        i++;
        continue;
      }
    }
  }

  return out;
}

/**
 * Number each item among the items that share its text, in document order.
 * Headings can repeat ("Summary" twice), so the text alone does not say which
 * one a click means; the occurrence does.
 */
export function withOccurrences(items) {
  return items.map((item, index) => ({
    ...item,
    occurrence: items.slice(0, index).filter((it) => it.text === item.text).length,
  }));
}

/**
 * Position of the `occurrence`-th heading (0-based) whose text equals `text`.
 * `headings` is `[{ text, pos }]` in document order. Returns null when absent.
 */
export function findHeadingPos(headings, text, occurrence = 0) {
  const wanted = String(text || '').trim();
  if (!wanted) return null;
  const matches = headings.filter((h) => String(h.text || '').trim() === wanted);
  return matches[occurrence]?.pos ?? null;
}

export { slugifyAnchor };

export const OUTLINE_WIDTH = { MIN: 192, MAX: 480, DEFAULT: 224 };

/** The width the Structure column may take: a whole number of pixels between the narrowest that still reads and the widest that leaves the note its room. */
export function clampOutlineWidth(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return OUTLINE_WIDTH.DEFAULT;
  return Math.round(Math.min(OUTLINE_WIDTH.MAX, Math.max(OUTLINE_WIDTH.MIN, number)));
}
