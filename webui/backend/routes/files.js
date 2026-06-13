import fs from 'fs';
import path from 'path';
import { getDb } from '../database.js';
import { parseFrontmatterMetadata } from '../search.js';
import { NOTES_DIR } from '../config.js';
import { humanSize, nowISO, relPath, resolveNotesPath, safePathName } from '../utils.js';
import { indexFile, indexAllFiles } from '../indexing.js';
import { upsertFrontmatter } from '../frontmatter.js';
import { requireQueryPath, requireBodyFields, requireStringField } from './validate.js';

export function registerFileRoutes(app) {
  app.get('/api/file', (req, res) => {
    try {
      const { path: filePath } = req.query;
      const fullPath = resolveNotesPath(filePath);
      if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: 'File not found' });
      if (fs.statSync(fullPath).isDirectory()) return res.status(400).json({ detail: 'Path is a directory' });

      const content = fs.readFileSync(fullPath, 'utf-8');
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
      fs.writeFileSync(fullPath, content, 'utf-8');
      indexFile(fullPath, content);
      res.json({ message: 'Saved' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  app.delete('/api/file', (req, res) => {
    try {
      const { path: filePath } = req.query;
      const fullPath = resolveNotesPath(filePath);
      if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: 'File not found' });

      if (fs.statSync(fullPath).isDirectory()) fs.rmSync(fullPath, { recursive: true });
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
      const newFullPath = path.join(path.dirname(fullPath), newName);
      fs.renameSync(fullPath, newFullPath);

      const db = getDb();
      const newRelativePath = relPath(newFullPath);
      db.prepare('UPDATE notes_index SET path = ?, name = ? WHERE path = ?').run(newRelativePath, newName, filePath);

      if (fs.statSync(newFullPath).isDirectory()) {
        const children = db.prepare('SELECT path FROM notes_index WHERE path LIKE ? || \'/%\'').all(filePath);
        for (const child of children) {
          const newChildPath = child.path.replace(filePath, newRelativePath);
          db.prepare('UPDATE notes_index SET path = ?, parent_path = ? WHERE path = ?').run(
            newChildPath,
            path.dirname(newChildPath).replace(/\\/g, '/'),
            child.path
          );
        }
        db.prepare('UPDATE folder_config SET path = ? WHERE path = ?').run(newRelativePath, filePath);
      }

      res.json({ path: newRelativePath, name: newName });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  app.post('/api/file/move', (req, res) => {
    try {
      const { source, target } = req.query;
      const sourceFull = resolveNotesPath(source);
      const targetDir = target === 'notes' ? NOTES_DIR : resolveNotesPath(target, { allowRoot: true });
      fs.renameSync(sourceFull, path.join(targetDir, path.basename(sourceFull)));
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
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  app.put('/api/file/metadata', (req, res) => {
    try {
      const { path: filePath } = req.query;
      const fullPath = resolveNotesPath(filePath);
      const { title, tags, category, content } = req.body;
      const originalContent = typeof content === 'string'
        ? content
        : fs.readFileSync(fullPath, 'utf-8');
      const currentMetadata = parseFrontmatterMetadata(originalContent);
      const nextMetadata = {
        title: title ?? currentMetadata.title,
        category: category ?? currentMetadata.category,
        tags: Array.isArray(tags) ? tags : currentMetadata.tags,
      };
      const nextContent = upsertFrontmatter(originalContent, nextMetadata);
      fs.writeFileSync(fullPath, nextContent, 'utf-8');
      indexFile(fullPath, nextContent);

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
