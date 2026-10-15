import fs from 'fs';
import path from 'path';
import { getDb } from '../database.js';
import { parseFrontmatterMetadata } from '../search.js';
import { NOTES_DIR } from '../config.js';
import { httpError, humanSize, nowISO, readTextFile, relPath, resolveNotesPath, safePathName } from '../utils.js';
import { indexFile, indexAllFiles } from '../indexing.js';
import { setFrontmatterProperty, upsertFrontmatter } from '../frontmatter.js';
import { removeNoteFromFts } from '../fts.js';
import { planLinkUpdate, refreshNotesAfterRename, rewriteNoteFile } from '../link-rename.js';
import { normalizePropertyKey, normalizePropertyType, normalizePropertyValue, parseStoredProperties, readProperties } from '../properties.js';
import { isLockedNote, moveSession, readWithSession, sealWithSession, sessionFor } from '../note-lock.js';
import { requireQueryPath, requireBodyFields, requireStringField } from './validate.js';

/**
 * Moves the index rows of a note or folder, and of everything inside a folder, to their new
 * paths, so dates, board order and folder settings stay with the note. note_links references
 * notes_index by path, so its rows for the old paths go first; re-indexing rebuilds them.
 */
function relocateIndexRows(db, oldPath, newPath, newName, newParent) {
  const moved = db.prepare("SELECT path FROM notes_index WHERE path = ? OR path LIKE ? || '/%'").all(oldPath, oldPath);
  db.prepare("DELETE FROM note_links WHERE source_path = ? OR source_path LIKE ? || '/%'").run(oldPath, oldPath);
  // The rows are rebuilt by the reindex that follows the move; keeping them would block the path update.
  db.prepare("DELETE FROM note_aliases WHERE path = ? OR path LIKE ? || '/%'").run(oldPath, oldPath);
  for (const row of moved) removeNoteFromFts(db, row.path);
  db.prepare('UPDATE notes_index SET path = ?, name = ?, parent_path = ? WHERE path = ?').run(newPath, newName, newParent, oldPath);
  for (const row of moved) {
    if (row.path === oldPath) continue;
    const next = newPath + row.path.slice(oldPath.length);
    db.prepare('UPDATE notes_index SET path = ?, parent_path = ? WHERE path = ?').run(next, path.dirname(next).replace(/\\/g, '/'), row.path);
  }
  db.prepare('UPDATE folder_config SET path = ? WHERE path = ?').run(newPath, oldPath);
  db.prepare("UPDATE folder_config SET path = ? || SUBSTR(path, ?) WHERE path LIKE ? || '/%'").run(newPath, oldPath.length + 1, oldPath);
}

// The text a note is edited as. A locked note is edited through its session key, and only while it is
// unlocked: without the key the edit is refused, never written in plain text over the sealed file.
function noteTextForEdit(fullPath, filePath) {
  const stored = readTextFile(fullPath);
  if (!isLockedNote(stored)) return { text: stored, session: null };
  const session = sessionFor(filePath);
  if (!session) throw httpError(423, 'This note is locked');
  return { text: readWithSession(stored, session), session };
}

// Writes an edited note back: sealed again when it is locked, plain otherwise. Returns what the file holds.
function storeNoteText(fullPath, text, session) {
  const stored = session ? sealWithSession(text, session) : text;
  fs.writeFileSync(fullPath, stored, 'utf-8');
  return stored;
}

