import fs from 'fs';
import path from 'path';
import { indexFile } from './indexing.js';
import { readTextFile, resolveNotesPath, rewriteWikiTargets } from './utils.js';

// A wiki-link names its note by file name without `.md` (or by the note's title),
// so the links break only when the file name changes. Moving a note to another
// folder keeps every link working. The helpers below decide what a rename must do.

const nameOf = (notePath) => path.basename(notePath).replace(/\.md$/i, '').normalize('NFC');

/** Notes with a wiki-link to the note at `notePath`. Read before the note moves. */
function linkingNotePaths(db, notePath) {
  const name = nameOf(notePath);
  const forms = [...new Set([name, name.normalize('NFD')])];
  const marks = forms.map(() => '?').join(', ');
  return db.prepare(`SELECT DISTINCT source_path FROM note_links WHERE target_name IN (${marks})`)
    .all(...forms)
    .map((row) => row.source_path);
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
  if (!renamed || nameStillAnswers(db, oldPath)) return { relink: false, sources: [] };
  return { relink: true, sources: linkingNotePaths(db, oldPath) };
}

/**
 * Rewrites the links in one file and returns how many changed. Throws when the file cannot
 * be rewritten safely: it is not valid UTF-8, so encoding it again would replace characters,
 * or the write fails (for example a read-only file). A rewritten file keeps its modification
 * time, so the board order does not change.
 */
function rewriteFile(fullPath, oldName, newName) {
  const raw = fs.readFileSync(fullPath);
  const text = raw.toString('utf-8');
  if (!Buffer.from(text, 'utf-8').equals(raw)) throw new Error('not UTF-8');
  const result = rewriteWikiTargets(text, oldName, newName);
  if (result.count === 0) return 0;
  const { atime, mtime } = fs.statSync(fullPath);
  fs.writeFileSync(fullPath, result.content, 'utf-8');
  fs.utimesSync(fullPath, atime, mtime);
  return result.count;
}

/**
 * Runs after the move. Rewrites `[[old]]` in the notes that named the renamed file, and
 * indexes every touched note again, so the renamed note's own outgoing links follow it.
 * One note that cannot be rewritten does not stop the others; it is listed in failedPaths.
 */
export function refreshNotesAfterRename({ oldPath, newPath, relink, sources }) {
  const oldName = nameOf(oldPath);
  const newName = nameOf(newPath);
  const notePaths = new Set([newPath, ...sources.map((source) => (source === oldPath ? newPath : source))]);
  const updatedPaths = [];
  const failedPaths = [];
  let updatedLinks = 0;

  for (const notePath of notePaths) {
    const fullPath = resolveNotesPath(notePath);
    if (!fs.existsSync(fullPath)) continue;
    if (relink) {
      try {
        const count = rewriteFile(fullPath, oldName, newName);
        if (count > 0) {
          updatedLinks += count;
          updatedPaths.push(notePath);
        }
      } catch {
        failedPaths.push(notePath);
      }
    }
    try {
      indexFile(fullPath, readTextFile(fullPath));
    } catch {
      if (!failedPaths.includes(notePath)) failedPaths.push(notePath);
    }
  }

  return { updatedLinks, updatedPaths, failedPaths };
}
