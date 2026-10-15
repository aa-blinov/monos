import fs from 'fs';
import path from 'path';
import { DEFAULT_NOTES_DIR, NOTES_DIR, ROOT_DIR, STORAGE_FILE, UNAVAILABLE_NOTES_FOLDER, readSavedNotesFolder } from './config.js';
import { httpError, isPathInside } from './utils.js';

// The folder the person chose for the notes. It is written to storage.json and opens on the next start:
// the open index, the watcher and the git repository all belong to the folder that is open now. The
// notes themselves are never moved; the old folder stays as it is.

function isDirectory(folder) {
  try {
    return fs.statSync(folder).isDirectory();
  } catch {
    return false;
  }
}

function readStorage() {
  try {
    return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8')) || {};
  } catch {
    return {};
  }
}

function writeStorage(settings) {
  fs.mkdirSync(path.dirname(STORAGE_FILE), { recursive: true });
  fs.writeFileSync(STORAGE_FILE, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
}

export function notesFolderState() {
  const saved = readSavedNotesFolder();
  const target = saved ?? DEFAULT_NOTES_DIR;
  return {
    folder: NOTES_DIR,
    target,
    defaultFolder: DEFAULT_NOTES_DIR,
    // Reported only while the chosen folder is still the one that is missing: a new choice or the default clears it.
    unavailable: saved !== null && saved === UNAVAILABLE_NOTES_FOLDER ? saved : null,
    restartRequired: target !== NOTES_DIR,
  };
}

export function chooseNotesFolder(folder) {
  if (typeof folder !== 'string' || !path.isAbsolute(folder)) {
    throw httpError(400, 'Give the folder by its full path');
  }
  const resolved = path.resolve(folder);
  if (!isDirectory(resolved)) {
    throw httpError(400, 'The folder does not exist');
  }
  // The app's own data sits in ROOT_DIR. A notes folder that contains it, or lies inside it, would
  // index the app's files and the default folder as notes.
  if (isPathInside(ROOT_DIR, resolved) || isPathInside(resolved, ROOT_DIR)) {
    throw httpError(400, 'Choose a folder outside the Monos data folder');
  }
  writeStorage({ ...readStorage(), notesFolder: resolved });
  return notesFolderState();
}

export function forgetNotesFolder() {
  const { notesFolder: _forgotten, ...rest } = readStorage();
  writeStorage(rest);
  return notesFolderState();
}
