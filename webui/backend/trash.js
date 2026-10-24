import fs from 'fs';
import path from 'path';
import { NOTES_DIR } from './config.js';
import { removeNoteFromFts } from './fts.js';
import { removeFolderConfig } from './folder-config.js';
import { relocateIndexRows } from './index-rows.js';
import { indexDirectoryTree, indexFile } from './indexing.js';
import { isLockedNote, moveSession } from './note-lock.js';
import { namedReferences, referencedPaths } from './attachment-scan.js';
import {
  TRASH_NAME,
  isNoteName,
  isSidecarName,
  notesRelative,
  pruneEmptyTrashFolders,
  removeSidecar,
  trashFileFor,
  trashInfo,
  uniqueSibling,
  writeSidecar,
} from './trash-store.js';
import { httpError, nowISO, readTextFile, relPath } from './utils.js';

// The operations on the trash (see trash-store.js for what the trash is). Every one of them moves files first and
// then brings the index in step, so an index that is lost or half-written changes nothing about what is trashed.

const FOLDER_RESERVED = new Set(['', '.', '..']);
const posixDirname = (value) => path.posix.dirname(value);

const parentOf = (appPath) => posixDirname(appPath).replace(/\\/g, '/');
const fullOf = (appPath) => path.join(NOTES_DIR, ...appPath.replace(/^notes\/?/, '').split('/').filter(Boolean));

/** The row of a note in the trash that this path names: its place in the trash, or the path it was deleted from. */
export function findTrashedRow(db, appPath) {
  return db.prepare(`
    SELECT * FROM notes_index
    WHERE is_dir = 0 AND trashed_at IS NOT NULL AND trashed_at != '' AND (path = ? OR original_path = ?)
    ORDER BY CASE WHEN path = ? THEN 0 ELSE 1 END, trashed_at DESC
    LIMIT 1
  `).get(appPath, appPath, appPath);
}

/** Forgets the rows of a path and of everything below it, in the index and in the text index. */
export function forgetIndexRows(db, appPath) {
  const family = db.prepare("SELECT path FROM notes_index WHERE path = ? OR path LIKE ? || '/%'").all(appPath, appPath);
  db.prepare("DELETE FROM notes_index WHERE path = ? OR path LIKE ? || '/%'").run(appPath, appPath);
  for (const row of family) {
    try { removeNoteFromFts(db, row.path); } catch { /* a missing text index must not stop a delete */ }
  }
}

const stampOf = (iso) => String(iso).slice(0, 19).replace('T', ' ').replace(/:/g, '.');

