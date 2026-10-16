import { get, writable } from 'svelte/store';
import { isPinned, pinNote, pinnedNotes } from './sidebar-pinned.js';
import { restoreNoteRequest } from './editor-api.js';

/**
 * A note moved to the trash can be brought back for a few seconds from the notice the app shows.
 * Moving to the trash is reversible, so it asks no question first; the notice is the safety net.
 * Folders are deleted for good and keep their confirmation, so they never come here.
 */
export const UNDO_TRASH_MS = 8000;

/** `{ id, notes: [{ path, name, pinned }] }` while the notice is up, otherwise null. */
export const trashedNotice = writable(null);
let lastId = 0;

/** What to remember about a note before it goes, so undo can put it back as it was. */
export function trashedNote(path, name) {
  const shown = String(name || String(path || '').split('/').pop()).replace(/\.md$/i, '');
  return { path, name: shown, pinned: isPinned(path, get(pinnedNotes)) };
}

export function announceTrashed(notes) {
  const list = (notes || []).filter((note) => note?.path);
  if (!list.length) return;
  lastId += 1;
  trashedNotice.set({ id: lastId, notes: list });
}

/** Hide the notice, but only the one with this id: a newer notice stays. */
export function dismissTrashedNotice(id) {
  trashedNotice.update((notice) => (notice && (id === undefined || notice.id === id) ? null : notice));
}

/**
 * Bring the notes back from the trash, pinned again if they were pinned.
 * @returns {Promise<Array<{ path: string, name: string }>>} the restored notes
 */
export async function undoTrash(notice, { restore = restoreNoteRequest, pin = pinNote } = {}) {
  const restored = [];
  for (const note of notice?.notes || []) {
    await restore(note.path);
    if (note.pinned) await pin(note.path, note.name);
    restored.push({ path: note.path, name: note.name });
  }
  dismissTrashedNotice(notice?.id);
  return restored;
}
