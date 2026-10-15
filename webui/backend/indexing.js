import fs from 'fs';
import path from 'path';
import { getDb } from './database.js';
import { indexNoteForFts, removeNoteFromFts, ensureFtsSchema } from './fts.js';
import { parseFrontmatterMetadata } from './search.js';
import { NOTES_DIR } from './config.js';
import { upsertFrontmatter } from './frontmatter.js';
import { extractWikiLinks, nowISO, readTextFile, relPath, resolveNotesPath } from './utils.js';

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

export function indexFile(filePath, content) {
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
  const existing = db.prepare('SELECT * FROM notes_index WHERE path = ?').get(relativePath);

  if (existing) {
    db.prepare(`
      UPDATE notes_index SET name = ?, name_nfc = ?, is_dir = ?, parent_path = ?, title = ?, tags = ?, category = ?, content = ?, modified_at = ?, pinned = ?
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
      relativePath
    );
  } else {
    db.prepare(`
      INSERT INTO notes_index (path, name, name_nfc, is_dir, parent_path, title, content, tags, category, date_created, modified_at, last_opened, pinned)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      metadata.pinned ? 1 : 0
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

    const content = readTextFile(fullPath);
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
      fs.writeFileSync(fullPath, upsertFrontmatter(content, nextMetadata), 'utf-8');
    }
  }
}

export function indexAllFiles() {
  const db = getDb();
  const indexedPaths = new Set();

  fs.mkdirSync(NOTES_DIR, { recursive: true });
  try {
    ensureFtsSchema(db);
  } catch {
    // No FTS5 in this build — search falls back to the linear scan.
  }
  migrateCachedMetadataToFrontmatter(db);

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = relPath(fullPath);
      indexedPaths.add(relativePath);

      if (entry.isDirectory()) {
        if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

        const existing = db.prepare('SELECT * FROM notes_index WHERE path = ?').get(relativePath);
        const parentPath = path.dirname(relativePath).replace(/\\/g, '/');

        if (!existing) {
          const modifiedAt = fs.statSync(fullPath).mtime.toISOString();
          db.prepare(`
            INSERT INTO notes_index (path, name, name_nfc, is_dir, parent_path, content, date_created, modified_at, last_opened)
            VALUES (?, ?, ?, 1, ?, '', ?, ?, ?)
          `).run(relativePath, entry.name, entry.name.normalize('NFC'), parentPath, nowISO(), modifiedAt, nowISO());
        } else {
          const modifiedAt = fs.statSync(fullPath).mtime.toISOString();
          db.prepare('UPDATE notes_index SET name = ?, parent_path = ?, modified_at = ? WHERE path = ?')
            .run(entry.name, parentPath, modifiedAt, relativePath);
        }

        walk(fullPath);
        continue;
      }

      if (entry.name.endsWith('.md') || entry.name.endsWith('.txt')) {
        indexFile(fullPath, readTextFile(fullPath));
      }
    }
  }

  walk(NOTES_DIR);

  const allPaths = db.prepare('SELECT path FROM notes_index').all().map((row) => row.path);
  for (const itemPath of allPaths) {
    if (!indexedPaths.has(itemPath)) {
      db.prepare('DELETE FROM notes_index WHERE path = ? OR path LIKE ? || \'/%\'').run(itemPath, itemPath);
      try {
        removeNoteFromFts(db, itemPath);
      } catch {
        // Same as above: a missing FTS index must not break reindexing.
      }
    }
  }
}
