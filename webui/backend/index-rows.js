import path from 'path';
import { removeNoteFromFts } from './fts.js';
import { moveFolderConfig } from './folder-config.js';

/**
 * Moves the index rows of a note or folder, and of everything inside a folder, to their new
 * paths, so dates, board order and folder settings stay with the note. note_links references
 * notes_index by path, so its rows for the old paths go first; re-indexing rebuilds them.
 */
export function relocateIndexRows(db, oldPath, newPath, newName, newParent) {
  // A row that is still at the new place belongs to a file that is not there (the disk is what says the place is
  // free): it goes, or the rename of the path below would break on the key.
  if (oldPath !== newPath && db.prepare('SELECT 1 FROM notes_index WHERE path = ?').get(newPath)) {
    db.prepare('DELETE FROM notes_index WHERE path = ?').run(newPath);
    removeNoteFromFts(db, newPath);
  }
  const moved = db.prepare("SELECT path FROM notes_index WHERE path = ? OR path LIKE ? || '/%'").all(oldPath, oldPath);
  db.prepare("DELETE FROM note_links WHERE source_path = ? OR source_path LIKE ? || '/%'").run(oldPath, oldPath);
  // The rows are rebuilt by the reindex that follows the move; keeping them would block the path update.
  db.prepare("DELETE FROM note_aliases WHERE path = ? OR path LIKE ? || '/%'").run(oldPath, oldPath);
  for (const row of moved) removeNoteFromFts(db, row.path);
  db.prepare('UPDATE notes_index SET path = ?, name = ?, name_nfc = ?, parent_path = ? WHERE path = ?')
    .run(newPath, newName, newName.normalize('NFC'), newParent, oldPath);
  for (const row of moved) {
    if (row.path === oldPath) continue;
    const next = newPath + row.path.slice(oldPath.length);
    db.prepare('UPDATE notes_index SET path = ?, parent_path = ? WHERE path = ?').run(next, path.dirname(next).replace(/\\/g, '/'), row.path);
  }
  moveFolderConfig(db, oldPath, newPath);
}
