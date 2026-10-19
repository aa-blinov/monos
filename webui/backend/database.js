import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
import { DEFAULT_NOTES_DIR, NOTES_DIR, ROOT_DIR } from './config.js';

// Each notes folder has its own index, so switching folders does not mix the two. The default folder keeps
// the file it always had.
const DB_PATH = path.join(ROOT_DIR, '.data', NOTES_DIR === DEFAULT_NOTES_DIR
  ? 'notes.db'
  : `notes-${createHash('sha1').update(NOTES_DIR).digest('hex').slice(0, 12)}.db`);
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// better-sqlite3 is a native addon, and each runtime needs its own build: this
// folder's copy is built for plain Node (the tests), while Electron loads a copy
// built for its own runtime. The desktop shell sets MONOS_SQLITE_BINDING to that
// file in development; packaged builds and tests leave it unset.
const SQLITE_BINDING = process.env.MONOS_SQLITE_BINDING;

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH, SQLITE_BINDING ? { nativeBinding: SQLITE_BINDING } : {});
    db.pragma('journal_mode = WAL');
    // Two backends on one vault share this file. A write that meets the other one's lock waits up to this long before
    // it fails with SQLITE_BUSY. Kept at 5 s, the better-sqlite3 default, and written here so it does not depend on that
    // default. The wait blocks the event loop, so it stays short. Not covered: a deferred transaction that reads and then
    // writes after the other backend committed fails at once (SQLITE_BUSY_SNAPSHOT), whatever this value is.
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes_index (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_dir INTEGER NOT NULL DEFAULT 0,
      parent_path TEXT DEFAULT '',
      title TEXT DEFAULT '',
      content TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      category TEXT DEFAULT '',
      date_created TEXT NOT NULL,
      modified_at TEXT,
      last_opened TEXT NOT NULL,
      board_order REAL,
      trashed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS note_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT NOT NULL,
      target_name TEXT NOT NULL,
      FOREIGN KEY (source_path) REFERENCES notes_index(path) ON DELETE CASCADE
    );

    -- Aliases come from the frontmatter (aliases: [...]) and are rebuilt on every index of the note.
    CREATE TABLE IF NOT EXISTS note_aliases (
      path TEXT NOT NULL,
      alias TEXT NOT NULL,
      alias_nfc TEXT NOT NULL,
      PRIMARY KEY (path, alias_nfc),
      FOREIGN KEY (path) REFERENCES notes_index(path) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS folder_config (
      path TEXT PRIMARY KEY,
      icon TEXT,
      color TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes_index(parent_path);
    CREATE INDEX IF NOT EXISTS idx_notes_name ON notes_index(name);
    CREATE INDEX IF NOT EXISTS idx_notes_is_dir ON notes_index(is_dir);
    CREATE INDEX IF NOT EXISTS idx_links_source ON note_links(source_path);
    CREATE INDEX IF NOT EXISTS idx_aliases_nfc ON note_aliases(alias_nfc);
  `);

  const noteColumns = db.prepare('PRAGMA table_info(notes_index)').all().map((column) => column.name);
  if (!noteColumns.includes('board_order')) {
    db.exec('ALTER TABLE notes_index ADD COLUMN board_order REAL');
  }
  if (!noteColumns.includes('modified_at')) {
    db.exec('ALTER TABLE notes_index ADD COLUMN modified_at TEXT');
  }
  if (!noteColumns.includes('pinned')) {
    db.exec('ALTER TABLE notes_index ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
  }
  if (!noteColumns.includes('trashed_at')) {
    db.exec('ALTER TABLE notes_index ADD COLUMN trashed_at TEXT');
  }
  // Custom properties of the note as a JSON array (see properties.js), read by the table view and by `prop:` search.
  if (!noteColumns.includes('props')) {
    db.exec("ALTER TABLE notes_index ADD COLUMN props TEXT NOT NULL DEFAULT '[]'");
  }
  // Имя в нормализованной форме. macOS отдаёт имена файлов разложенными
  // (NFD), а человек набирает связки сложёнными (NFC) — строки расходятся
  // на один байт и не находятся. Сравнение байт в SQL такое не прощает,
  // поэтому рядом с именем лежит ключ поиска.
  if (!noteColumns.includes('name_nfc')) {
    db.exec('ALTER TABLE notes_index ADD COLUMN name_nfc TEXT');
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_notes_modified_at ON notes_index(modified_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_notes_board_order ON notes_index(board_order)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_notes_trashed_at ON notes_index(trashed_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_notes_name_nfc ON notes_index(name_nfc)');

  // Migrate: add settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
