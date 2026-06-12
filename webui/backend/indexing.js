import fs from 'fs';
import path from 'path';
import { getDb } from './database.js';
import { parseFrontmatterMetadata } from './search.js';
import { NOTES_DIR } from './config.js';
import { upsertFrontmatter } from './frontmatter.js';
import { extractWikiLinks, nowISO, relPath, resolveNotesPath } from './utils.js';

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
    && JSON.stringify(left.tags) === JSON.stringify(right.tags);
}

export function indexFile(filePath, content) {
  const db = getDb();
  const relativePath = relPath(filePath);
  const name = path.basename(filePath);
  const parentPath = path.dirname(relativePath).replace(/\\/g, '/');
  const stats = fs.statSync(filePath);
  const isDir = stats.isDirectory();
  const metadata = !isDir ? parseFrontmatterMetadata(content) : { title: '', tags: [], category: '' };
  const existing = db.prepare('SELECT * FROM notes_index WHERE path = ?').get(relativePath);

  if (existing) {
    db.prepare(`
      UPDATE notes_index SET name = ?, is_dir = ?, parent_path = ?, title = ?, tags = ?, category = ?, content = ?
      WHERE path = ?
    `).run(
      name,
      isDir ? 1 : 0,
      parentPath,
      metadata.title || '',
      JSON.stringify(metadata.tags),
      metadata.category || '',
      content || '',
      relativePath
    );
  } else {
    db.prepare(`
      INSERT INTO notes_index (path, name, is_dir, parent_path, title, content, tags, category, date_created, last_opened)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      relativePath,
      name,
      isDir ? 1 : 0,
      parentPath,
      metadata.title,
      content || '',
      JSON.stringify(metadata.tags),
      metadata.category || '',
      nowISO(),
      nowISO()
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
}

export function indexDirectoryTree(dirPath) {
  const notesRoot = path.resolve(NOTES_DIR);
  const currentPath = path.resolve(dirPath);

  if (currentPath === notesRoot || !currentPath.startsWith(notesRoot + path.sep)) return;

  indexDirectoryTree(path.dirname(currentPath));
  indexFile(currentPath, '');
}

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

    const content = fs.readFileSync(fullPath, 'utf-8');
    const currentMetadata = parseFrontmatterMetadata(content);
    const cachedTags = parseCachedTags(row.tags);
    const nextMetadata = {
      title: currentMetadata.title || row.title || '',
      category: currentMetadata.category || row.category || '',
      tags: currentMetadata.tags.length ? currentMetadata.tags : cachedTags,
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
          db.prepare(`
            INSERT INTO notes_index (path, name, is_dir, parent_path, content, date_created, last_opened)
            VALUES (?, ?, 1, ?, '', ?, ?)
          `).run(relativePath, entry.name, parentPath, nowISO(), nowISO());
        } else {
          db.prepare('UPDATE notes_index SET name = ?, parent_path = ? WHERE path = ?')
            .run(entry.name, parentPath, relativePath);
        }

        walk(fullPath);
        continue;
      }

      if (entry.name.endsWith('.md') || entry.name.endsWith('.txt')) {
        indexFile(fullPath, fs.readFileSync(fullPath, 'utf-8'));
      }
    }
  }

  walk(NOTES_DIR);

  const allPaths = db.prepare('SELECT path FROM notes_index').all().map((row) => row.path);
  for (const itemPath of allPaths) {
    if (!indexedPaths.has(itemPath)) {
      db.prepare('DELETE FROM notes_index WHERE path = ? OR path LIKE ? || \'/%\'').run(itemPath, itemPath);
    }
  }
}
