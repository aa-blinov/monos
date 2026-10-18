import fs from 'fs';
import path from 'path';
import { replaceOutsideCode } from './utils.js';

/**
 * After an archive is unpacked, point every note's pictures and files at where they now are.
 *
 * Archives from other apps keep their files in their own way: Joplin in `_resources/<id>.png` with links such as
 * `![](:/<id>)` or `../_resources/<id>.png`, Obsidian in any folder with `![[name.png]]`, Notion in a folder named
 * after the note with percent-encoded paths. Left as they are, the links break (a file renamed because the name was
 * taken, a link by id, a folder that moved), and the editor only shows files from a note's own `_attachments`.
 *
 * Each reference is found by its path in the archive, then by Joplin's id, then by file name. The file is put in
 * `<note folder>/_attachments/` and the reference rewritten to it. A file no note mentions any longer is removed
 * from its old place. What cannot be found is left untouched and reported.
 */
const ATTACHMENTS_DIR = '_attachments';
const FILE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|pdf)$/i;
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg)$/i;
const MARKDOWN_REFERENCE = /(!?)\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)((?:\s+"[^"]*")?)\s*\)/g;
const EMBED_REFERENCE = /!\[\[([^\]|#\n]+?)(?:\|([^\]\n]*))?\]\]/g;
const HTML_IMAGE = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi;

const posix = (value) => value.split(path.sep).join('/');
const safeName = (name) => path.basename(name).replace(/[^\p{L}\p{N}._ -]+/gu, '-').trim() || 'file';

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

/**
 * @param {object} args
 * @param {string} args.notesRoot absolute notes folder
 * @param {string[]} args.notes absolute paths of the imported notes
 * @param {Map<string,string>} args.files archive path (posix, as unpacked) -> absolute path of the imported file
 * @returns {{ relinked: number, unresolved: string[], moved: number }}
 */
export function relinkImportedNotes({ notesRoot, notes, files }) {
  const byArchivePath = new Map();
  const byBaseName = new Map();
  const byId = new Map();
  for (const [archivePath, abs] of files) {
    if (!FILE_EXTENSIONS.test(abs)) continue;
    byArchivePath.set(archivePath.toLowerCase(), abs);
    const base = path.basename(archivePath).toLowerCase();
    byBaseName.set(base, [...(byBaseName.get(base) || []), abs]);
    byId.set(path.basename(base, path.extname(base)), abs);
  }

  function resolve(rawTarget, noteDir) {
    if (/^(https?:|data:|mailto:|#|\/\/)/i.test(String(rawTarget).trim())) return null;
    const target = decodeTarget(rawTarget);
    if (!target) return null;
    const joplin = /^:\/([0-9a-f]{16,})$/i.exec(target);
    if (joplin) return byId.get(joplin[1].toLowerCase()) || null;
    const absolute = path.resolve(noteDir, target);
    const archivePath = posix(path.relative(notesRoot, absolute)).toLowerCase();
    if (byArchivePath.has(archivePath)) return byArchivePath.get(archivePath);
    const candidates = byBaseName.get(path.basename(target).toLowerCase()) || [];
    if (candidates.length === 0) return null;
    // Several files of that name: the one nearest the note.
    return candidates.slice().sort((a, b) => (
      path.relative(noteDir, a).split(path.sep).length - path.relative(noteDir, b).split(path.sep).length
    ))[0];
  }

  const placed = new Map(); // `${source}|${noteDir}` -> destination
  const sources = new Set();
  function place(source, noteDir) {
    const key = `${source}|${noteDir}`;
    if (placed.has(key)) return placed.get(key);
    const dir = path.join(noteDir, ATTACHMENTS_DIR);
    let destination;
    if (path.dirname(source) === dir) {
      destination = source;
    } else {
      fs.mkdirSync(dir, { recursive: true });
      const name = safeName(source);
      const ext = path.extname(name);
      const base = path.basename(name, ext);
      destination = path.join(dir, name);
      let index = 2;
      const data = fs.readFileSync(source);
      // The same bytes under the same name are the same file; a different file takes the next free name.
      while (fs.existsSync(destination) && !fs.readFileSync(destination).equals(data)) {
        destination = path.join(dir, `${base}-${index}${ext}`);
        index += 1;
      }
      if (!fs.existsSync(destination)) fs.writeFileSync(destination, data);
      sources.add(source);
    }
    placed.set(key, destination);
    return destination;
  }

  const unresolved = [];
  let relinked = 0;
  const texts = new Map();

  for (const notePath of notes) {
    const noteDir = path.dirname(notePath);
    let text = fs.readFileSync(notePath, 'utf-8');
    const before = text;
    const href = (destination) => encodeURI(`${ATTACHMENTS_DIR}/${path.basename(destination)}`);

    text = replaceOutsideCode(text, MARKDOWN_REFERENCE, (whole, bang, label, rawTarget, title) => {
      const source = resolve(rawTarget, noteDir);
      if (!source) {
        if (bang && !/^(https?:|data:|mailto:|#)/i.test(rawTarget.trim()) && IMAGE_EXTENSIONS.test(decodeTarget(rawTarget)) || /^:\//.test(rawTarget.trim())) {
          unresolved.push(`${path.basename(notePath)}: ${decodeTarget(rawTarget)}`);
        }
        return null;
      }
      if (!bang && !FILE_EXTENSIONS.test(source)) return null;
      relinked += 1;
      return `${bang}[${label}](${href(place(source, noteDir))}${title})`;
    }).content;

    text = replaceOutsideCode(text, EMBED_REFERENCE, (whole, target, size) => {
      const source = resolve(target.trim(), noteDir);
      if (!source) return null;
      relinked += 1;
      const destination = place(source, noteDir);
      // A picture becomes an ordinary image (its `|300` size is dropped); a PDF stays an embed by name.
      return IMAGE_EXTENSIONS.test(destination)
        ? `![${size && !/^\d+(x\d+)?$/.test(size) ? size : ''}](${href(destination)})`
        : `![[${path.basename(destination)}]]`;
    }).content;

    text = replaceOutsideCode(text, HTML_IMAGE, (whole, head, quote, src) => {
      const source = resolve(src, noteDir);
      if (!source) return null;
      relinked += 1;
      return `${head}${quote}${href(place(source, noteDir))}${quote}`;
    }).content;

    if (text !== before) fs.writeFileSync(notePath, text, 'utf-8');
    texts.set(notePath, text);
  }

  // A file nothing mentions any more has been moved, not copied: take it from its old place.
  let moved = 0;
  // The references written just now point at the copies; only mentions that are left by name count.
  const allText = [...texts.values()].join('\n').toLowerCase().replaceAll(`${ATTACHMENTS_DIR}/`, '\u0000');
  for (const source of sources) {
    const name = path.basename(source).toLowerCase();
    const mentioned = [name, encodeURI(name).toLowerCase()].some((needle) => {
      let at = allText.indexOf(needle);
      while (at >= 0) {
        if (allText[at - 1] !== '\u0000') return true;
        at = allText.indexOf(needle, at + 1);
      }
      return false;
    });
    if (mentioned) continue;
    try {
      fs.unlinkSync(source);
      moved += 1;
      let dir = path.dirname(source);
      while (dir !== notesRoot && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
        dir = path.dirname(dir);
      }
    } catch {
      // Left where it was: harmless.
    }
  }

  return { relinked, unresolved: [...new Set(unresolved)], moved };
}
