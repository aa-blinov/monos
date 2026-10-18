import { writable } from 'svelte/store';
import { persisted } from './stores/persisted.js';

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
export const gitConnected = persisted('gitConnected', false, {
  serialize: (value) => String(value),
  deserialize: (text) => text === 'true',
});

/**
 * Where this device stands with its repository: connected to a remote at all, when it last synced, and how far
 * it is from the remote. The note shows it beside its own date.
 */
export const syncState = writable({ connected: false, lastSync: null, ahead: 0, behind: 0 });

// The last answer that was a real answer. Sync is shown from the first frame of the next run, not after a request.


/**
 * How a note stands with the last sync: `none` (no remote), `never` (connected, nothing sent yet), `pending`
 * (changed after the last sync) or `synced`.
 * @param {{ connected: boolean, lastSync: string|null }} state
 * @param {string|null|undefined} modified the note's modification time
 */
export function noteSyncStatus(state, modified) {
  if (!state?.connected) return 'none';
  const last = Date.parse(state.lastSync || '');
  if (!Number.isFinite(last)) return 'never';
  const changed = Date.parse(modified || '');
  // A second of slack: the file is written just before the sync stamps its time.
  return Number.isFinite(changed) && changed > last + 1000 ? 'pending' : 'synced';
}

/** The server lists conflicts relative to the notes folder; the app's paths start with `notes/`. */
export function conflictNotePath(path) {
  const clean = String(path || '').replace(/^"+|"+$/g, '').replace(/^\/+/, '');
  if (!clean) return '';
  return clean.startsWith('notes/') ? clean : `notes/${clean}`;
}

export async function refreshConflicts(fetchImpl = (...args) => fetch(...args)) {
  try {
    const status = await (await fetchImpl('/api/git/status')).json();
    // An error answer (git busy with another command, a lock) has no `initialized`: it says nothing about the
    // connection, so what was known stays. Taking it for "not connected" made the Sync button blink away.
    if (typeof status?.initialized !== 'boolean') return;
    const connected = Boolean(status.initialized && (status.repo || status.remote));
    gitConnected.set(connected);
    syncState.set({ connected, lastSync: status.last_sync || null, ahead: status.ahead || 0, behind: status.behind || 0 });
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
    // Offline: no marks rather than stale ones. Whether a repository is connected does not change by being offline.
    conflictedNotes.set(new Set());
    conflictedFiles.set(new Set());
  }
}
