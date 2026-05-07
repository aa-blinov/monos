import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = process.env.NOTES_ROOT
  ? path.resolve(process.env.NOTES_ROOT)
  : path.resolve(__dirname, '..', '..');
const DB_PATH = path.join(ROOT_DIR, '.data', 'notes.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
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
      last_opened TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT NOT NULL,
      target_name TEXT NOT NULL,
      FOREIGN KEY (source_path) REFERENCES notes_index(path) ON DELETE CASCADE
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
  `);

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
