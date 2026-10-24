import fs from 'fs';
import path from 'path';
import { NOTES_DIR, ROOT_DIR } from './config.js';

// The app names every note from the root with a leading "notes/", whatever folder the notes are in:
// the default folder sits there, and a folder the person chose stands in for it.
const NOTES_PREFIX = 'notes';

export function relPath(absolutePath) {
  if (isPathInside(NOTES_DIR, absolutePath)) {
    const inside = path.relative(NOTES_DIR, absolutePath).replace(/\\/g, '/');
    return inside ? `${NOTES_PREFIX}/${inside}` : NOTES_PREFIX;
  }
  return path.relative(ROOT_DIR, absolutePath).replace(/\\/g, '/');
}

// The same path written in any of the ways a client can spell it ("./notes/a.md", "notes//a.md", "notes/a.md/",
// "notes/x/../a.md", backslashes) becomes one spelling, so an index lookup, the trash check and the lock check
// all see the one path the file really has.
function canonicalRequestPath(requestPath) {
  const normalized = path.posix.normalize(requestPath.replace(/\\/g, '/')).replace(/\/+$/, '');
  return normalized === '' ? '.' : normalized;
}

// The file a root-relative app path names. "notes/…" is inside the notes folder, wherever it is.
function fromRootPath(requestPath) {
  if (requestPath === NOTES_PREFIX) return NOTES_DIR;
  if (requestPath.startsWith(`${NOTES_PREFIX}/`)) return path.resolve(NOTES_DIR, requestPath.slice(NOTES_PREFIX.length + 1));
  return path.resolve(ROOT_DIR, requestPath);
}

// `code` is the stable word a client can act on; the message is for a person and may change.
export function httpError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.apiCode = code;
  return error;
}

// A name that merely starts with two dots ("..notes.md") is inside; only a step up ("../") is outside.
export function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

// Where a path really is on disk, its symlinks followed. A path that does not exist yet has none, so the nearest
// folder above it that exists stands in for it: a new file would be created there. Null when nothing exists
// between the path and the notes folder.
function nearestRealPath(target, notesRoot) {
  for (let current = target; ; current = path.dirname(current)) {
    try {
      return fs.realpathSync(current);
    } catch {
      if (current === notesRoot || path.dirname(current) === current) return null;
    }
  }
}

// The lexical check cannot see a symlink, and a symlink inside the folder can lead out of it.
function isRealPathInside(notesRoot, fullPath) {
  const real = nearestRealPath(fullPath, notesRoot);
  // Nothing exists on the way, so there is no link to follow.
  return real === null || isPathInside(fs.realpathSync(notesRoot), real);
}

/**
 * Hidden folders (`.git`, `.monos`, `.trash`) belong to git and to the app, never to a request: a write into
 * `.git/config` is code execution on the next git call, and a delete of `.git` is the loss of the history.
 * The app reaches its own files by their absolute paths and passes `allowHidden` where a route may name one.
 */
function hasHiddenSegment(notesRoot, fullPath) {
  return path.relative(notesRoot, fullPath).split(path.sep).some((segment) => segment.startsWith('.'));
}

export function resolveNotesPath(requestPath, { allowRoot = false, allowHidden = false } = {}) {
  if (typeof requestPath !== 'string' || requestPath.trim() === '') {
    throw httpError(400, 'Path required', 'path_required');
  }

  if (path.isAbsolute(requestPath)) {
    throw httpError(403, 'Path must be inside notes', 'outside_notes');
  }

  const canonical = canonicalRequestPath(requestPath);
  if (path.isAbsolute(canonical)) throw httpError(403, 'Path must be inside notes', 'outside_notes');
  const fullPath = fromRootPath(canonical);
  const notesRoot = path.resolve(NOTES_DIR);

  if (!isPathInside(notesRoot, fullPath) || (!allowRoot && fullPath === notesRoot)) {
    throw httpError(403, 'Path must be inside notes', 'outside_notes');
  }

  if (!allowHidden && hasHiddenSegment(notesRoot, fullPath)) {
    throw httpError(403, 'This folder is not available', 'hidden_path');
  }

  if (!isRealPathInside(notesRoot, fullPath)) {
    throw httpError(403, 'Path must be inside notes', 'outside_notes');
  }

  return fullPath;
}

/** A name for every segment of a path a request wants to create: the same rule as for the last one. */
export function assertCreatableSegments(relativePath) {
  for (const segment of String(relativePath).split(/[\\/]+/).filter(Boolean)) assertFileName(segment);
}

