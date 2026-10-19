import fs from 'fs';
import path from 'path';
import { getDb } from '../database.js';
import { NOTES_DIR } from '../config.js';
import { assertFileName, relPath, resolveNotesChildPath, resolveNotesPath } from '../utils.js';
import { indexAllFiles } from '../indexing.js';

// The item at fullPath, or the nearest one above it that exists. mkdir cannot make folders through a file.
function nearestExisting(fullPath) {
  let current = fullPath;
  while (!fs.existsSync(current) && path.dirname(current) !== current) current = path.dirname(current);
  return current;
}

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
      // Имя папки — последний сегмент пути; его ОС должна уметь создать.
      assertFileName(path.basename(dirPath));
      const fullPath = dirPath.startsWith('notes/')
        ? resolveNotesPath(dirPath, { allowRoot: true })
        : resolveNotesChildPath(dirPath);
      // mkdir would fail on a file in the way and name the path in its error, so such a request is refused here.
      const nearest = nearestExisting(fullPath);
      if (!fs.statSync(nearest).isDirectory()) {
        if (nearest === fullPath) return res.status(409).json({ detail: 'Target already exists' });
        return res.status(400).json({ detail: 'Parent is not a folder' });
      }
      fs.mkdirSync(fullPath, { recursive: true });
      indexAllFiles();
      res.json({ message: 'Directory created' });
    } catch (error) {
      // Only errors the app raises on purpose have a message to send; fs errors name a folder on this computer, so they are logged.
      if (!error.statusCode) {
        console.error('/api/directory/create error:', error);
        return res.status(500).json({ detail: 'Internal server error' });
      }
      res.status(error.statusCode).json({ detail: error.message });
    }
  });

  app.post('/api/directory/icon', (req, res) => {
    try {
      const { path: itemPath } = req.query;
      if (typeof itemPath !== 'string' || itemPath.trim() === '') {
        return res.status(400).json({ detail: 'Path required' });
      }
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
