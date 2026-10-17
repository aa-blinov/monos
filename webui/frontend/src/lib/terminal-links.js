/**
 * Note paths in terminal output, made clickable: an agent writes "Updated Work/Plan 14 October.md", and a
 * click opens that note. Names hold spaces and any letters, so a path is not guessed from its shape: the
 * text before each ".md" is matched against the notes that exist, and the longest match wins.
 */

// Where a path may start: the line's start, or after one of these.
const BOUNDARY = new Set([' ', '\t', '"', "'", '`', '(', '[', '<', '«', '“', ':', '=', ',']);
const MAX_PATH = 240;

/**
 * @param {string} line one line of terminal text
 * @param {Set<string>} notes note paths relative to the notes folder (`Work/Plan.md`)
 * @param {string} [root] the notes folder's absolute path, for paths printed in full
 * @returns {Array<{ start: number, end: number, path: string }>} `start` inclusive, `end` exclusive, `path` as in the app (`notes/…`)
 */
export function findNoteLinks(line, notes, root = '') {
  const links = [];
  const text = String(line || '');
  const lower = text.toLowerCase();
  const prefix = root ? `${root.replace(/\/+$/, '')}/` : '';
  let from = 0;
  while (from < text.length) {
    const at = lower.indexOf('.md', from);
    if (at === -1) break;
    const end = at + 3;
    from = end;
    if (end < text.length && /[\p{L}\p{N}_]/u.test(text[end])) continue;
    let best = null;
    for (let start = at - 1; start >= Math.max(0, at - MAX_PATH); start -= 1) {
      if (start > 0 && !BOUNDARY.has(text[start - 1])) continue;
      let candidate = text.slice(start, end);
      if (prefix && candidate.startsWith(prefix)) candidate = candidate.slice(prefix.length);
      candidate = candidate.replace(/^\.\//, '');
      if (notes.has(candidate)) best = { start, end, path: `notes/${candidate}` };
    }
    if (best && !links.some((link) => link.start < best.end && best.start < link.end)) links.push(best);
  }
  return links;
}

/** The note paths in a tree from /api/tree, relative to the notes folder. */
export function notePathsOf(tree) {
  const paths = new Set();
  const walk = (node) => {
    if (!node) return;
    if (!node.is_dir && /\.md$/i.test(node.path || '')) paths.add(String(node.path).replace(/^notes\//, ''));
    (node.children || []).forEach(walk);
  };
  walk(tree);
  return paths;
}
