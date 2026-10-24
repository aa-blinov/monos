import fs from 'fs';
import path from 'path';
import { NOTES_DIR } from './config.js';
import { writeFileAtomic } from './utils.js';

// The trash is a folder of the notes folder: `.trash/`, the name Obsidian uses for it. A note that is deleted moves
// there with its place in the folder tree intact (`Projects/Plan.md` rests at `.trash/Projects/Plan.md`) and gets a
// small file beside it that says where it came from and when it was deleted. Nothing about the trash lives only in
// the index, so deleting `notes.db` loses nothing; git carries the move, so a deletion reaches the other devices; and
// the export and the import skip the folder because it is hidden.

export const TRASH_NAME = '.trash';
export const SIDECAR_SUFFIX = '.trash.json';
const NOTE_EXTENSIONS = new Set(['.md', '.txt']);

export const trashRoot = () => path.join(NOTES_DIR, TRASH_NAME);
export const trashAppPrefix = () => `notes/${TRASH_NAME}`;

export const isNoteName = (name) => NOTE_EXTENSIONS.has(path.extname(name).toLowerCase());
export const isSidecarName = (name) => name.endsWith(SIDECAR_SUFFIX);
export const sidecarPathOf = (trashFile) => `${trashFile}${SIDECAR_SUFFIX}`;

/** The path of a file relative to the notes folder, with forward slashes; null when it is outside. */
export function notesRelative(fullPath) {
  const relative = path.relative(path.resolve(NOTES_DIR), path.resolve(fullPath));
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join('/');
}

/** Whether a path of the app (`notes/…`) names something in the trash. */
export function isTrashAppPath(appPath) {
  return String(appPath).startsWith(`${trashAppPrefix()}/`);
}

export function isInTrash(fullPath) {
  const relative = notesRelative(fullPath);
  return relative !== null && (relative === TRASH_NAME || relative.startsWith(`${TRASH_NAME}/`));
}

/** The place in the trash of a note that was at `relative` (relative to the notes folder). */
export const trashFileFor = (relative) => path.join(trashRoot(), ...relative.split('/'));

export function readSidecar(trashFile) {
  try {
    const parsed = JSON.parse(fs.readFileSync(sidecarPathOf(trashFile), 'utf-8'));
    const originalPath = typeof parsed?.originalPath === 'string' ? parsed.originalPath.replace(/^\/+/, '') : '';
    const trashedAt = typeof parsed?.trashedAt === 'string' && !Number.isNaN(Date.parse(parsed.trashedAt)) ? parsed.trashedAt : '';
    return { originalPath, trashedAt };
  } catch {
    return { originalPath: '', trashedAt: '' };
  }
}

export function writeSidecar(trashFile, { originalPath, trashedAt }) {
  writeFileAtomic(sidecarPathOf(trashFile), `${JSON.stringify({ originalPath, trashedAt }, null, 2)}\n`, 'utf-8');
}

export function removeSidecar(trashFile) {
  try { fs.unlinkSync(sidecarPathOf(trashFile)); } catch { /* none to remove */ }
}

/**
 * Where a note in the trash came from and when it went: from its sidecar, and for a file that has none (put there by
 * hand, or by Obsidian) from its place under `.trash` and its modification time.
 * @returns {{ originalApp: string, trashedAt: string } | null} null when the file is not in the trash
 */
export function trashInfo(fullPath) {
  const relative = notesRelative(fullPath);
  if (relative === null || !relative.startsWith(`${TRASH_NAME}/`)) return null;
  const inside = relative.slice(TRASH_NAME.length + 1);
  const sidecar = readSidecar(fullPath);
  let trashedAt = sidecar.trashedAt;
  if (!trashedAt) {
    try { trashedAt = fs.statSync(fullPath).mtime.toISOString(); } catch { trashedAt = new Date(0).toISOString(); }
  }
  return { originalApp: `notes/${sidecar.originalPath || inside}`, trashedAt };
}

/** Empty folders left in the trash after something was taken out of it, up to `.trash` itself. */
export function pruneEmptyTrashFolders(fromDir) {
  const root = path.resolve(trashRoot());
  let dir = path.resolve(fromDir);
  while (dir.startsWith(root + path.sep)) {
    try {
      if (fs.readdirSync(dir).length > 0) return;
      fs.rmdirSync(dir);
    } catch {
      return;
    }
    dir = path.dirname(dir);
  }
}

/** A name next to `target` that nothing uses: `name (2).ext`, `name (3).ext`. */
export function uniqueSibling(target) {
  if (!fs.existsSync(target)) return target;
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);
  let index = 2;
  let candidate = path.join(dir, `${base} (${index})${ext}`);
  while (fs.existsSync(candidate)) {
    index += 1;
    candidate = path.join(dir, `${base} (${index})${ext}`);
  }
  return candidate;
}

/** Every note in the trash, with the folder it was deleted from (absolute), for what has to read them in place. */
export function trashedNoteFiles() {
  const found = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(full);
      else if (isNoteName(entry.name) && !isSidecarName(entry.name)) {
        const info = trashInfo(full);
        if (info) found.push({ file: full, originalApp: info.originalApp, originalDir: path.dirname(path.join(NOTES_DIR, info.originalApp.slice('notes/'.length))) });
      }
    }
  };
  walk(trashRoot());
  return found;
}