// A second note deleted from the same place finds the first one at its spot. The first moves aside under a name that
// says when it was deleted, so the trash never holds two notes that were both "Plan" from the same folder: the
// trash list is keyed by where a note came from, and a restore must not have to guess which one is meant.
function displaceOlderTwin(db, occupied) {
  const info = trashInfo(occupied);
  const ext = path.extname(occupied);
  const stem = path.basename(occupied, ext);
  const aside = uniqueSibling(path.join(path.dirname(occupied), `${stem} (deleted ${stampOf(info.trashedAt)})${ext}`));
  fs.renameSync(occupied, aside);
  const folder = info.originalApp.replace(/^notes\//, '');
  const originalRel = `${posixDirname(folder) === '.' ? '' : `${posixDirname(folder)}/`}${path.basename(aside)}`;
  removeSidecar(occupied);
  writeSidecar(aside, { originalPath: originalRel, trashedAt: info.trashedAt });
  const from = relPath(occupied);
  const to = relPath(aside);
  const hadRow = db.prepare('SELECT 1 FROM notes_index WHERE path = ?').get(from);
  if (hadRow) relocateIndexRows(db, from, to, path.basename(aside), parentOf(to));
  moveSession(from, to);
  indexFile(aside, readTextFile(aside));
}

/**
 * Moves one note file into the trash. Returns where it is now, where it was and when it went.
 * @param {string} fullPath absolute path of a note inside the notes folder
 */
export function moveNoteToTrash(db, fullPath, { trashedAt = nowISO() } = {}) {
  const relative = notesRelative(fullPath);
  if (relative === null || relative === TRASH_NAME || relative.startsWith(`${TRASH_NAME}/`)) {
    throw httpError(400, 'This is not a note that can be deleted', 'not_deletable');
  }
  const originalApp = `notes/${relative}`;
  const destination = trashFileFor(relative);
  const rowBefore = db.prepare('SELECT 1 FROM notes_index WHERE path = ?').get(originalApp);

  if (fs.existsSync(destination)) displaceOlderTwin(db, destination);
  else removeSidecar(destination);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.renameSync(fullPath, destination);
  writeSidecar(destination, { originalPath: relative, trashedAt });

  const trashApp = relPath(destination);
  if (rowBefore) relocateIndexRows(db, originalApp, trashApp, path.basename(destination), parentOf(trashApp));
  moveSession(originalApp, trashApp);
  indexFile(destination, readTextFile(destination));
  db.prepare('UPDATE notes_index SET board_order = NULL WHERE path = ?').run(trashApp);
  return { trashPath: trashApp, originalPath: originalApp, trashedAt };
}

function filesBelow(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) filesBelow(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Moves a folder into the trash: each note goes the way a single note does, and the other files (the pictures of
 * its notes) go to the same place in the trash, so they can come back with the notes.
 * @returns {{ trashedAt: string, notes: number }}
 */
export function trashFolder(db, folderFull, { trashedAt = nowISO() } = {}) {
  const relative = notesRelative(folderFull);
  if (relative === null || relative === TRASH_NAME || relative.startsWith(`${TRASH_NAME}/`)) {
    throw httpError(400, 'This folder cannot be deleted', 'not_deletable');
  }
  let notes = 0;
  for (const file of filesBelow(folderFull)) {
    if (isNoteName(path.basename(file)) && !isSidecarName(path.basename(file))) {
      moveNoteToTrash(db, file, { trashedAt });
      notes += 1;
      continue;
    }
    const destination = uniqueSibling(trashFileFor(notesRelative(file)));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.renameSync(file, destination);
  }
  // Only folders (and links, which are not followed) are left; a file that could not be moved stops here, whole.
  if (filesBelow(folderFull).length > 0) throw httpError(500, 'The folder could not be moved completely', 'trash_incomplete');
  fs.rmSync(folderFull, { recursive: true, force: true });
  forgetIndexRows(db, `notes/${relative}`);
  return { trashedAt, notes };
}

// The folder a note was deleted from is part of a sidecar a person could edit or damage: it never leads outside
// the notes folder or into a hidden one. A path that does is read as "the top of the notes folder".
function safeOriginalRelative(originalApp, fallbackName) {
  const relative = String(originalApp).replace(/^notes\/?/, '');
  const segments = relative.split('/');
  if (segments.some((segment) => FOLDER_RESERVED.has(segment) || segment.startsWith('.'))) return fallbackName;
  return relative;
}

const restoredName = (target, index) => {
  const ext = path.extname(target);
  const base = path.basename(target, ext);
  return path.join(path.dirname(target), `${base} (restored${index > 1 ? ` ${index}` : ''})${ext}`);
};

// A note's pictures that went to the trash with its folder come back with it, to where the note's links look.
function bringBackFiles(noteText, originalDir) {
  const wanted = new Set(referencedPaths(originalDir, noteText));
  for (const name of namedReferences(noteText)) wanted.add(path.join(originalDir, '_attachments', name));
  for (const file of wanted) {
    const relative = notesRelative(file);
    if (relative === null || fs.existsSync(file)) continue;
    const resting = trashFileFor(relative);
    try {
      if (!fs.statSync(resting).isFile()) continue;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.renameSync(resting, file);
      pruneEmptyTrashFolders(path.dirname(resting));
    } catch { /* not in the trash, or not movable: the note comes back without it */ }
  }
}

/**
 * Brings a note back from the trash to the place it was deleted from. A note that has taken its name in the
 * meantime is never replaced: the restored one is called `Name (restored).md`.
 * @returns {{ path: string, renamed: boolean }} the app path the note has now
 */
export function restoreFromTrash(db, row) {
  const trashFile = fullOf(row.path);
  if (!fs.existsSync(trashFile)) {
    forgetIndexRows(db, row.path);
    throw httpError(404, 'File not found', 'not_found');
  }
  const info = trashInfo(trashFile);
  const originalRelative = safeOriginalRelative(info?.originalApp || row.original_path || row.path, path.basename(trashFile));
  let target = path.join(NOTES_DIR, ...originalRelative.split('/'));
  const folder = path.dirname(target);
  fs.mkdirSync(folder, { recursive: true });
  // A folder that was deleted comes back as a folder of the tree.
  if (path.resolve(folder) !== path.resolve(NOTES_DIR)) indexDirectoryTree(folder);

  let renamed = false;
  if (fs.existsSync(target)) {
    renamed = true;
    let index = 1;
    do {
      target = restoredName(path.join(NOTES_DIR, ...originalRelative.split('/')), index);
      index += 1;
    } while (fs.existsSync(target));
  }

  fs.renameSync(trashFile, target);
  removeSidecar(trashFile);
  pruneEmptyTrashFolders(path.dirname(trashFile));

  const targetApp = relPath(target);
  relocateIndexRows(db, row.path, targetApp, path.basename(target), parentOf(targetApp));
  db.prepare('UPDATE notes_index SET trashed_at = NULL, original_path = NULL, last_opened = ? WHERE path = ?').run(nowISO(), targetApp);
  moveSession(row.path, targetApp);
  const text = readTextFile(target);
  if (!isLockedNote(text)) bringBackFiles(text, folder);
  indexFile(target, text);
  return { path: targetApp, renamed };
}

/** Removes a note in the trash for good, with the file that tells where it came from. */
export function deleteFromTrash(db, row) {
  const trashFile = fullOf(row.path);
  try { fs.unlinkSync(trashFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  removeSidecar(trashFile);
  pruneEmptyTrashFolders(path.dirname(trashFile));
  forgetIndexRows(db, row.path);
  removeFolderConfig(db, row.path);
}

/**
 * A vault from before the trash was a folder keeps its trashed notes where they were and marks them in the index
 * only. Those files move into `.trash/` once, with the time they were deleted, so they stop looking like live notes
 * to git, to the export and to every other device. The `trashed_at` column is read here and nowhere else.
 */
export function migrateLegacyTrash(db) {
  const rows = db.prepare(`
    SELECT path, trashed_at FROM notes_index
    WHERE is_dir = 0 AND trashed_at IS NOT NULL AND trashed_at != '' AND path NOT LIKE ?
  `).all('notes/.trash/%');
  for (const row of rows) {
    try {
      const full = fullOf(row.path);
      if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        forgetIndexRows(db, row.path);
        continue;
      }
      moveNoteToTrash(db, full, { trashedAt: Number.isNaN(Date.parse(row.trashed_at)) ? nowISO() : row.trashed_at });
    } catch (error) {
      console.warn(`Could not move ${row.path} to the trash folder: ${error.message}`);
    }
  }
}