export function resolveNotesChildPath(requestPath = '', { allowRoot = true, forCreate = false } = {}) {
  if (typeof requestPath !== 'string') {
    throw httpError(400, 'Path required', 'path_required');
  }

  if (path.isAbsolute(requestPath)) {
    throw httpError(403, 'Path must be inside notes', 'outside_notes');
  }

  const fullPath = path.resolve(NOTES_DIR, requestPath);
  const notesRoot = path.resolve(NOTES_DIR);

  if (!isPathInside(notesRoot, fullPath) || (!allowRoot && fullPath === notesRoot)) {
    throw httpError(403, 'Path must be inside notes', 'outside_notes');
  }

  if (hasHiddenSegment(notesRoot, fullPath)) {
    throw httpError(403, 'This folder is not available', 'hidden_path');
  }

  if (forCreate) assertCreatableSegments(path.relative(notesRoot, fullPath));
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
  hidden: 'Name must not start with a dot',
  reserved: 'This name is reserved by the system',
  'too-long': 'Name is too long',
};

/** Какая именно проблема с именем, или null, если имя можно создать в любой ОС. */
export function fileNameProblem(name) {
  if (typeof name !== 'string' || name.trim() === '') return 'empty';
  if (FORBIDDEN_NAME_CHARS.test(name)) return 'forbidden-characters';
  if (/[. ]$/.test(name)) return 'edge-dot-or-space';
  // A name that starts with a dot is a hidden file: the indexer, the export and the folder walks all skip it,
  // so a note called that would be written and then never found again.
  if (name.startsWith('.')) return 'hidden';
  if (RESERVED_WINDOWS_NAME.test(name.replace(/\.[^.]*$/, ''))) return 'reserved';
  if (Buffer.byteLength(name, 'utf8') > MAX_NAME_BYTES) return 'too-long';
  return null;
}

export function assertFileName(name) {
  const problem = fileNameProblem(name);
  if (problem) throw httpError(400, NAME_PROBLEM_MESSAGES[problem], `name_${problem.replace(/-/g, '_')}`);
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

/**
 * Whether a file's bytes survive being read as text and written back: null when they do, otherwise why they do not.
 * `readTextFile` shows an invalid byte as U+FFFD and drops a NUL, so saving the text it returned would overwrite the
 * original bytes with that damage. UTF-16 and a UTF-8 byte order mark are read as the text they are, and are not a problem.
 */
export function textFileProblem(buffer) {
  if (buffer.length >= 2 && ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff))) return null;
  const sampleLength = Math.min(buffer.length, 4096);
  let evenNulls = 0;
  let oddNulls = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] !== 0) continue;
    if (index % 2 === 0) evenNulls += 1;
    else oddNulls += 1;
  }
  if (oddNulls > sampleLength / 8 && evenNulls < oddNulls / 4) return null;
  if (buffer.includes(0)) return 'nul-bytes';
  const body = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf ? buffer.subarray(3) : buffer;
  return Buffer.from(body.toString('utf-8'), 'utf-8').equals(body) ? null : 'not-utf8';
}

/**
 * The text of a note that is about to be written back. A file whose bytes the text cannot reproduce is refused (409,
 * `not_utf8` or `nul_bytes`): writing the text over it would replace what it could not read with U+FFFD.
 */
export function readTextForRewrite(filePath) {
  const buffer = fs.readFileSync(filePath);
  const problem = textFileProblem(buffer);
  if (problem) {
    throw httpError(409, 'The note is not valid UTF-8 text, so it was left unchanged', problem === 'nul-bytes' ? 'nul_bytes' : 'not_utf8');
  }
  return decodeTextBuffer(buffer);
}

export function readTextFile(filePath) {
  return decodeTextBuffer(fs.readFileSync(filePath));
}

export function textFileBuffer(content) {
  return Buffer.from(String(content || ''), 'utf-8');
}

/**
 * Writes `data` over `filePath` so that a failed write cannot destroy the old text. The new text goes to
 * `<file>.tmp` in the same folder (a rename across volumes is not atomic), is flushed to disk, and only then
 * is renamed over the file. A failure before the rename leaves the old file untouched and removes the temporary one.
 */