export function registerFileRoutes(app) {
  app.get('/api/file', (req, res) => {
    try {
      const { path: filePath } = req.query;
      const fullPath = resolveNotesPath(filePath);
      if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: 'File not found' });
      if (fs.statSync(fullPath).isDirectory()) return res.status(400).json({ detail: 'Path is a directory' });
      const note = getDb().prepare('SELECT trashed_at FROM notes_index WHERE path = ?').get(filePath);
      if (note?.trashed_at) return res.status(410).json({ detail: 'File is in trash' });

      const stored = readTextFile(fullPath);
      let content = stored;
      if (isLockedNote(stored)) {
        const session = sessionFor(filePath);
        if (!session) return res.status(423).json({ detail: 'This note is locked', locked: true });
        content = readWithSession(stored, session);
      }
      getDb().prepare('UPDATE notes_index SET last_opened = ? WHERE path = ?').run(nowISO(), filePath);
      res.json({ content });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  app.post('/api/file', (req, res) => {
    try {
      const filePath = requireQueryPath(req);
      requireBodyFields(req, 'content');
      const { content } = req.body;
      const fullPath = resolveNotesPath(filePath);
      const note = getDb().prepare('SELECT trashed_at FROM notes_index WHERE path = ?').get(filePath);
      if (note?.trashed_at) return res.status(410).json({ detail: 'File is in trash' });
      // Saving does not recreate a note that was renamed or deleted; creating one is explicit.
      if (!fs.existsSync(fullPath) && req.query.create !== '1') {
        return res.status(404).json({ detail: 'File not found' });
      }
      const locked = fs.existsSync(fullPath) && isLockedNote(readTextFile(fullPath));
      const session = locked ? sessionFor(filePath) : null;
      if (locked && !session) return res.status(423).json({ detail: 'This note is locked', locked: true });
      indexFile(fullPath, storeNoteText(fullPath, content, session));
      const updated = getDb().prepare('SELECT modified_at FROM notes_index WHERE path = ?').get(filePath);
      res.json({ message: 'Saved', modified: updated?.modified_at || fs.statSync(fullPath).mtime.toISOString() });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  app.delete('/api/file', (req, res) => {
    try {
      const { path: filePath } = req.query;
      const permanent = req.query.permanent === '1' || req.query.permanent === 'true';
      const fullPath = resolveNotesPath(filePath);
      if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: 'File not found' });
      const isDir = fs.statSync(fullPath).isDirectory();

      if (!permanent && !isDir) {
        const trashedAt = nowISO();
        const db = getDb();
        const changed = db.prepare('UPDATE notes_index SET trashed_at = ?, board_order = NULL WHERE path = ? AND is_dir = 0')
          .run(trashedAt, filePath);
        if (changed.changes === 0) return res.status(404).json({ detail: 'File not found' });
        res.json({ message: 'Moved to trash', trashedAt });
        return;
      }

      if (isDir) fs.rmSync(fullPath, { recursive: true });
      else fs.unlinkSync(fullPath);

      const db = getDb();
      db.prepare('DELETE FROM notes_index WHERE path = ? OR path LIKE ? || \'/%\'').run(filePath, filePath);
      db.prepare('DELETE FROM folder_config WHERE path = ? OR path LIKE ? || \'/%\'').run(filePath, filePath);
      db.prepare('DELETE FROM note_links WHERE source_path = ? OR source_path LIKE ? || \'/%\'').run(filePath, filePath);

      res.json({ message: 'Deleted' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  app.post('/api/file/rename', (req, res) => {
    try {
      const filePath = requireQueryPath(req);
      const newName = safePathName(req.body?.new_name);
      const fullPath = resolveNotesPath(filePath);
      if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: 'File not found' });
      const newFullPath = path.join(path.dirname(fullPath), newName);
      if (newFullPath !== fullPath && fs.existsSync(newFullPath)) {
        return res.status(409).json({ detail: 'Target already exists' });
      }
      const newRelativePath = relPath(newFullPath);
      const isDir = fs.statSync(fullPath).isDirectory();
      // Decided before the move: the index still knows the linking notes by the old name.
      const linkPlan = isDir ? null : planLinkUpdate(getDb(), filePath, newRelativePath);
      fs.renameSync(fullPath, newFullPath);
      relocateIndexRows(getDb(), filePath, newRelativePath, newName, path.dirname(newRelativePath).replace(/\\/g, '/'));
      moveSession(filePath, newRelativePath);

      let links = { updatedLinks: 0, updatedPaths: [], failedPaths: [] };
      if (isDir) indexAllFiles();
      else links = refreshNotesAfterRename({ oldPath: filePath, newPath: newRelativePath, ...linkPlan });
      res.json({ path: newRelativePath, name: newName, ...links });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  app.post('/api/file/move', (req, res) => {
    try {
      const { source, target } = req.query;
      const sourceFull = resolveNotesPath(source);
      const targetDir = target === 'notes' ? NOTES_DIR : resolveNotesPath(target, { allowRoot: true });
      const destination = path.join(targetDir, path.basename(sourceFull));
      // rename() would silently replace a note with the same name in the target folder.
      if (path.resolve(destination) !== path.resolve(sourceFull) && fs.existsSync(destination)) {
        return res.status(409).json({ detail: 'Target already exists' });
      }
      const newRelativePath = relPath(destination);
      fs.renameSync(sourceFull, destination);
      relocateIndexRows(getDb(), source, newRelativePath, path.basename(destination), path.dirname(newRelativePath).replace(/\\/g, '/'));
      moveSession(source, newRelativePath);
      indexAllFiles();
      res.json({ message: 'Moved' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  app.get('/api/file-info', (req, res) => {
    try {
      const { path: filePath } = req.query;
      const fullPath = resolveNotesPath(filePath, { allowRoot: true });
      if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: 'File not found' });

      const stats = fs.statSync(fullPath);
      const meta = getDb().prepare('SELECT * FROM notes_index WHERE path = ?').get(filePath);
      if (!stats.isDirectory() && meta?.trashed_at) return res.status(410).json({ detail: 'File is in trash' });
      const config = getDb().prepare('SELECT icon, color FROM folder_config WHERE path = ?').get(filePath);

      res.json({
        path: filePath,
        name: path.basename(filePath),
        is_dir: stats.isDirectory(),
        icon: config?.icon || null,
        color: config?.color || null,
        size: stats.size,
        size_human: humanSize(stats.size),
        modified: stats.mtime.toISOString(),
        created: meta?.date_created || stats.birthtime?.toISOString() || stats.mtime.toISOString(),
        metadata: meta ? {
          title: meta.title || null,
          date: meta.date_created || null,
          category: meta.category || null,
          tags: JSON.parse(meta.tags || '[]'),
        } : null,
        properties: meta ? parseStoredProperties(meta.props) : [],
        locked: !stats.isDirectory() && isLockedNote(readTextFile(fullPath)),
        unlocked: Boolean(sessionFor(filePath)),
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  // Sets one custom property in the note's frontmatter, or removes it with `remove: true`. The keys the
  // app manages (title, tags, category, pinned, aliases) have their own controls and are refused here.
  app.put('/api/file/property', (req, res) => {
    try {
      const filePath = requireQueryPath(req);
      const fullPath = resolveNotesPath(filePath);
      const note = getDb().prepare('SELECT trashed_at FROM notes_index WHERE path = ?').get(filePath);
      if (note?.trashed_at) return res.status(410).json({ detail: 'File is in trash' });
      if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: 'File not found' });

      const key = normalizePropertyKey(req.body?.key);
      if (!key) throw httpError(400, 'The property name is not allowed');
      let property = null;
      if (!req.body?.remove) {
        const type = normalizePropertyType(req.body?.type);
        const value = type ? normalizePropertyValue(type, req.body?.value) : null;
        if (!type || value === null) throw httpError(400, 'The value does not match the property type');
        property = { type, value };
      }

      const editable = noteTextForEdit(fullPath, filePath);
      if (editable.session) {
        // A locked note keeps its properties inside the sealed text: change them there, and seal it again.
        const next = setFrontmatterProperty(editable.text, key, property);
        indexFile(fullPath, storeNoteText(fullPath, next, editable.session));
        res.json({ path: filePath, properties: readProperties(next) });
        return;
      }
      // rewriteNoteFile keeps the encoding and the modification time, and refuses a file that is not UTF-8.
      try {
        rewriteNoteFile(fullPath, (text) => {
          const content = setFrontmatterProperty(text, key, property);
          return { content, count: content === text ? 0 : 1 };
        });
      } catch (error) {
        if (error.message === 'not UTF-8') throw httpError(409, 'The note is not UTF-8 text, so it was left unchanged');
        throw error;
      }
      const text = readTextFile(fullPath);
      indexFile(fullPath, text);
      res.json({ path: filePath, properties: readProperties(text) });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  app.put('/api/file/metadata', (req, res) => {
    try {
      const { path: filePath } = req.query;
      const fullPath = resolveNotesPath(filePath);
      const { title, tags, category, content, pinned } = req.body;
      const note = getDb().prepare('SELECT trashed_at FROM notes_index WHERE path = ?').get(filePath);
      if (note?.trashed_at) return res.status(410).json({ detail: 'File is in trash' });
      const editable = noteTextForEdit(fullPath, filePath);
      const originalContent = typeof content === 'string'
        ? content
        : editable.text;
      const currentMetadata = parseFrontmatterMetadata(originalContent);
      const nextMetadata = {
        title: title ?? currentMetadata.title,
        category: category ?? currentMetadata.category,
        tags: Array.isArray(tags) ? tags : currentMetadata.tags,
        pinned: typeof pinned === 'boolean' ? pinned : currentMetadata.pinned,
      };
      const nextContent = upsertFrontmatter(originalContent, nextMetadata);
      indexFile(fullPath, storeNoteText(fullPath, nextContent, editable.session));

      const db = getDb();
      const updated = db.prepare('SELECT * FROM notes_index WHERE path = ?').get(filePath);
      res.json({
        title: updated?.title || '',
        category: updated?.category || '',
        tags: JSON.parse(updated?.tags || '[]'),
        content: nextContent,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });
}
