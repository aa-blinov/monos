/**
 * Reading and writing the YAML frontmatter of a note.
 *
 * The note is a Markdown file on disk, so the frontmatter is not decoration:
 * whatever the UI does with it ends up in git. That shapes two rules here.
 *
 * 1. Unknown keys are never dropped. `upsertFrontmatter` only rewrites the keys
 *    it owns (title, category, tags, due) and passes everything else through
 *    byte-for-byte, so a key someone added by hand survives editing in the app.
 * 2. Dates are stored plain (`2026-10-20`) rather than quoted, because that is
 *    what other Markdown tools read and what git diff shows legibly.
 */

/** Keys the UI owns and rewrites. Everything else in the block is preserved. */
const MANAGED_KEYS = ['title', 'category', 'tags', 'due'];
const BOM = '\uFEFF';

function quoteYamlString(value) {
  return JSON.stringify(String(value || ''));
}

function unquoteYamlString(value) {
  return String(value || '').trim().replace(/^"(.*)"$/s, '$1');
}

/**
 * Keep a note's byte-level conventions: its BOM and its line endings.
 *
 * A note is a file someone may have written on Windows. Emitting LF into a CRLF
 * file (or dropping a BOM) makes git redraw the whole file as rewritten, which
 * buries the real change in noise — so both are detected and reproduced.
 */
function fileConventions(content) {
  const raw = String(content || '');
  const body = raw.replace(BOM, '');
  return {
    bom: raw.startsWith(BOM) ? BOM : '',
    eol: body.includes('\r\n') ? '\r\n' : '\n',
  };
}

/**
 * Split a note into its frontmatter block and body.
 * @param {string} content
 * @returns {{ frontmatter: string, body: string }}
 */
export function splitFrontmatter(content) {
  const raw = String(content || '');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { frontmatter: '', body: raw };
  return { frontmatter: match[1], body: raw.slice(match[0].length).replace(/^\s*\n/, '') };
}

/**
 * Read the keys the UI owns out of a note's frontmatter.
 * @param {string} content
 * @returns {{ title: string, category: string, tags: string[], due: string }}
 */
export function parseFrontmatter(content) {
  const { frontmatter } = splitFrontmatter(content);
  const result = { title: '', category: '', tags: [], due: '' };
  if (!frontmatter) return result;

  for (const line of frontmatter.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === 'title' || key === 'category' || key === 'due') {
      result[key] = unquoteYamlString(value);
      continue;
    }
    if (key === 'tags') {
      const items = [];
      for (const item of (value || '').match(/"([^"]*)"|'([^']*)'|[^,\[\]]+/g) || []) {
        const trimmed = item.trim();
        if (!trimmed) continue;
        items.push(unquoteYamlString(trimmed));
      }
      result.tags = items;
    }
  }
  return result;
}

/** Keep only the lines the UI does not manage. */
function preservedLines(frontmatter) {
  return frontmatter
    .split(/\r?\n/)
    .filter((line) => {
      if (!line.trim()) return false;
      const separator = line.indexOf(':');
      if (separator === -1) return true;
      return !MANAGED_KEYS.includes(line.slice(0, separator).trim().toLowerCase());
    });
}

/**
 * Rewrite the managed keys and keep everything else.
 * @param {string} content full note text
 * @param {{title?: string, category?: string, tags?: string[], due?: string}} metadata
 * @returns {string}
 */
export function upsertFrontmatter(content, metadata = {}) {
  const { frontmatter, body } = splitFrontmatter(content);
  const { bom, eol } = fileConventions(content);

  const lines = [];
  if (metadata.title) lines.push(`title: ${quoteYamlString(metadata.title)}`);
  if (metadata.category) lines.push(`category: ${quoteYamlString(metadata.category)}`);
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  lines.push(`tags: [${tags.map((tag) => quoteYamlString(tag)).join(', ')}]`);
  // An empty value removes the key instead of writing `due: ""`.
  if (metadata.due) lines.push(`due: ${metadata.due}`);
  lines.push(...preservedLines(frontmatter));

  return `${bom}---${eol}${lines.join(eol)}${eol}---${eol}${eol}${body.replace(/^\s*\r?\n/, '')}`;
}

/**
 * Set or clear a single frontmatter key without touching the others.
 * @param {string} content
 * @param {string} key
 * @param {string} value empty string removes the key
 * @returns {string}
 */
export function setFrontmatterKey(content, key, value) {
  const current = parseFrontmatter(content);
  const next = { ...current };
  if (!key || !MANAGED_KEYS.includes(String(key).toLowerCase())) return String(content || '');
  next[key] = value || '';
  return upsertFrontmatter(content, next);
}

/**
 * How a due date relates to now: `overdue`, `today`, `soon` or `later`.
 * Comparisons happen on the calendar day, so a note due today never looks
 * overdue just because it is 23:30.
 *
 * @param {string} due ISO `YYYY-MM-DD`
 * @param {Date} [now]
 * @returns {'none' | 'overdue' | 'today' | 'soon' | 'later'}
 */
export function dueStatus(due, now = new Date()) {
  const iso = String(due || '').trim();
  if (!iso) return 'none';

  const dueDate = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(dueDate.getTime())) return 'none';

  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((startOfDay(dueDate) - startOfDay(now)) / 86400000);

  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 3) return 'soon';
  return 'later';
}

/** Human label for a due date, e.g. «просрочено на 3 дн.» or «через 5 дн.». */
export function dueLabel(due, now = new Date(), strings = {}) {
  const iso = String(due || '').trim();
  if (!iso) return '';

  const dueDate = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(dueDate.getTime())) return '';
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((startOfDay(dueDate) - startOfDay(now)) / 86400000);

  if (days < 0) return strings.overdue(Math.abs(days));
  if (days === 0) return strings.today;
  if (days === 1) return strings.tomorrow;
  if (days <= 3) return strings.inDays(days);
  return strings.onDate(dueDate);
}