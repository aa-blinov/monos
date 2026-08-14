import { writable, get } from 'svelte/store';
import {
  isSameOrDescendant,
  basename,
  displayNoteName,
  replacePathPrefix,
} from './sidebar-utils.js';

const PINNED_NOTES_KEY = 'pinnedNotes';

function loadInitial() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PINNED_NOTES_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((note) => note?.path) : [];
  } catch {
    return [];
  }
}

function save(pinnedNotes) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(PINNED_NOTES_KEY, JSON.stringify(pinnedNotes));
}

export const pinnedNotes = writable(loadInitial());

export function isPinned(path) {
  return get(pinnedNotes).some((note) => note.path === path);
}

export function pinNote(path, name) {
  if (!path) return;
  pinnedNotes.update((current) => {
    if (isPinned(path, current)) return current;
    return [
      { path, name: displayNoteName(name || basename(path)) },
      ...current,
    ];
  });
}

export function unpinNote(path, includeDescendants = false) {
  pinnedNotes.update((current) =>
    current.filter((note) =>
      includeDescendants ? !isSameOrDescendant(note.path, path) : note.path !== path,
    ),
  );
}

export function updatePinnedPath(oldPath, newPath, newName) {
  pinnedNotes.update((current) => {
    let changed = false;
    const next = current.map((note) => {
      if (!isSameOrDescendant(note.path, oldPath)) return note;
      changed = true;
      const replaced = replacePathPrefix(note.path, oldPath, newPath);
      return {
        path: replaced,
        name: displayNoteName(newName || basename(replaced)),
      };
    });
    return changed ? next : current;
  });
}

pinnedNotes.subscribe(save);
