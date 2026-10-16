/**
 * Coordination for a rename. The sidebar renames the file, the open note may hold edits
 * and links to it, and the app shell shows a notice. These parts are not wired to each
 * other, so the steps go through window events. With nobody listening, they do nothing.
 */
export const FLUSH_OPEN_NOTE_EVENT = 'monos:flush-open-note';
export const NOTE_LINKS_UPDATED_EVENT = 'monos:note-links-updated';
export const NOTES_PULLED_EVENT = 'monos:notes-pulled';

/** A sync brought changes from another device: the open note reads its file again if it has no unsaved edits. */
export function announceNotesPulled() {
  window.dispatchEvent(new CustomEvent(NOTES_PULLED_EVENT));
}

/** Asks the open note to save its pending edits. Resolves once they are on disk. */
export async function flushOpenNote() {
  const request = { pending: [] };
  window.dispatchEvent(new CustomEvent(FLUSH_OPEN_NOTE_EVENT, { detail: request }));
  await Promise.all(request.pending);
}

/** Reports the links the server rewrote: the open note reloads if it is among the paths. */
export function announceNoteLinksUpdated({ updatedLinks = 0, updatedPaths = [], failedPaths = [] } = {}) {
  if (!updatedLinks && !failedPaths.length) return;
  window.dispatchEvent(new CustomEvent(NOTE_LINKS_UPDATED_EVENT, { detail: { updatedLinks, updatedPaths, failedPaths } }));
}
