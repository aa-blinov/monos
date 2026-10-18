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
 * Where this device stands with its repository: connected to a remote at all, when it last synced, and per note
 * what waits to be sent (`unsent`) and what waits on the remote to be received (`incoming`), as paths relative to
 * the notes folder.
 */
export const syncState = writable({ connected: false, lastSync: null, unsent: new Set(), incoming: new Set() });

/**
 * One note against the repository, in four words: `synced` (nothing here waits to go, nothing there waits to come),
 * `local` (changed here, not sent), `remote` (changed on the remote, not yet received), `both` (each side has
 * its own change); `none` when no remote is connected.
 * @param {{ connected: boolean, unsent: Set<string>, incoming: Set<string> }} state
 * @param {string} notePath the app's path, `notes/…` or relative
 */
export function noteSyncStatus(state, notePath) {
  if (!state?.connected) return 'none';
  const key = String(notePath || '').replace(/^notes\//, '');
  const here = Boolean(state.unsent?.has(key));
  const there = Boolean(state.incoming?.has(key));
  if (here && there) return 'both';
  if (here) return 'local';
  if (there) return 'remote';
  return 'synced';
}

/** A save is known to leave the note unsent at once; the next read of the status confirms it. */
export function markUnsent(notePath) {
  const key = String(notePath || '').replace(/^notes\//, '');
  if (!key) return;
  syncState.update((state) => (state.connected && !state.unsent.has(key) ? { ...state, unsent: new Set([...state.unsent, key]) } : state));
}

let refreshTimer;
/** The status is read again a moment after the last change, not for every keystroke. */
export function scheduleSyncRefresh(delay = 1200) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { void refreshConflicts(); }, delay);
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
    syncState.set({ connected, lastSync: status.last_sync || null, unsent: new Set(status.unsent || []), incoming: new Set(status.incoming || []) });
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
