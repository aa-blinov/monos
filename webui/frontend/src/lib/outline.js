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
  for (const line of lines) {
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
    if (/^---\s*$/.test(line)) {
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
      const text = atx[2].trim();
      out.push({ level, text, anchor: addAnchor(text), line: lineNumber });
      continue;
    }

    // Setext: line is plain text, next line is === (H1) or --- (H2)
    if (i + 1 < cleaned.length) {
      const nextLine = cleaned[i + 1].text.trim();
      if (/^=+\s*$/.test(nextLine)) {
        out.push({ level: 1, text: line.trim(), anchor: addAnchor(line.trim()), line: lineNumber });
        i++;
        continue;
      }
      if (/^-+\s*$/.test(nextLine)) {
        out.push({ level: 2, text: line.trim(), anchor: addAnchor(line.trim()), line: lineNumber });
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
