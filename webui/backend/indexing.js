import fs from 'fs';
import path from 'path';
import { isAgentRuleFile } from './agent-rules.js';
import { getDb } from './database.js';
import { indexNoteForFts, removeNoteFromFts, ensureFtsSchema, ftsInSync, rebuildFts } from './fts.js';
import { parseFrontmatterMetadata } from './search.js';
import { NOTES_DIR } from './config.js';
import { upsertFrontmatter } from './frontmatter.js';
import { readProperties } from './properties.js';
import { isLockedNote } from './note-lock.js';
import { extractWikiLinks, nowISO, readTextFile, relPath, resolveNotesPath, writeFileAtomic } from './utils.js';

function parseCachedTags(rawTags) {
  if (!rawTags) return [];
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed)
      ? parsed.map((tag) => String(tag).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function metadataEqual(left, right) {
  return left.title === right.title
    && left.category === right.category
    && left.pinned === right.pinned
    && JSON.stringify(left.tags) === JSON.stringify(right.tags);
}

export function indexFile(filePath, storedContent) {
  // A locked note's text is sealed on disk: the index keeps none of it, so search cannot read it.
  const content = isLockedNote(storedContent) ? '' : storedContent;
  const db = getDb();
  const relativePath = relPath(filePath);
  const name = path.basename(filePath);
  // Имена с диска приходят разложенными (NFD), связи набирают сложёнными
  // (NFC). Ключ поиска нормализован, чтобы сравнение не зависело от формы.
  const nameNfc = name.normalize('NFC');
  const parentPath = path.dirname(relativePath).replace(/\\/g, '/');
  const stats = fs.statSync(filePath);
  const isDir = stats.isDirectory();
  const modifiedAt = stats.mtime.toISOString();
  const metadata = !isDir ? parseFrontmatterMetadata(content) : { title: '', tags: [], category: '' };
  const properties = !isDir ? readProperties(content || '') : [];
  const existing = db.prepare('SELECT * FROM notes_index WHERE path = ?').get(relativePath);

  if (existing) {
    db.prepare(`
      UPDATE notes_index SET name = ?, name_nfc = ?, is_dir = ?, parent_path = ?, title = ?, tags = ?, category = ?, content = ?, modified_at = ?, pinned = ?, props = ?
      WHERE path = ?
    `).run(
      name,
      nameNfc,
      isDir ? 1 : 0,
      parentPath,
      metadata.title || '',
      JSON.stringify(metadata.tags),
      metadata.category || '',
      content || '',
      modifiedAt,
      metadata.pinned ? 1 : 0,
      JSON.stringify(properties),
      relativePath
    );
  } else {
    db.prepare(`
      INSERT INTO notes_index (path, name, name_nfc, is_dir, parent_path, title, content, tags, category, date_created, modified_at, last_opened, pinned, props)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      relativePath,
      name,
      nameNfc,
      isDir ? 1 : 0,
      parentPath,
      metadata.title,
      content || '',
      JSON.stringify(metadata.tags),
      metadata.category || '',
      nowISO(),
      modifiedAt,
      nowISO(),
      metadata.pinned ? 1 : 0,
      JSON.stringify(properties)
    );
  }

  db.prepare('DELETE FROM note_links WHERE source_path = ?').run(relativePath);
  if (content && !isDir) {
    const links = extractWikiLinks(content);
    const insertLink = db.prepare('INSERT INTO note_links (source_path, target_name) VALUES (?, ?)');
    const transaction = db.transaction((sourcePath, linkNames) => {
      for (const target of linkNames) insertLink.run(sourcePath, target);
    });
    transaction(relativePath, links);
  }

  db.prepare('DELETE FROM note_aliases WHERE path = ?').run(relativePath);
  if (!isDir) {
    const insertAlias = db.prepare('INSERT OR IGNORE INTO note_aliases (path, alias, alias_nfc) VALUES (?, ?, ?)');
    for (const alias of metadata.aliases || []) insertAlias.run(relativePath, alias, alias.normalize('NFC'));
  }

  try {
    indexNoteForFts(db, {
      path: relativePath,
      name,
      title: metadata.title || '',
      tags: JSON.stringify(metadata.tags),
      content: content || '',
      is_dir: isDir ? 1 : 0,
    });
  } catch {
    // The FTS table is an accelerator; losing it must not block a save.
  }
}

export function indexDirectoryTree(dirPath) {
  const notesRoot = path.resolve(NOTES_DIR);
  const currentPath = path.resolve(dirPath);

  if (currentPath === notesRoot || !currentPath.startsWith(notesRoot + path.sep)) return;

  indexDirectoryTree(path.dirname(currentPath));
  indexFile(currentPath, '');
}

/** Есть ли в файле блок шапки вообще. */
// Блок без единого ключа (`---\n---`) — тоже шапка: раньше такой файл
// считался легаси, и удалённые метаданные возвращались из кэша.
const FRONTMATTER_BLOCK = /^\uFEFF?---(?:\r?\n)([\s\S]*?)(?:\r?\n)?---(?:\r?\n|$)/;

export function migrateCachedMetadataToFrontmatter(db = getDb()) {
  const rows = db.prepare(`
    SELECT path, title, tags, category
    FROM notes_index
    WHERE is_dir = 0
      AND (
        title IS NOT NULL AND title != ''
        OR tags IS NOT NULL AND tags != '' AND tags != '[]'
        OR category IS NOT NULL AND category != ''
      )
  `).all();

  for (const row of rows) {
    if (!row.path?.endsWith('.md')) continue;

    let fullPath;
    try {
      fullPath = resolveNotesPath(row.path);
    } catch {
      continue;
    }

    if (!fs.existsSync(fullPath)) continue;

    let content;
    try {
      content = readTextFile(fullPath);
    } catch {
      // Unreadable: left alone here. The pass below reads the same file and reports it.
      continue;
    }
    // Миграция существует для старых файлов, у которых метаданные жили только в
    // БД. Файл, у которого шапка УЖЕ есть, — не легаси: шапка это источник
    // истины. Раньше здесь бралось `currentMetadata.x || row.x`, и удалённое
    // пользователем значение возвращалось из кэша при каждом старте бэкенда —
    // ручная правка шапки отменялась молча.
    if (FRONTMATTER_BLOCK.test(content)) continue;

    const currentMetadata = parseFrontmatterMetadata(content);
    const cachedTags = parseCachedTags(row.tags);
    const nextMetadata = {
      title: currentMetadata.title || row.title || '',
      category: currentMetadata.category || row.category || '',
      tags: currentMetadata.tags.length ? currentMetadata.tags : cachedTags,
      pinned: currentMetadata.pinned,
    };

    if (!metadataEqual(currentMetadata, nextMetadata)) {
      writeFileAtomic(fullPath, upsertFrontmatter(content, nextMetadata), 'utf-8');
    }
  }
}

/**
 * Whether the index already holds this file exactly: same text, same modification time, same place. Such a file
 * is left alone — reading every note back into the database on each start, each sync and each setup was a
 * minute of frozen app on a big vault, for no change.
 */
function indexHolds(row, filePath, storedContent, stats) {
  if (!row) return false;
  const content = isLockedNote(storedContent) ? '' : storedContent;
  return row.modified_at === stats.mtime.toISOString()
    && row.content === content
    && row.name === path.basename(filePath)
    && row.parent_path === path.dirname(relPath(filePath)).replace(/\\/g, '/');
}

// Per connection: the prepared statements, and whether the one-off metadata migration has run.
const contexts = new WeakMap();
function contextOf(db) {
  let context = contexts.get(db);
  if (!context) {
    context = {
      migrated: false,
      rowOf: db.prepare('SELECT * FROM notes_index WHERE path = ?'),
      insertDir: db.prepare(`
        INSERT INTO notes_index (path, name, name_nfc, is_dir, parent_path, content, date_created, modified_at, last_opened)
        VALUES (?, ?, ?, 1, ?, '', ?, ?, ?)
      `),
      updateDir: db.prepare('UPDATE notes_index SET name = ?, parent_path = ?, modified_at = ? WHERE path = ?'),
      familyOf: db.prepare("SELECT path FROM notes_index WHERE path = ? OR path LIKE ? || '/%'"),
      deleteFamily: db.prepare("DELETE FROM notes_index WHERE path = ? OR path LIKE ? || '/%'"),
    };
    contexts.set(db, context);
  }
  return context;
}

/** A folder's row, made or brought up to date. */
function upsertDirectory(db, fullPath, name) {
  const { rowOf, insertDir, updateDir } = contextOf(db);
  const relativePath = relPath(fullPath);
  const existing = rowOf.get(relativePath);
  const parentPath = path.dirname(relativePath).replace(/\\/g, '/');
  const modifiedAt = fs.statSync(fullPath).mtime.toISOString();
  if (!existing) {
    insertDir.run(relativePath, name, name.normalize('NFC'), parentPath, nowISO(), modifiedAt, nowISO());
  } else if (existing.name !== name || existing.parent_path !== parentPath || existing.modified_at !== modifiedAt) {
    updateDir.run(name, parentPath, modifiedAt, relativePath);
  }
}

// The notes, and the folders, that the last look could not read, by path under the notes folder. Settings lists them.
const unreadable = new Set();

export function unreadableNotes() {
  return [...unreadable].sort();
}

function underNotes(fullPath) {
  return path.relative(NOTES_DIR, fullPath).split(path.sep).join('/') || fullPath;
}

// A file or folder that cannot be read is skipped, and the pass goes on. Its rows stay as they were.
function skipUnreadable(fullPath, error) {
  const name = underNotes(fullPath);
  unreadable.add(name);
  console.warn(`Could not read ${name}, so it was skipped: ${error.message}`);
}

/**
 * A note file, read into the index unless the index already holds it exactly. A note that cannot be read is skipped
 * and the pass goes on; a failure of the index itself is not caught here and ends the pass, as before.
 */
function indexNoteSafely(db, fullPath) {
  let text;
  let stats;
  try {
    text = readTextFile(fullPath);
    stats = fs.statSync(fullPath);
  } catch (error) {
    skipUnreadable(fullPath, error);
    return;
  }
  if (indexHolds(contextOf(db).rowOf.get(relPath(fullPath)), fullPath, text, stats)) return;
  indexFile(fullPath, text);
}

const isNoteFile = (name) => name.endsWith('.md') || name.endsWith('.txt');
const isHiddenSegment = (segment) => segment.startsWith('_') || segment.startsWith('.');

/** Everything under a folder; `seen` collects the paths met, for the sweep of what is gone. */
function indexSubtree(db, dir, seen) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    // Nothing under a folder that cannot be listed is looked at, so its rows are kept: the sweep must not drop them.
    for (const row of contextOf(db).familyOf.all(relPath(dir), relPath(dir))) seen?.add(row.path);
    skipUnreadable(dir, error);
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    seen?.add(relPath(fullPath));

    if (entry.isDirectory()) {
      if (isHiddenSegment(entry.name)) continue;
      upsertDirectory(db, fullPath, entry.name);
      indexSubtree(db, fullPath, seen);
      continue;
    }

    // The agent's rule files at the top of the folder (AGENTS.md, CLAUDE.md…) are not notes.
    if (isAgentRuleFile(fullPath)) continue;
    if (isNoteFile(entry.name)) indexNoteSafely(db, fullPath);
  }
}

export function indexAllFiles() {
  const db = getDb();
  const indexedPaths = new Set();
  let ftsAvailable = true;
  unreadable.clear();

  fs.mkdirSync(NOTES_DIR, { recursive: true });
  try {
    ensureFtsSchema(db);
  } catch {
    // No FTS5 in this build — search falls back to the linear scan.
    ftsAvailable = false;
  }
  // Notes from before metadata lived in the file: moved over once. It reads every note that has any metadata,
  // which is most of them, so it does not run again for each pass.
  const context = contextOf(db);
  if (!context.migrated) {
    migrateCachedMetadataToFrontmatter(db);
    context.migrated = true;
  }

  // One transaction for the whole pass: every statement committing on its own made each note cost a disk sync.
  db.transaction(() => {
    indexSubtree(db, NOTES_DIR, indexedPaths);

    const allPaths = db.prepare('SELECT path FROM notes_index').all().map((row) => row.path);
    for (const itemPath of allPaths) {
      if (!indexedPaths.has(itemPath)) forgetPath(db, itemPath);
    }

    ensureTextIndex(db, ftsAvailable);
  })();
}

/** A note, or a folder with everything in it, gone from the disk: out of the index and the text index. */
function forgetPath(db, itemPath) {
  const { familyOf, deleteFamily } = contextOf(db);
  const family = familyOf.all(itemPath, itemPath).map((row) => row.path);
  deleteFamily.run(itemPath, itemPath);
  for (const gone of family) {
    try {
      removeNoteFromFts(db, gone);
    } catch {
      // A missing FTS index must not break reindexing.
    }
  }
}

// Notes left alone are not written to the text index again, so an index that fell out of step (a new tokenizer,
// a table dropped by an older build) has to be filled from the rows.
function ensureTextIndex(db, available = true) {
  if (!available) return;
  try {
    if (!ftsInSync(db)) rebuildFts(db);
  } catch {
    // Search falls back to the scan.
  }
}

/**
 * Brings the index up to date for these files only (absolute paths): what a pull or an agent changed, rather than
 * every note again. A file that is gone leaves the index; a folder is read through; a file under a hidden folder
 * is not a note.
 */
export function indexPaths(fullPaths) {
  const db = getDb();
  const notesRoot = path.resolve(NOTES_DIR);
  db.transaction(() => {
    const ensured = new Set();
    const ensureAncestors = (dir) => {
      const absolute = path.resolve(dir);
      if (absolute === notesRoot || !absolute.startsWith(notesRoot + path.sep) || ensured.has(absolute)) return;
      ensureAncestors(path.dirname(absolute));
      upsertDirectory(db, absolute, path.basename(absolute));
      ensured.add(absolute);
    };
    for (const fullPath of fullPaths) {
      const absolute = path.resolve(fullPath);
      const relative = path.relative(notesRoot, absolute);
      if (!relative || relative.startsWith('..')) continue;
      if (relative.split(path.sep).some(isHiddenSegment)) continue;
      // This look decides again whatever it was before: readable, unreadable, or gone.
      unreadable.delete(underNotes(absolute));

      let stats = null;
      try { stats = fs.statSync(absolute); } catch { /* gone */ }
      if (!stats) {
        forgetPath(db, relPath(absolute));
        continue;
      }
      ensureAncestors(path.dirname(absolute));
      if (stats.isDirectory()) {
        upsertDirectory(db, absolute, path.basename(absolute));
        indexSubtree(db, absolute, null);
      } else if (!isAgentRuleFile(absolute) && isNoteFile(path.basename(absolute))) {
        indexNoteSafely(db, absolute);
      }
    }
    ensureTextIndex(db);
  })();
}