export function writeFileAtomic(filePath, data, encoding) {
  // A symlink is written through, as writeFileSync always did: the rename has to replace the file it points to.
  const target = fs.existsSync(filePath) ? fs.realpathSync(filePath) : filePath;
  const existing = fs.existsSync(target) ? fs.statSync(target) : null;
  // A rename needs write access to the folder, not to the file, so a read-only file would be replaced silently. Refuse it here.
  if (existing) fs.accessSync(target, fs.constants.W_OK);
  const tempPath = `${target}.tmp`;
  try {
    const fd = fs.openSync(tempPath, 'w');
    try {
      fs.writeFileSync(fd, data, encoding);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // A new file would get the default permissions; the old file's are kept.
    if (existing) fs.chmodSync(tempPath, existing.mode & 0o777);
    fs.renameSync(tempPath, target);
  } catch (error) {
    // Only the temporary file is removed. If it cannot be, the write error is still the one reported.
    try { fs.unlinkSync(tempPath); } catch { /* nothing to remove */ }
    throw error;
  }
  // fsync of the folder makes the rename itself durable: after a power cut the folder could still list the old file.
  // It is best effort. Windows cannot open a folder for fsync, and some file systems refuse it. The new text is
  // already in place by now, so an error here must not be reported as a failed save.
  try {
    const dirFd = fs.openSync(path.dirname(target), 'r');
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch { /* the rename is done; see above */ }
}

export function nowISO() {
  return new Date().toISOString();
}

/**
 * Blanks out code so `[[...]]` inside it is not mistaken for a wiki-link. Indented code (four
 * spaces or a tab after a blank line, and not inside a list) is blanked first, then fenced
 * blocks, then inline code spans. Blanked characters become spaces, so the text keeps its length
 * and its line structure.
 */
function stripCode(content) {
  return maskIndentedCode(String(content || ''))
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/~~~[\s\S]*?~~~/g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(`{2,})[^\n]*?\1/g, (span) => span.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (span) => span.replace(/[^\n]/g, ' '));
}

const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;

function maskIndentedCode(text) {
  const lines = text.split('\n');
  let inCode = false;
  let afterBlank = true;
  let inList = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') {
      afterBlank = true;
      continue;
    }
    if (!/^( {4}|\t)/.test(line)) {
      inCode = false;
      inList = LIST_ITEM.test(line);
      afterBlank = false;
      continue;
    }
    if (inCode || (afterBlank && !inList)) {
      inCode = true;
      lines[index] = line.replace(/./g, ' ');
    }
    afterBlank = false;
  }
  return lines.join('\n');
}

/**
 * The target of a wiki-link as typed: the text before the alias (`|`), trimmed and in NFC.
 * `[[Note#Heading]]` keeps its heading here; `linkNameCandidates` tells the note part apart.
 */
export function wikiLinkTarget(inner) {
  return String(inner).split('|')[0].trim().normalize('NFC');
}

/**
 * The names a link target can point at, most exact first: the whole target, then the part before
 * `#`, so `[[Note#Heading]]` finds `Note`, then the last part of a folder path, so Obsidian's
 * `[[Projects/Plan]]` finds `Plan`. A note whose own name has `#` (`Issue #42`) still resolves by
 * its full name.
 */
export function linkNameCandidates(target) {
  const hash = target.indexOf('#');
  const note = hash > 0 ? target.slice(0, hash) : target;
  const names = [target];
  if (hash > 0) names.push(note);
  const slash = note.lastIndexOf('/');
  if (slash > 0 && slash < note.length - 1) names.push(note.slice(slash + 1));
  return [...new Set(names)];
}

/** LIKE patterns (with `ESCAPE '\'`) for links that name the note through its folder: `Folder/name`, `Folder/name#…`. */
export function folderLinkPatterns(name) {
  const escaped = name.replace(/[\\%_]/g, '\\$&');
  return [`%/${escaped}`, `%/${escaped}#%`];
}

const LINE_TERMINATOR = /[\n\r\u2028\u2029]/g;

/**
 * The `[[…]]` spans of a text, as `/\[\[(.*?)\]\]/g` finds them, in one pass. The regular expression retries every `[[`
 * against the rest of the line, so a line of `[[` or `[[a]` repeated took seconds to save (the work grew with the
 * square of the line). Here the next `]]` and the next line break are looked up once and reused: a `[[` that cannot
 * close before the line ends rules out every `[[` before that line break too.
 * @returns {Iterable<{ index: number, length: number, inner: string }>}
 */
export function* wikiLinkSpans(text) {
  let position = 0;
  let nextClose = -2;
  let nextBreak = -2;
  while (position < text.length) {
    const open = text.indexOf('[[', position);
    if (open === -1) return;
    if (nextClose !== -1 && nextClose < open + 2) nextClose = text.indexOf(']]', open + 2);
    if (nextClose === -1) return;
    if (nextBreak !== -1 && nextBreak < open + 2) {
      LINE_TERMINATOR.lastIndex = open + 2;
      const found = LINE_TERMINATOR.exec(text);
      nextBreak = found ? found.index : -1;
    }
    if (nextBreak !== -1 && nextBreak < nextClose) {
      position = nextBreak + 1;
      continue;
    }
    yield { index: open, length: nextClose + 2 - open, inner: text.slice(open + 2, nextClose) };
    position = nextClose + 2;
  }
}

export function extractWikiLinks(content) {
  const links = [];
  for (const span of wikiLinkSpans(stripCode(content))) {
    const target = wikiLinkTarget(span.inner);
    // `[[#Heading]]` points into the same note, so it links to no other note.
    if (target && !target.startsWith('#')) links.push(target);
  }
  return links;
}

/** Every name a wiki-link can use to reach a note, in NFC: its file name, its title and its aliases. */
export function noteLinkNames(note, aliases = []) {
  const file = String(note.name_nfc || note.name || '').normalize('NFC').replace(/\.md$/i, '');
  const title = String(note.title || '').trim().normalize('NFC');
  return [...new Set([file, title, ...aliases.map((alias) => alias.normalize('NFC'))].filter(Boolean))];
}

/** A LIKE pattern (with `ESCAPE '\'`) for links to `name` followed by a heading: `name#…`. */
export function headingLinkPattern(name) {
  return `${name.replace(/[\\%_]/g, '\\$&')}#%`;
}

/**
 * Points every `[[oldName]]` and `[[oldName|alias]]` at `newName`. The alias, the spaces
 * around the name and anything in code stay as they are. Only the exact name changes:
 * `[[oldName Notes]]` is another note and is left alone. A target with code inside it is
 * left alone too. Returns the new text and how many links changed.
 * With `onlyFolder` (the folder of the renamed note, relative to the notes folder) only the links that name the note
 * through that folder change: `[[Folder/Old]]` is this note whatever else is called `Old`, but a bare `[[Old]]` may be
 * meant for the other note that answers to the name.
 */
export function rewriteWikiTargets(content, oldName, newName, { onlyFolder = null } = {}) {
  const text = String(content || '');
  const source = stripCode(text);
  const wanted = String(oldName).normalize('NFC');
  const replacement = String(newName).normalize('NFC');
  let out = '';
  let last = 0;
  let count = 0;

  for (const span of wikiLinkSpans(source)) {
    const match = { index: span.index, 0: source.slice(span.index, span.index + span.length), 1: span.inner };
    const start = match.index + 2;
    const inner = text.slice(start, start + match[1].length);
    const pipe = inner.indexOf('|');
    const rawTarget = pipe === -1 ? inner : inner.slice(0, pipe);
    if (source.slice(start, start + rawTarget.length) !== rawTarget) continue;
    // The name is the part before `#`, matched exactly as links resolve: `[[Note #h]]` is not `Note`.
    const trimmed = rawTarget.trim();
    const hash = trimmed.indexOf('#');
    const namePart = hash === -1 ? trimmed : trimmed.slice(0, hash);
    // `[[Projects/Old]]` names `Old` through its folder: only the last part changes, the folder stays.
    const slash = namePart.lastIndexOf('/');
    const wholeName = namePart.normalize('NFC') === wanted;
    const folderedName = !wholeName && slash > 0 && slash < namePart.length - 1
      && namePart.slice(slash + 1).normalize('NFC') === wanted;
    if (!wholeName && !folderedName) continue;
    if (onlyFolder !== null) {
      const linkFolder = folderedName ? namePart.slice(0, slash).normalize('NFC') : null;
      const mine = String(onlyFolder).normalize('NFC');
      if (linkFolder === null || !(mine === linkFolder || mine.endsWith(`/${linkFolder}`))) continue;
    }
    const folder = folderedName ? namePart.slice(0, slash + 1) : '';
    const leading = rawTarget.match(/^\s*/)[0];
    const trailing = rawTarget.slice(leading.length + trimmed.length);
    const heading = hash === -1 ? '' : trimmed.slice(hash);
    const rest = pipe === -1 ? '' : inner.slice(pipe);
    out += `${text.slice(last, match.index)}[[${leading}${folder}${replacement}${heading}${trailing}${rest}]]`;
    last = match.index + match[0].length;
    count += 1;
  }

  if (count === 0) return { content: text, count };
  return { content: out + text.slice(last), count };
}

/**
 * Runs `replacer` on each match of `pattern` that lies outside code. The replacer gets the matched
 * text and its groups, and returns the new text, or null to leave the match alone. Returns the new
 * text and how many matches changed.
 */
export function replaceOutsideCode(content, pattern, replacer) {
  const text = String(content || '');
  const source = stripCode(text);
  let out = '';
  let last = 0;
  let count = 0;
  for (const match of source.matchAll(pattern)) {
    const original = text.slice(match.index, match.index + match[0].length);
    if (original !== match[0]) continue;
    const replacement = replacer(original, ...match.slice(1));
    if (replacement === null || replacement === undefined) continue;
    out += `${text.slice(last, match.index)}${replacement}`;
    last = match.index + original.length;
    count += 1;
  }
  if (count === 0) return { content: text, count };
  return { content: out + text.slice(last), count };
}

const FRONTMATTER_BLOCK = /^﻿?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
const WIKI_LINK_BLOCK = /\[\[[^\]\n]*\]\]/g;
const MARKDOWN_LINK_BLOCK = /!?\[[^\]\n]*\]\([^)\n]*\)/g;
const BARE_URL = /https?:\/\/[^\s<>()]+/g;
const HTML_TAG = /<[^>\n]*>/g;
const blankOut = (text) => text.replace(/[^\n]/g, ' ');

/**
 * The text as a reader sees it when looking for mentions. Frontmatter, code, wiki-links, markdown
 * link targets, bare URLs and HTML tags are blanked out, so a match is prose and nothing else.
 * Blanking keeps the length and the line breaks: an index found here is the same index in the
 * original text.
 */
export function plainTextForMentions(content) {
  const text = String(content || '').replace(FRONTMATTER_BLOCK, blankOut);
  return stripCode(text)
    .replace(WIKI_LINK_BLOCK, blankOut)
    .replace(MARKDOWN_LINK_BLOCK, blankOut)
    .replace(BARE_URL, blankOut)
    .replace(HTML_TAG, blankOut);
}

/**
 * A pattern that finds `phrase` as whole words, ignoring case, in either Unicode form: names on
 * disk are decomposed (NFD) and typed text is composed (NFC).
 */
export function phraseRegExp(phrase) {
  const forms = [...new Set([String(phrase).normalize('NFC'), String(phrase).normalize('NFD')])]
    .map((form) => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:${forms.join('|')})(?![\\p{L}\\p{M}\\p{N}_])`, 'iu');
}

/**
 * Links the first prose mention of `phrase` to the note `linkText`. The mention keeps its own
 * spelling: `project plan` becomes `[[Project plan|project plan]]`. Returns the new text and how
 * many mentions were linked (0 or 1).
 */
export function linkFirstMention(content, phrase, linkText) {
  const text = String(content || '');
  const match = phraseRegExp(phrase).exec(plainTextForMentions(text));
  if (!match) return { content: text, count: 0 };
  const start = match.index;
  const end = start + match[0].length;
  const original = text.slice(start, end);
  const sameName = original.normalize('NFC') === String(linkText).normalize('NFC');
  const link = sameName ? `[[${linkText}]]` : `[[${linkText}|${original}]]`;
  return { content: text.slice(0, start) + link + text.slice(end), count: 1 };
}

export function humanSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, index)).toFixed(1) + ' ' + units[index];
}

/**
 * The app path (`notes/…`) a request path names, in its one canonical spelling, or null when it does not name a place
 * under the notes folder. Hidden folders are not refused here: this is for looking a path up (is it in the trash?),
 * and `resolveNotesPath` is what decides whether a request may touch the file.
 */
export function canonicalAppPath(requestPath) {
  if (typeof requestPath !== 'string' || requestPath.trim() === '' || path.isAbsolute(requestPath)) return null;
  const canonical = canonicalRequestPath(requestPath);
  if (canonical !== NOTES_PREFIX && !canonical.startsWith(`${NOTES_PREFIX}/`)) return null;
  return canonical;
}
