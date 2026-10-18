/**
 * Pinned notes.
 *
 * A pin lives in the note's own frontmatter (`pinned: true`), not in the
 * browser. The old localStorage list looked fine on one machine and was wrong
 * everywhere else: it did not follow the note to another device, never reached
 * git, and vanished with the browser data — and nothing told the person why.
 * The note is the product, so the pin is part of the note.
 *
 * The list itself is derived from the tree the sidebar already loads, which
 * means a pin survives a rename or a move for free: the flag travels inside the
 * file that was renamed.
 */

import { writable, get } from 'svelte/store';
import { put } from './api/client.js';
import { basename, displayNoteName } from './sidebar-utils.js';

/** Where pins used to live. Read once for migration, then cleared. */
const LEGACY_KEY = 'pinnedNotes';

export const pinnedNotes = writable([]);
/** False until the tree has loaded once: before that the list is empty because nothing is known, not because nothing is pinned. */
export const pinsKnown = writable(false);

// The board and the tree name the same note with or without the leading `notes/`.
const samePath = (a, b) => String(a || '').replace(/^notes\//, '') === String(b || '').replace(/^notes\//, '');

export function isPinned(path, list) {
  return (list || get(pinnedNotes)).some((note) => samePath(note.path, path));
}

/** Collect pinned notes from a tree node in tree order. */
export function collectPinned(tree) {
  const found = [];
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object') return;
    if (!node.is_dir && node.metadata?.pinned) {
      found.push({ path: node.path, name: displayNoteName(node.metadata.title || node.name) });
    }
    walk(node.children);
  };
  walk(tree);
  return found;
}

/**
 * One mechanism, three readers (the sidebar's list, the board's marks, the open note's button).
 *
 * The truth is the note's own `pinned` flag on disk. Every change a person makes, wherever they make it, goes
 * through `recordPin`: it updates the list at once, remembers the change under a sequence number, and announces it
 * on `pinEvents`, which the open note follows. A tree that was requested before a change and arrives after it must
 * not undo it, so a load is applied with the sequence number it started at: changes made since then, and changes
 * whose write is still out, win over the tree's older answer.
 */
let writeSeq = 0;
const lastChange = new Map(); // normalised path -> { seq, pinned, name }
const pendingWrites = new Map(); // normalised path -> pinned, while the request is out

const keyOf = (path) => String(path || '').replace(/^notes\//, '');

/** Announces the last change: `{ path, pinned, seq }`. The open note listens and follows. */
export const pinEvents = writable(null);

/** Call before requesting the tree; pass the result to `setPinnedFromTree`. */
export function pinSyncMark() {
  return writeSeq;
}

/** Rebuild the store after the tree loads. `since` is the mark taken before the tree was requested. */
export function setPinnedFromTree(tree, since = writeSeq) {
  const list = collectPinned(tree);
  const apply = (path, pinned, name) => {
    const at = list.findIndex((note) => samePath(note.path, path));
    if (pinned && at < 0) list.unshift({ path, name: displayNoteName(name || basename(path)) });
    if (!pinned && at >= 0) list.splice(at, 1);
  };
  for (const [key, change] of lastChange) {
    if (change.seq > since) apply(key, change.pinned, change.name);
  }
  for (const [key, pinned] of pendingWrites) apply(key, pinned);
  pinnedNotes.set(list);
  pinsKnown.set(true);
}

/** A pin changed by a person: list, sequence and announcement in one place. */
function recordPin(path, pinned, name) {
  if (!path) return;
  writeSeq += 1;
  lastChange.set(keyOf(path), { seq: writeSeq, pinned, name });
  setPinnedInStore(path, pinned, name);
  pinEvents.set({ path, pinned, seq: writeSeq });
}

/** Pinning from the open note, which writes the file itself: the other readers follow at once. */
export function markPinned(path, pinned, name) {
  recordPin(path, pinned, name);
}

function setPinnedInStore(path, pinned, name) {
  pinsKnown.set(true);
  pinnedNotes.update((current) => (
    pinned
      ? current.some((note) => samePath(note.path, path))
        ? current
        : [{ path, name: displayNoteName(name || basename(path)) }, ...current]
      : current.filter((note) => !samePath(note.path, path))
  ));
}

async function writePin(path, pinned) {
  // `put` разбирает ответ и бросает ApiError на неуспехе — проверять `.ok`
  // здесь нечего, успех это отсутствие исключения.
  await put('/api/file/metadata', { pinned }, { query: { path } });
}

async function writeChange(path, pinned, name) {
  if (!path) return;
  recordPin(path, pinned, name);
  pendingWrites.set(keyOf(path), pinned);
  try {
    await writePin(path, pinned);
  } catch (error) {
    // Put it back as it was, everywhere: a pin that moved quietly is worse than an error.
    recordPin(path, !pinned, name);
    throw error;
  } finally {
    // Only the newest write of a path may clear its pending mark.
    if (pendingWrites.get(keyOf(path)) === pinned) pendingWrites.delete(keyOf(path));
  }
}

/** A deleted or moved-away note leaves the list; there is no file left to write. */
export function forgetPin(path) {
  recordPin(path, false);
}

export async function pinNote(path, name) {
  await writeChange(path, true, name);
}

export async function unpinNote(path, name) {
  await writeChange(path, false, name);
}

/** Pins that predate the move into frontmatter, still sitting in localStorage. */
function readLegacyPins() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((note) => note?.path) : [];
  } catch {
    return [];
  }
}

/**
 * Move browser-only pins into the notes themselves.
 *
 * Runs once, writes every pin it finds, and only then clears the old key — so
 * an interrupted migration keeps what it has not yet written, and the next
 * start finishes the job. Notes that no longer exist are dropped silently:
 * there is nothing to pin them to.
 *
 * @returns {Promise<{ migrated: string[], skipped: number }>}
 */
export async function migrateLegacyPins() {
  const legacy = readLegacyPins();
  if (legacy.length === 0) return { migrated: [], skipped: 0 };

  const migrated = [];
  let skipped = 0;
  for (const note of legacy) {
    try {
      await writePin(note.path, true);
      migrated.push(note.path);
    } catch {
      skipped += 1;
    }
  }

  if (skipped === 0 && typeof localStorage !== 'undefined') {
    localStorage.removeItem(LEGACY_KEY);
  }
  return { migrated, skipped };
}
