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

// The file a root-relative app path names. "notes/…" is inside the notes folder, wherever it is.
function fromRootPath(requestPath) {
  if (requestPath === NOTES_PREFIX) return NOTES_DIR;
  if (requestPath.startsWith(`${NOTES_PREFIX}/`)) return path.resolve(NOTES_DIR, requestPath.slice(NOTES_PREFIX.length + 1));
  return path.resolve(ROOT_DIR, requestPath);
}

export function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// A name that merely starts with two dots ("..notes.md") is inside; only a step up ("../") is outside.
export function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function resolveNotesPath(requestPath, { allowRoot = false } = {}) {
  if (typeof requestPath !== 'string' || requestPath.trim() === '') {
    throw httpError(400, 'Path required');
  }

  if (path.isAbsolute(requestPath)) {
    throw httpError(403, 'Path must be inside notes');
  }

  const fullPath = fromRootPath(requestPath);
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

export function extractWikiLinks(content) {
  const re = /\[\[(.*?)\]\]/g;
  const links = [];
  const source = stripCode(content);
  let match;

  while ((match = re.exec(source)) !== null) {
    const target = wikiLinkTarget(match[1]);
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
