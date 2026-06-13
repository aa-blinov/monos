import fs from 'fs';
import path from 'path';
import { getDb } from '../database.js';
import { NOTES_DIR } from '../config.js';
import { relPath, resolveNotesChildPath, resolveNotesPath } from '../utils.js';
import { indexAllFiles } from '../indexing.js';

export function registerDirectoryRoutes(app) {
  app.get('/api/directories', (req, res) => {
    try {
      const directories = [''];

      function walk(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
          const fullPath = path.join(dir, entry.name);
          directories.push(relPath(fullPath).replace('notes/', ''));
          walk(fullPath);
        }
      }

      walk(NOTES_DIR);
      res.json(directories);
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });

  app.post('/api/directory/create', (req, res) => {
    try {
      let { path: dirPath } = req.query;
      if (typeof dirPath !== 'string' || dirPath.trim() === '') {
        return res.status(400).json({ detail: 'Path required' });
      }
      const fullPath = dirPath.startsWith('notes/')
        ? resolveNotesPath(dirPath, { allowRoot: true })
        : resolveNotesChildPath(dirPath);
      fs.mkdirSync(fullPath, { recursive: true });
      indexAllFiles();
      res.json({ message: 'Directory created' });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  app.post('/api/directory/icon', (req, res) => {
    try {
      const { path: itemPath } = req.query;
      const { icon, color } = req.body || {};
      const db = getDb();
      const existing = db.prepare('SELECT * FROM folder_config WHERE path = ?').get(itemPath);

      if ((icon === null && color === null) || (icon === undefined && color === undefined)) {
        if (existing) db.prepare('DELETE FROM folder_config WHERE path = ?').run(itemPath);
      } else if (existing) {
        if (icon !== undefined) db.prepare('UPDATE folder_config SET icon = ? WHERE path = ?').run(icon || null, itemPath);
        if (color !== undefined) db.prepare('UPDATE folder_config SET color = ? WHERE path = ?').run(color || null, itemPath);
      } else {
        db.prepare('INSERT INTO folder_config (path, icon, color) VALUES (?, ?, ?)').run(itemPath, icon || null, color || null);
      }

      res.json({ message: 'Icon updated' });
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });
}
