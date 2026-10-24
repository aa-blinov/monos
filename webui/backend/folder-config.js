import fs from 'fs';
import path from 'path';
import { NOTES_DIR } from './config.js';
import { writeFileAtomic } from './utils.js';

// The icon and the colour of a folder (or of a note) live in a file of the notes folder, `.monos/folders.json`, and
// the `folder_config` table is the copy the queries join. The index can be deleted and rebuilt at no cost, so the
// table is filled from the file on every pass and never the other way round; every change writes the file first.
// The file is on this computer only (`.monos/` is not synced, like the templates beside it).
// Paths in the file are relative to the notes folder, so the file means the same thing wherever the folder is.

const FILE_VERSION = 1;
const configFile = () => path.join(NOTES_DIR, '.monos', 'folders.json');
const appPath = (relative) => `notes/${relative}`;
const fromAppPath = (itemPath) => String(itemPath).replace(/^notes\/?/, '');

function sanitize(value) {
  return typeof value === 'string' && value ? value : null;
}

/** The entries of the file, `{ relative path: { icon, color } }`, or null when there is no readable file. */
function readConfigFile() {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(configFile(), 'utf-8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.items !== 'object' || parsed.items === null) return null;
  const items = {};
  for (const [relative, entry] of Object.entries(parsed.items)) {
    const icon = sanitize(entry?.icon);
    const color = sanitize(entry?.color);
    if (relative && (icon || color)) items[relative] = { icon, color };
  }
  return items;
}

function writeConfigFile(items) {
  const sorted = Object.fromEntries(Object.entries(items).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  writeFileAtomic(configFile(), `${JSON.stringify({ version: FILE_VERSION, items: sorted }, null, 2)}\n`, 'utf-8');
}

function tableItems(db) {
  const items = {};
  for (const row of db.prepare('SELECT path, icon, color FROM folder_config').all()) {
    if (row.icon || row.color) items[fromAppPath(row.path)] = { icon: row.icon || null, color: row.color || null };
  }
  return items;
}

function fillTable(db, items) {
  const insert = db.prepare('INSERT INTO folder_config (path, icon, color) VALUES (?, ?, ?)');
  db.transaction(() => {
    db.prepare('DELETE FROM folder_config').run();
    for (const [relative, entry] of Object.entries(items)) insert.run(appPath(relative), entry.icon, entry.color);
  })();
}

/**
 * Makes the table what the file says. A vault from before the file existed has its settings in the table only:
 * they are written out first, once, so nothing is lost on the way.
 */
export function loadFolderConfig(db) {
  const fromFile = readConfigFile();
  if (fromFile === null) {
    const legacy = tableItems(db);
    if (Object.keys(legacy).length > 0) writeConfigFile(legacy);
    return;
  }
  fillTable(db, fromFile);
}

function changeItems(db, change) {
  const items = tableItems(db);
  const changed = change(items);
  if (changed === false) return;
  writeConfigFile(items);
  fillTable(db, items);
}

/** Sets the icon and the colour of one path; a null for both clears it. `undefined` leaves a field as it is. */
export function setFolderConfig(db, itemPath, { icon, color }) {
  const key = fromAppPath(itemPath);
  changeItems(db, (items) => {
    const current = items[key] || { icon: null, color: null };
    const next = {
      icon: icon === undefined ? current.icon : sanitize(icon),
      color: color === undefined ? current.color : sanitize(color),
    };
    if (!next.icon && !next.color) {
      if (!items[key]) return false;
      delete items[key];
    } else {
      items[key] = next;
    }
    return true;
  });
}

/** Moves the entry of a path, and of everything inside it, to the new place of that path. */
export function moveFolderConfig(db, oldPath, newPath) {
  const from = fromAppPath(oldPath);
  const to = fromAppPath(newPath);
  changeItems(db, (items) => {
    const moved = Object.keys(items).filter((key) => key === from || key.startsWith(`${from}/`));
    if (moved.length === 0) return false;
    const entries = moved.map((key) => [to + key.slice(from.length), items[key]]);
    for (const key of moved) delete items[key];
    for (const [key, entry] of entries) items[key] = entry;
    return true;
  });
}

/** Forgets the entry of a path and of everything inside it. */
export function removeFolderConfig(db, itemPath) {
  const from = fromAppPath(itemPath);
  changeItems(db, (items) => {
    const gone = Object.keys(items).filter((key) => key === from || key.startsWith(`${from}/`));
    if (gone.length === 0) return false;
    for (const key of gone) delete items[key];
    return true;
  });
}

/** The entries as the export carries them, `{ relative path: { icon, color } }`. */
export function folderConfigForExport(db) {
  return tableItems(db);
}

// What an icon and a colour may be. The page draws them, so only the shapes it offers are kept: a kebab-case icon
// name, and a colour as hex, a plain colour word or rgb()/hsl().
export const ICON_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const COLOR_VALUE = /^(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,24}|(?:rgb|hsl)a?\(\s*[\d.%\s,/-]{1,40}\))$/;

/** The entries of a file that came from outside (an archive), reduced to what is safe to keep: `{ path: { icon, color } }`. */
export function checkedFolderEntries(items) {
  const checked = {};
  if (!items || typeof items !== 'object' || Array.isArray(items)) return checked;
  for (const [relative, entry] of Object.entries(items).slice(0, 5000)) {
    const segments = String(relative).split('/');
    if (!relative || segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) continue;
    const icon = typeof entry?.icon === 'string' && ICON_NAME.test(entry.icon) ? entry.icon : null;
    const color = typeof entry?.color === 'string' && COLOR_VALUE.test(entry.color) ? entry.color : null;
    if (icon || color) checked[relative] = { icon, color };
  }
  return checked;
}
