const BOM = '\uFEFF';

function quoteYamlString(value) {
  return JSON.stringify(String(value || ''));
}

function formatTags(tags = []) {
  return `[${tags.map((tag) => quoteYamlString(tag)).join(', ')}]`;
}

function splitFrontmatter(content) {
  const rawContent = String(content || '');
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

export function upsertFrontmatter(content, metadata = {}) {
  const { frontmatter, body } = splitFrontmatter(content);
  const { bom, eol } = fileConventions(content);
  const reservedKeys = new Set(RESERVED_KEYS);
  const preservedLines = frontmatter
    .split(/\r?\n/)
    .filter((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) return line.trim();
      return !reservedKeys.has(line.slice(0, separatorIndex).trim().toLowerCase());
    });

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
