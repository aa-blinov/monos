import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The app's own data: the index, the settings, the access token. Never a folder the person chose for notes.
export const ROOT_DIR = process.env.NOTES_ROOT
  ? path.resolve(process.env.NOTES_ROOT)
  : path.resolve(__dirname, '..', '..');

export const STORAGE_FILE = path.join(ROOT_DIR, '.data', 'storage.json');
export const DEFAULT_NOTES_DIR = path.join(ROOT_DIR, 'notes');

function isDirectory(folder) {
  try {
    return fs.statSync(folder).isDirectory();
  } catch {
    return false;
  }
}

/** The notes folder the person chose (Settings → Notes folder), or null for the default one. */
export function readSavedNotesFolder() {
  try {
    const saved = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8')).notesFolder;
    return typeof saved === 'string' && path.isAbsolute(saved) ? path.resolve(saved) : null;
  } catch {
    return null;
  }
}

// Read once, here, so every module agrees on the folder. A chosen folder that is gone (an unplugged
// drive, a moved folder) does not stop the app: it opens the default folder, and says so in
// UNAVAILABLE_NOTES_FOLDER rather than hiding the switch.
const savedNotesFolder = readSavedNotesFolder();
const savedFolderUsable = savedNotesFolder !== null && isDirectory(savedNotesFolder);

export const NOTES_DIR = savedFolderUsable ? savedNotesFolder : DEFAULT_NOTES_DIR;
export const UNAVAILABLE_NOTES_FOLDER = savedNotesFolder !== null && !savedFolderUsable ? savedNotesFolder : null;
