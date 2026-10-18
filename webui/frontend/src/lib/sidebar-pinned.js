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

/** Rebuild the store after the tree loads. */
export function setPinnedFromTree(tree) {
  pinnedNotes.set(collectPinned(tree));
  pinsKnown.set(true);
}

/** Pinning from the open note: the sidebar's list follows at once instead of after the next tree load. */
export function markPinned(path, pinned, name) {
  if (path) setPinnedInStore(path, pinned, name);
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

export async function pinNote(path, name) {
  if (!path) return;
  setPinnedInStore(path, true, name);
  try {
    await writePin(path, true);
  } catch (error) {
    setPinnedInStore(path, false);
    throw error;
  }
}

export async function unpinNote(path) {
  if (!path) return;
  setPinnedInStore(path, false);
  try {
    await writePin(path, false);
  } catch (error) {
    // Возвращаем как было: молча снятое закрепление хуже, чем ошибка.
    throw error;
  }
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
