import fs from 'fs';
import path from 'path';
import { NOTES_DIR, ROOT_DIR } from './config.js';

export function relPath(absolutePath) {
  return path.relative(ROOT_DIR, absolutePath).replace(/\\/g, '/');
}

export function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveNotesPath(requestPath, { allowRoot = false } = {}) {
  if (typeof requestPath !== 'string' || requestPath.trim() === '') {
    throw httpError(400, 'Path required');
  }

  if (path.isAbsolute(requestPath)) {
    throw httpError(403, 'Path must be inside notes');
  }

  const fullPath = path.resolve(ROOT_DIR, requestPath);
  const notesRoot = path.resolve(NOTES_DIR);

  if (!isPathInside(notesRoot, fullPath) || (!allowRoot && fullPath === notesRoot)) {
    throw httpError(403, 'Path must be inside notes');
  }

  return fullPath;
}

export function resolveNotesChildPath(requestPath = '', { allowRoot = true } = {}) {
  if (typeof requestPath !== 'string') {
    throw httpError(400, 'Path required');
  }

  if (path.isAbsolute(requestPath)) {
    throw httpError(403, 'Path must be inside notes');
  }

  const fullPath = path.resolve(NOTES_DIR, requestPath);
  const notesRoot = path.resolve(NOTES_DIR);

  if (!isPathInside(notesRoot, fullPath) || (!allowRoot && fullPath === notesRoot)) {
    throw httpError(403, 'Path must be inside notes');
  }

  return fullPath;
}

/**
 * The app addresses a note from ROOT_DIR ("notes/…"); git addresses the very
 * same note from NOTES_DIR. A route that receives the app's path and hands it
 * to git has to translate, or it looks for notes/notes/… and finds nothing.
 */
export function notesRelativePath(rootRelativePath) {
  return path.relative(NOTES_DIR, resolveNotesPath(rootRelativePath)).replace(/\\/g, '/');
}

// Имена заметок, папок и вложений — только то, что создаст любая ОС. Берём самые
// строгие правила (Windows): если там не открывается, то и здесь не создаём.
// Пользователь получает понятный отказ, а не тихую замену символов.
const FORBIDDEN_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f\u007f]/;
const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const MAX_NAME_BYTES = 200;

export const FORBIDDEN_NAME_CHARACTERS = '< > : " / \\ | ? *';

const NAME_PROBLEM_MESSAGES = {
  empty: 'Name required',
  'forbidden-characters': `Name must not contain these characters: ${FORBIDDEN_NAME_CHARACTERS}`,
  'edge-dot-or-space': 'Name must not end with a dot or a space',
  reserved: 'This name is reserved by the system',
  'too-long': 'Name is too long',
};

/** Какая именно проблема с именем, или null, если имя можно создать в любой ОС. */
export function fileNameProblem(name) {
  if (typeof name !== 'string' || name.trim() === '') return 'empty';
  if (FORBIDDEN_NAME_CHARS.test(name)) return 'forbidden-characters';
  if (/[. ]$/.test(name)) return 'edge-dot-or-space';
  if (RESERVED_WINDOWS_NAME.test(name.replace(/\.[^.]*$/, ''))) return 'reserved';
  if (Buffer.byteLength(name, 'utf8') > MAX_NAME_BYTES) return 'too-long';
  return null;
}

export function assertFileName(name) {
  const problem = fileNameProblem(name);
  if (problem) throw httpError(400, NAME_PROBLEM_MESSAGES[problem]);
  return name;
}

/** Для имён, которые придумывает сама программа: запрещённое заменяем, сохранение не падает. */
export function toSafeFileName(name, fallback = 'note') {
  const cleaned = String(name || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_')
    .replace(/[. ]+$/, '');
  return cleaned || fallback;
}

export function safePathName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw httpError(400, 'Name required');
  }

  if (name !== path.basename(name)) {
    throw httpError(400, 'Name must not include path separators');
  }

  return assertFileName(name);
}

export function decodeTextBuffer(buffer) {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      const swapped = Buffer.alloc(buffer.length - 2);
      for (let index = 2; index + 1 < buffer.length; index += 2) {
        swapped[index - 2] = buffer[index + 1];
        swapped[index - 1] = buffer[index];
      }
      return swapped.toString('utf16le');
    }
  }

  const sampleLength = Math.min(buffer.length, 4096);
  let evenNulls = 0;
  let oddNulls = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] !== 0) continue;
    if (index % 2 === 0) evenNulls += 1;
    else oddNulls += 1;
  }

  if (oddNulls > sampleLength / 8 && evenNulls < oddNulls / 4) return buffer.toString('utf16le');

  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf-8');
  }
  return buffer.toString('utf-8').replace(/\u0000/g, '');
}

export function readTextFile(filePath) {
  return decodeTextBuffer(fs.readFileSync(filePath));
}

export function textFileBuffer(content) {
  return Buffer.from(String(content || ''), 'utf-8');
}

export function nowISO() {
  return new Date().toISOString();
}

/**
 * Strips fenced and inline code so `[[...]]` inside them is not mistaken for a
 * wiki-link. Shell `[[ -n "$X" ]]` tests live in the backup scripts and were
 * being indexed as six phantom links to notes that do not exist. Stripped
 * characters become spaces so line structure survives.
 */
function stripCode(content) {
  return String(content || '')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/~~~[\s\S]*?~~~/g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (span) => span.replace(/[^\n]/g, ' '));
}

export function extractWikiLinks(content) {
  const re = /\[\[(.*?)\]\]/g;
  const links = [];
  const source = stripCode(content);
  let match;

  while ((match = re.exec(source)) !== null) {
    links.push(match[1].split('|')[0].trim());
  }

  return links;
}

/**
 * Points every `[[oldName]]` and `[[oldName|alias]]` at `newName`. The alias, the spaces
 * around the name and anything in code stay as they are. Only the exact name changes:
 * `[[oldName Notes]]` is another note and is left alone. Returns the new text and how
 * many links changed.
 */
export function rewriteWikiTargets(content, oldName, newName) {
  const text = String(content || '');
  const source = stripCode(text);
  const wanted = String(oldName).normalize('NFC');
  const replacement = String(newName).normalize('NFC');
  let out = '';
  let last = 0;
  let count = 0;

  for (const match of source.matchAll(/\[\[(.*?)\]\]/g)) {
    const inner = match[1];
    // A link with code inside it was masked in `source`, so its text differs; leave it alone.
    if (text.slice(match.index + 2, match.index + 2 + inner.length) !== inner) continue;
    const pipe = inner.indexOf('|');
    const rawTarget = pipe === -1 ? inner : inner.slice(0, pipe);
    if (rawTarget.trim().normalize('NFC') !== wanted) continue;
    const leading = rawTarget.match(/^\s*/)[0];
    const trailing = rawTarget.slice(rawTarget.trimEnd().length);
    const rest = pipe === -1 ? '' : inner.slice(pipe);
    out += `${text.slice(last, match.index)}[[${leading}${replacement}${trailing}${rest}]]`;
    last = match.index + match[0].length;
    count += 1;
  }

  if (count === 0) return { content: text, count };
  return { content: out + text.slice(last), count };
}

export function humanSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, index)).toFixed(1) + ' ' + units[index];
}
