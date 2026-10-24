import fs from 'fs';
import path from 'path';
import { indexFile } from './indexing.js';
import { NOTES_DIR } from './config.js';
import { readTextFile, relPath, resolveNotesPath, rewriteWikiTargets, writeFileAtomic } from './utils.js';
import { isLockedNote } from './note-lock.js';

// A wiki-link names its note by file name without `.md` (or by the note's title),
// so the links break only when the file name changes. Moving a note to another
// folder keeps every link working. The helpers below decide what a rename must do.

const nameOf = (notePath) => path.basename(notePath).replace(/\.md$/i, '').normalize('NFC');

/**
 * Notes whose text mentions `name`. The files are read, not the index: a link written
 * outside the app is not in the index yet, and it still has to follow the rename.
 */
export function notesMentioning(name) {
  const forms = [...new Set([name.normalize('NFC'), name.normalize('NFD')])];
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.md')) {
        const text = fs.readFileSync(fullPath, 'utf-8');
        if (forms.some((form) => text.includes(form))) found.push(relPath(fullPath));
      }
    }
  };
  walk(NOTES_DIR);
  return found;
}

/** True when another live note still answers to the same name, so links to it must not move. */
function nameStillAnswers(db, notePath) {
  const name = nameOf(notePath);
  const row = db.prepare(`
    SELECT 1 FROM notes_index
    WHERE is_dir = 0 AND (trashed_at IS NULL OR trashed_at = '')
      AND path != ? AND (title = ? OR name_nfc = ? OR name_nfc = ?)
    LIMIT 1`).get(notePath, name, name, `${name}.md`);
  return Boolean(row);
}

/**
 * Plan for renaming `oldPath` to `newPath`, made before the file moves. Links are
 * rewritten only when the name really changes and no other note still answers to it.
 */
export function planLinkUpdate(db, oldPath, newPath) {
  const renamed = nameOf(oldPath) !== nameOf(newPath);
  if (!renamed) return { relink: false, sources: [] };
  // Another note answers to the same name, so a bare `[[Name]]` may be meant for it and stays. A link that names
  // this note through its folder can only mean this one, and follows it.
  if (nameStillAnswers(db, oldPath)) {
    const folder = path.posix.dirname(oldPath.replace(/^notes\/?/, ''));
    return { relink: true, onlyFolder: folder === '.' ? '' : folder, sources: notesMentioning(nameOf(oldPath)) };
  }
  return { relink: true, sources: notesMentioning(nameOf(oldPath)) };
}

/**
 * Rewrites one note file with `transform(text)`, which returns `{ content, count }`, and
 * returns how many changes were made. Throws when the file cannot be rewritten safely: it is
 * not valid UTF-8, so encoding it again would replace characters, or the write fails (for
 * example a read-only file). A rewritten file keeps its modification time, so the board
 * order does not change.
 */
export function rewriteNoteFile(fullPath, transform) {
  const raw = fs.readFileSync(fullPath);
  const text = raw.toString('utf-8');
  if (!Buffer.from(text, 'utf-8').equals(raw)) throw new Error('not UTF-8');
  // A locked note is sealed: there is no text here to rewrite, and writing into it would break the envelope.
  if (isLockedNote(text)) return 0;
  const result = transform(text);
  if (result.count === 0) return 0;
  const { atime, mtime } = fs.statSync(fullPath);
  writeFileAtomic(fullPath, result.content, 'utf-8');
  fs.utimesSync(fullPath, atime, mtime);
  return result.count;
}

/**
 * Applies `transform(text, notePath)` to each listed note, writes the notes that changed and
 * indexes every listed note again. One note that cannot be rewritten does not stop the others:
 * it is listed in failedPaths instead.
 */
export function updateNotes(notePaths, transform) {
  const updatedPaths = [];
  const failedPaths = [];
  let updatedLinks = 0;

  for (const notePath of notePaths) {
    const fullPath = resolveNotesPath(notePath);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const count = rewriteNoteFile(fullPath, (text) => transform(text, notePath));
      if (count > 0) {
        updatedLinks += count;
        updatedPaths.push(notePath);
      }
    } catch {
      failedPaths.push(notePath);
    }
    try {
      indexFile(fullPath, readTextFile(fullPath));
    } catch {
      if (!failedPaths.includes(notePath)) failedPaths.push(notePath);
    }
  }

  return { updatedLinks, updatedPaths, failedPaths };
}

/**
 * Runs after a note file moved. Rewrites `[[old]]` in the notes that named it and indexes the
 * renamed note again, so its own outgoing links follow it. Without a change of name it only
 * refreshes the index.
 */
export function refreshNotesAfterRename({ oldPath, newPath, relink, sources, onlyFolder = null }) {
  if (!relink) return updateNotes([newPath], (text) => ({ content: text, count: 0 }));
  const oldName = nameOf(oldPath);
  const newName = nameOf(newPath);
  const notePaths = [...new Set([newPath, ...sources.map((source) => (source === oldPath ? newPath : source))])];
  return updateNotes(notePaths, (text) => rewriteWikiTargets(text, oldName, newName, { onlyFolder }));
}
