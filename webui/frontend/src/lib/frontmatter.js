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
// `pinned` тоже управляемый: без него setFrontmatterKey возвращал текст
// без изменений, и закрепление из редактора не записывалось вовсе.
const MANAGED_KEYS = ['title', 'category', 'tags', 'due', 'pinned'];
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
 * Put a new body under a note's frontmatter. The `---` fences and the line endings
 * stay exactly as they were, so editing a body never rewrites the metadata.
 * A note without frontmatter becomes just its body.
 * @param {string} content the note as it is now
 * @param {string} body the body the editor produced
 * @returns {string}
 */
export function replaceFrontmatterBody(content, body) {
  const match = String(content || '').match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  const eol = match && match[0].includes('\r\n') ? '\r\n' : '\n';
  const nextBody = String(body || '').replace(/^\s*\n/, '').replace(/\r?\n/g, eol);
  if (!match) return nextBody;
  const block = match[0].replace(/\r?\n$/, '');
  return `${block}${eol}${eol}${nextBody}`;
}

/**
 * Read the keys the UI owns out of a note's frontmatter.
 * @param {string} content
 * @returns {{ title: string, category: string, tags: string[], due: string }}
 */
export function parseFrontmatter(content) {
  const { frontmatter } = splitFrontmatter(content);
  const result = { title: '', category: '', tags: [], due: '', pinned: false };
  if (!frontmatter) return result;

  const lines = frontmatter.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === 'title' || key === 'category' || key === 'due') {
      result[key] = unquoteYamlString(value);
      continue;
    }
    if (key === 'pinned') {
      // Разбор нужен не только вставке свойств: без него кнопка закрепления
      // всегда показывала «откреплено», потому что ключ просто не читался.
      result.pinned = /^(true|yes|1)$/i.test(unquoteYamlString(value));
      continue;
    }
    if (key === 'tags') {
      const items = [];
      // Блочный стиль — обычный YAML: `tags:` и список ниже. Раньше читался
      // только однострочный вариант, и теги были не видны в панели, а при
      // первом же сохранении пропадали совсем.
      if (!value) {
        while (index + 1 < lines.length && /^\s+-\s/.test(lines[index + 1])) {
          index += 1;
          const item = lines[index].trim().replace(/^-\s*/, '');
          const unquoted = unquoteYamlString(item);
          if (unquoted) items.push(unquoted);
        }
      } else {
        for (const item of value.match(/"([^"]*)"|'([^']*)'|[^,\[\]]+/g) || []) {
          const trimmed = item.trim();
          if (!trimmed) continue;
          items.push(unquoteYamlString(trimmed));
        }
      }
      result.tags = items;
    }
  }
  return result;
}

/**
 * Keep only the lines the UI does not manage.
 *
 * A key may be written as a block — `tags:` on one line and the list under it.
 * Such continuation lines carry no `:` and used to survive here, so after the
 * first metadata save they ended up dangling inside the frontmatter, right
 * under `due`. Two notes in the corpus still use the inline form, but the
 * properties panel writes tags on every keystroke, so the trap was close.
 */
function preservedLines(frontmatter) {
  const kept = [];
  let inManagedBlock = false;
  for (const line of frontmatter.split(/\r?\n/)) {
    if (!line.trim()) { inManagedBlock = false; continue; }
    // Пункт списка начинается с «-» и может содержать двоеточие внутри
    // значения: `- "срочно: очень"`. Раньше такая строка читалась как новый
    // ключ, `inManagedBlock` сбрасывался, и она оставалась в шапке сиротой —
    // YAML переставал разбираться во всём frontmatter.
    if (/^\s+-\s/.test(line)) {
      if (!inManagedBlock) kept.push(line);
      continue;
    }
    const separator = line.indexOf(':');
    if (separator === -1) {
      // Продолжение предыдущего ключа: чужое — оставляем, управляемое — нет.
      if (!inManagedBlock) kept.push(line);
      continue;
    }
    const key = line.slice(0, separator).trim().toLowerCase();
    inManagedBlock = MANAGED_KEYS.includes(key);
    if (!inManagedBlock) kept.push(line);
  }
  return kept;
}

/**
 * Rewrite the managed keys and keep everything else.
 *
 * Ключ из MANAGED_KEYS, которого нет в `metadata`, считается снятым: именно
 * так пустой срок убирает строку, а не пишет `due: ""`. Поэтому вызывающий
 * обязан передавать все управляемые ключи, а не только изменившиеся — иначе
 * молча теряется, например, закрепление.
 *
 * @param {string} content full note text
 * @param {{title?: string, category?: string, tags?: string[], due?: string, pinned?: boolean}} metadata
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
  if (metadata.pinned) lines.push('pinned: true');
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