import { writable } from 'svelte/store';

/**
 * Notes with an unresolved sync conflict, as `notes/…` paths. The board and the tree mark them, so a
 * conflict is seen where the notes are, not only when the note happens to be opened.
 * Refreshed on start, after every sync and after a conflict is resolved.
 */
export const conflictedNotes = writable(new Set());

/** Files other than notes (attachments, settings) in a sync conflict; resolved in Settings. */
export const conflictedFiles = writable(new Set());

/** Set by the sidebar's conflict link: Settings scrolls to its list of conflicts once it has loaded. */
export const revealConflicts = writable(false);

/** Whether this device is connected to a repository: the sidebar shows its sync button only then. */
export const gitConnected = writable(false);

/** The server lists conflicts relative to the notes folder; the app's paths start with `notes/`. */
export function conflictNotePath(path) {
  const clean = String(path || '').replace(/^"+|"+$/g, '').replace(/^\/+/, '');
  if (!clean) return '';
  return clean.startsWith('notes/') ? clean : `notes/${clean}`;
}

export async function refreshConflicts(fetchImpl = (...args) => fetch(...args)) {
  try {
    const status = await (await fetchImpl('/api/git/status')).json();
    gitConnected.set(Boolean(status?.initialized));
    if (status?.status !== 'conflict') {
      conflictedNotes.set(new Set());
      conflictedFiles.set(new Set());
      return;
    }
    const list = await (await fetchImpl('/api/git/conflicts')).json();
    const paths = (Array.isArray(list) ? list : [])
      .map((item) => conflictNotePath(typeof item === 'string' ? item : item?.path))
      .filter(Boolean);
    conflictedNotes.set(new Set(paths.filter((path) => path.endsWith('.md'))));
    conflictedFiles.set(new Set(paths.filter((path) => !path.endsWith('.md'))));
  } catch {
    // Offline or not connected: no marks rather than stale ones.
    conflictedNotes.set(new Set());
    conflictedFiles.set(new Set());
  }
}
