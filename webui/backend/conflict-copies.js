// The copies a sync service leaves beside a note when two devices changed it at once. A copy is listed
// only with its original next to it, so an ordinary note with a similar name is never taken for one.
// Nothing here deletes a file: the list is for the person to look at, and deleting a copy moves it to the trash.

const NOTE_EXTENSION = '.md';

// Dropbox: "Plan (conflicted copy 2026-10-15 MacBook).md"
const DROPBOX = /^(.+) \((?:conflicted copy|Конфликтная копия)[^)]*\)$/i;
// Syncthing: "Plan.sync-conflict-20261015-123456-ABCDEFG.md"
const SYNCTHING = /^(.+)\.sync-conflict-\d{8}-\d{6}-[A-Z0-9]+$/;
// OneDrive: "Plan-DESKTOP-AB12CD.md", with the computer's name after a dash. A computer name is upper case
// and holds a digit, so "Plan-notes" is not taken for one.
const COMPUTER_NAME = /^(?=[A-Z0-9-]*\d)[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/;
// iCloud: "Plan 2.md". Listed only when its text is the same as the original's: two different texts under
// such names may both be notes.
const NUMBERED = /^(.+) (\d+)$/;

/**
 * The copies among the notes, each with the note it copies. `notes` are the indexed notes: `path` from
 * the root ("notes/…") and `content` (empty for a locked note, whose text is not read, so it never matches).
 */
export function findConflictCopies(notes) {
  const byPath = new Map(notes.map((note) => [note.path, note]));
  const copies = [];
  for (const note of notes) {
    const copy = copyOf(note, byPath);
    if (copy) copies.push(copy);
  }
  return copies.sort((a, b) => a.path.localeCompare(b.path));
}

function copyOf(note, byPath) {
  const slash = note.path.lastIndexOf('/');
  const folder = note.path.slice(0, slash + 1);
  const file = note.path.slice(slash + 1);
  if (!file.toLowerCase().endsWith(NOTE_EXTENSION)) return null;
  const stem = file.slice(0, -NOTE_EXTENSION.length);

  const originalOf = (base) => {
    if (!base) return null;
    const path = `${folder}${base}${NOTE_EXTENSION}`;
    return byPath.has(path) ? path : null;
  };
  const conflictOf = (original) => ({ path: note.path, original, kind: 'conflict' });

  const named = SYNCTHING.exec(stem) || DROPBOX.exec(stem);
  if (named) {
    const original = originalOf(named[1]);
    if (original) return conflictOf(original);
  }

  for (let dash = stem.indexOf('-'); dash !== -1; dash = stem.indexOf('-', dash + 1)) {
    if (!COMPUTER_NAME.test(stem.slice(dash + 1))) continue;
    const original = originalOf(stem.slice(0, dash));
    if (original) return conflictOf(original);
  }

  const numbered = NUMBERED.exec(stem);
  if (numbered) {
    const original = originalOf(numbered[1]);
    const originalNote = original && byPath.get(original);
    if (originalNote && note.content && originalNote.content === note.content) {
      return { path: note.path, original, kind: 'duplicate' };
    }
  }
  return null;
}
