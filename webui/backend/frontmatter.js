import { formatPropertyValue } from './properties.js';

const BOM = '\uFEFF';

function quoteYamlString(value) {
  return JSON.stringify(String(value || ''));
}

function formatTags(tags = []) {
  return `[${tags.map((tag) => quoteYamlString(tag)).join(', ')}]`;
}

function splitFrontmatter(content) {
  // The byte order mark is not part of the body: upsertFrontmatter writes it back in front (see fileConventions).
  const rawContent = String(content || '').replace(/^﻿/, '');
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { frontmatter: '', body: rawContent };

  return {
    frontmatter: match[1],
    body: rawContent.slice(match[0].length),
  };
}

/**
 * Detect the byte-level conventions of a note and keep them.
 *
 * A note is a file someone may have written on Windows and opened elsewhere.
 * Rewriting its frontmatter must not quietly convert CRLF to LF or drop a BOM:
 * either change makes git redraw the whole file as if it were rewritten, which
 * buries the real edit in noise. The frontmatter we rebuild is emitted with the
 * same line ending the note already used.
 */
function fileConventions(content) {
  const raw = String(content || '');
  const body = raw.replace(BOM, '');
  // Первый перевод строк в файле задаёт стиль всего остатка: смешивать их в
  // одном файле нельзя, а выбирать «как получится» — тоже.
  const crlf = body.includes('\r\n');
  return {
    bom: raw.startsWith(BOM) ? BOM : '',
    eol: crlf ? '\r\n' : '\n',
  };
}

const RESERVED_KEYS = ['title', 'category', 'tags', 'pinned'];

// The frontmatter lines this module does not rebuild. A reserved key written as a block list
// (`tags:` followed by `  - item` lines) takes its items with it: left behind, they would pile up
// under the rebuilt `tags:` line on every save.
function keptFrontmatterLines(frontmatter, reservedKeys) {
  const kept = [];
  let inReservedBlock = false;
  for (const line of frontmatter.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (inReservedBlock && /^\s/.test(line)) continue;
    inReservedBlock = false;
    const separatorIndex = line.indexOf(':');
    if (separatorIndex !== -1 && reservedKeys.has(line.slice(0, separatorIndex).trim().toLowerCase())) {
      inReservedBlock = true;
      continue;
    }
    kept.push(line);
  }
  return kept;
}

export function upsertFrontmatter(content, metadata = {}) {
  const { frontmatter, body } = splitFrontmatter(content);
  const { bom, eol } = fileConventions(content);
  const reservedKeys = new Set(RESERVED_KEYS);
  const preservedLines = keptFrontmatterLines(frontmatter, reservedKeys);

  const lines = [];
  if (metadata.title) lines.push(`title: ${quoteYamlString(metadata.title)}`);
  if (metadata.category) lines.push(`category: ${quoteYamlString(metadata.category)}`);
  lines.push(`tags: ${formatTags(metadata.tags || [])}`);
  // Сняли закрепление — ключ исчезает, а не остаётся `pinned: false` в файле.
  if (metadata.pinned) lines.push('pinned: true');
  lines.push(...preservedLines);

  // Тело сохраняем как есть: переводы строк внутри него уже те самые.
  return `${bom}---${eol}${lines.join(eol)}${eol}---${eol}${eol}${body.replace(/^\s*\r?\n/, '')}`;
}

// A top-level key of a frontmatter line, or null for an indented line, a comment or a line without a key.
function topLevelKeyOf(line) {
  const separator = line.indexOf(':');
  if (separator <= 0 || /^\s/.test(line) || line.startsWith('#')) return null;
  return line.slice(0, separator).trim();
}

/**
 * Sets one custom property in the frontmatter, or removes it when `property` is null. Only that
 * key's lines change: a block list under it goes with it, and everything else stays as it was,
 * including the line endings, the byte order mark and the body. A note with no frontmatter gets one.
 *
 * @param {string} content  the whole note, as it is on disk
 * @param {string} key      a name already checked by normalizePropertyKey
 * @param {{ type: string, value: unknown } | null} property
 * @returns {string} the note with the change, or the same text when nothing changed
 */
export function setFrontmatterProperty(content, key, property) {
  const raw = String(content || '');
  const line = property ? `${key}: ${formatPropertyValue(property.type, property.value)}` : null;
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  const { eol } = fileConventions(raw);

  if (!match) {
    if (!line) return raw;
    const bom = raw.startsWith(BOM) ? BOM : '';
    return `${bom}---${eol}${line}${eol}---${eol}${eol}${raw.replace(/^﻿/, '')}`;
  }

  const wanted = key.toLowerCase();
  const kept = [];
  let placed = false;
  let inKey = false;
  for (const current of match[1].split(/\r?\n/)) {
    // Items and blank lines under the key belong to it; the next top-level key ends it.
    if (inKey && (/^\s/.test(current) || current.trim() === '')) continue;
    inKey = false;
    const name = topLevelKeyOf(current);
    if (name !== null && name.toLowerCase() === wanted) {
      inKey = true;
      if (line && !placed) {
        kept.push(line);
        placed = true;
      }
      continue;
    }
    kept.push(current);
  }
  if (line && !placed) kept.push(line);

  // The prefix keeps the byte order mark, if there is one; the suffix is the closing line.
  const prefix = /^﻿?---\r?\n/.exec(match[0])[0];
  const suffix = match[0].slice(prefix.length + match[1].length);
  return `${prefix}${kept.join(eol)}${suffix}${raw.slice(match[0].length)}`;
}
