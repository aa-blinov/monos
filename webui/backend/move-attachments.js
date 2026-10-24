import fs from 'fs';
import path from 'path';
import { isLockedNote } from './note-lock.js';
import { isPathInside, readTextFile, replaceOutsideCode, writeFileAtomic } from './utils.js';

// A note's pictures live in the `_attachments` folder next to it, and the note points at them with relative links.
// Moving the note to another folder leaves them behind, so every picture would break. After a move the files the
// note shows are carried to the new folder (and the links rewritten when a name was taken there), and a file that no
// other note uses any more is taken from the old place: a move, not a copy, when nothing else needs the original.

const ATTACHMENTS_DIR = '_attachments';
const FILE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|pdf)$/i;
const MARKDOWN_REFERENCE = /(!?)\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)((?:\s+"[^"]*")?)\s*\)/g;
const EMBED_REFERENCE = /(!?)\[\[([^\]|#\n]+?)((?:\|[^\]\n]*)?)\]\]/g;
const HTML_IMAGE = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi;

function decodeTarget(raw) {
  let target = String(raw).trim().replace(/^<|>$/g, '');
  target = target.split('#')[0].split('?')[0];
  try {
    target = decodeURI(target);
  } catch {
    // A malformed escape is still a path we can try as written.
  }
  return target;
}

const isRelativeTarget = (raw) => !/^(?:[a-z][a-z0-9+.-]*:|#|\/\/|\/)/i.test(String(raw).trim().replace(/^</, ''));

function isFile(full) {
  try { return fs.statSync(full).isFile(); } catch { return false; }
}

function sameBytes(left, right) {
  try { return fs.readFileSync(left).equals(fs.readFileSync(right)); } catch { return false; }
}

// Whether any note that is still there writes the file's name: the file is shared, and stays where it is.
function stillUsed(file, ignoring) {
  const owner = path.dirname(path.dirname(file));
  const names = [path.basename(file), encodeURI(path.basename(file))];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === ATTACHMENTS_DIR || entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (walk(full)) return true;
      } else if (/\.(md|markdown|txt)$/i.test(entry.name) && !ignoring.has(full)) {
        let text;
        try { text = readTextFile(full); } catch { continue; }
        if (names.some((name) => text.includes(name))) return true;
      }
    }
    return false;
  };
  return walk(owner);
}

/**
 * After a note moved from `oldNoteFull` to `newNoteFull`: carries its pictures and files along.
 * `moved` describes a folder move that took the note with it (`{ from, to }`, absolute): files inside the moved
 * folder moved with it and are not touched.
 * @returns {{ carried: number }} how many files were put into the new folder's `_attachments`
 */
export function carryNoteAttachments({ oldNoteFull, newNoteFull, moved = null, keep = new Set() }) {
  const oldDir = path.dirname(oldNoteFull);
  const newDir = path.dirname(newNoteFull);
  if (path.resolve(oldDir) === path.resolve(newDir)) return { carried: 0 };
  let text;
  try {
    text = readTextFile(newNoteFull);
  } catch {
    return { carried: 0 };
  }
  // A sealed note shows nothing the app can read: its pictures stay where they are.
  if (isLockedNote(text)) return { carried: 0 };

  // Where a file the note meant by `target` (from the old place) is now: inside a moved folder it moved with it.
  const whereNow = (oldAbsolute) => {
    if (moved && isPathInside(moved.from, oldAbsolute)) return path.join(moved.to, path.relative(moved.from, oldAbsolute));
    return oldAbsolute;
  };

  let carried = 0;
  const sources = new Set();
  const placed = new Map();
  // The file in the new folder's `_attachments` that stands for `source`: the same bytes under the same name are the
  // same file, a different file that has the name takes the next free one.
  const place = (source) => {
    if (placed.has(source)) return placed.get(source);
    const dir = path.join(newDir, ATTACHMENTS_DIR);
    let destination = path.join(dir, path.basename(source));
    if (path.resolve(path.dirname(source)) === path.resolve(dir)) {
      placed.set(source, destination);
      return source;
    }
    const ext = path.extname(destination);
    const base = path.basename(destination, ext);
    let index = 2;
    while (fs.existsSync(destination) && !sameBytes(source, destination)) {
      destination = path.join(dir, `${base}-${index}${ext}`);
      index += 1;
    }
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(source, destination);
      carried += 1;
    }
    sources.add(source);
    placed.set(source, destination);
    return destination;
  };

  const href = (destination) => encodeURI(`${ATTACHMENTS_DIR}/${path.basename(destination)}`);
  // A target that already reaches the same file from the new folder needs nothing.
  const carryTarget = (rawTarget) => {
    if (!isRelativeTarget(rawTarget)) return null;
    const target = decodeTarget(rawTarget);
    if (!target || !FILE_EXTENSIONS.test(target)) return null;
    const source = whereNow(path.resolve(oldDir, target));
    if (!isFile(source)) return null;
    const reachable = path.resolve(newDir, target);
    if (isFile(reachable) && path.resolve(reachable) === path.resolve(source)) return null;
    return place(source);
  };

  let next = replaceOutsideCode(text, MARKDOWN_REFERENCE, (whole, bang, label, rawTarget, title) => {
    const destination = carryTarget(rawTarget);
    return destination ? `${bang}[${label}](${href(destination)}${title})` : null;
  }).content;

  next = replaceOutsideCode(next, HTML_IMAGE, (whole, head, quote, src) => {
    const destination = carryTarget(src);
    return destination ? `${head}${quote}${href(destination)}${quote}` : null;
  }).content;

  // `![[name.png]]` and `[[name.pdf]]` name a file of the note's own `_attachments` folder.
  next = replaceOutsideCode(next, EMBED_REFERENCE, (whole, bang, name, alias) => {
    const trimmed = name.trim();
    if (!FILE_EXTENSIONS.test(trimmed) || trimmed.includes('/')) return null;
    const source = whereNow(path.join(oldDir, ATTACHMENTS_DIR, trimmed));
    if (!isFile(source)) return null;
    const reachable = path.join(newDir, ATTACHMENTS_DIR, trimmed);
    if (isFile(reachable) && sameBytes(reachable, source)) return null;
    const destination = place(source);
    return `${bang}[[${path.basename(destination)}${alias}]]`;
  }).content;

  if (next !== text) writeFileAtomic(newNoteFull, next, 'utf-8');

  // The originals nothing else shows any more go from the old place; one another note shows stays for it.
  const gone = new Set([...keep, oldNoteFull]);
  for (const source of sources) {
    if (path.basename(path.dirname(source)) !== ATTACHMENTS_DIR) continue;
    if (stillUsed(source, gone)) continue;
    try {
      fs.unlinkSync(source);
      const dir = path.dirname(source);
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {
      // Left where it was: harmless.
    }
  }
  return { carried };
}
