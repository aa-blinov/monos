// A file dropped into the window.
//
// Monos opens notes, and notes are ordinary files in the notes folder. The path of a dropped
// file comes from the system, so the folder is checked here, before the page is told to open
// anything: a file from elsewhere is not a note of this app, and the app does not copy files
// into the notes folder on its own.

const fs = require('node:fs');
const path = require('node:path');

// The same files are the same files. The system gives the dropped file by its own path, and
// that path may lead through a link: /tmp is a link to /private/tmp on macOS, and a chosen
// notes folder can sit behind a link too. The check compares the folders as the system sees them.
function realPath(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

// The same files the index keeps as notes.
const NOTE_EXTENSIONS = new Set(['.md', '.txt']);

/**
 * The note a dropped file names, or the reason it cannot open.
 *
 * `notes/Foo.md` is how the app names a note inside the notes folder, wherever that folder
 * is on disk. A file that is not a note of that folder is refused: 'not-a-note' when it is
 * not a note at all, 'outside-notes' when it lies elsewhere.
 */
function resolveDroppedNote(notesDir, filePath) {
  if (typeof filePath !== 'string' || !filePath) return { ok: false, code: 'not-a-note' };
  const absolute = path.resolve(filePath);
  if (!NOTE_EXTENSIONS.has(path.extname(absolute).toLowerCase())) return { ok: false, code: 'not-a-note' };
  if (!notesDir) return { ok: false, code: 'outside-notes' };
  const relative = path.relative(realPath(notesDir), realPath(absolute));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false, code: 'outside-notes' };
  }
  return { ok: true, path: `notes/${relative.split(path.sep).join('/')}` };
}

module.exports = { resolveDroppedNote };
