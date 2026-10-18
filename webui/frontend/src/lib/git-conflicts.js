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

/**
 * Where this device stands with its repository: connected to a remote at all, when it last synced, and how far
 * it is from the remote. The note shows it beside its own date.
 */
export const syncState = writable({ connected: false, lastSync: null, ahead: 0, behind: 0 });

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
    gitConnected.set(Boolean(status?.initialized));
    syncState.set({ connected: Boolean(status?.initialized && status?.repo), lastSync: status?.last_sync || null, ahead: status?.ahead || 0, behind: status?.behind || 0 });
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
    syncState.set({ connected: false, lastSync: null, ahead: 0, behind: 0 });
    conflictedNotes.set(new Set());
    conflictedFiles.set(new Set());
  }
}
