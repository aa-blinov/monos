import fs from 'fs';
import path from 'path';
import { getDb } from '../database.js';
import { NOTES_DIR } from '../config.js';
import { assertCreatableSegments, httpError, relPath, resolveNotesChildPath, resolveNotesPath } from '../utils.js';
import { indexAllFiles } from '../indexing.js';
import { COLOR_VALUE, ICON_NAME, setFolderConfig } from '../folder-config.js';
import { sendError } from './helpers.js';

// The item at fullPath, or the nearest one above it that exists. mkdir cannot make folders through a file.
function nearestExisting(fullPath) {
  let current = fullPath;
  while (!fs.existsSync(current) && path.dirname(current) !== current) current = path.dirname(current);
  return current;
}

function checkedAppearance(value, name, pattern) {
  if (value === undefined || value === null || value === '') return value;
  if (typeof value !== 'string' || !pattern.test(value)) throw httpError(400, `The ${name} is not a valid value`, `invalid_${name}`);
  return value;
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
      sendError(res, error);
    }
  });

  app.post('/api/directory/create', (req, res) => {
    try {
      const { path: dirPath } = req.query;
      if (typeof dirPath !== 'string' || dirPath.trim() === '') {
        return res.status(400).json({ detail: 'Path required', code: 'path_required' });
      }
      const fullPath = dirPath === 'notes' || dirPath.startsWith('notes/')
        ? resolveNotesPath(dirPath, { allowRoot: true })
        : resolveNotesChildPath(dirPath);
      // Every folder of the path is a name the system has to be able to create, not only the last one.
      assertCreatableSegments(path.relative(NOTES_DIR, fullPath));
      // mkdir would fail on a file in the way and name the path in its error, so such a request is refused here.
      const nearest = nearestExisting(fullPath);
      if (!fs.statSync(nearest).isDirectory()) {
        if (nearest === fullPath) return res.status(409).json({ detail: 'Target already exists', code: 'exists' });
        return res.status(400).json({ detail: 'Parent is not a folder', code: 'not_a_folder' });
      }
      fs.mkdirSync(fullPath, { recursive: true });
      indexAllFiles();
      res.json({ message: 'Directory created' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/directory/icon', (req, res) => {
    try {
      const { path: itemPath } = req.query;
      if (typeof itemPath !== 'string' || itemPath.trim() === '') {
        return res.status(400).json({ detail: 'Path required', code: 'path_required' });
      }
      // Inside the notes folder, in the spelling the index uses; a folder the person has not made yet is fine.
      const appPath = relPath(resolveNotesPath(itemPath, { allowRoot: true }));
      const body = req.body || {};
      const icon = checkedAppearance(body.icon, 'icon', ICON_NAME);
      const color = checkedAppearance(body.color, 'color', COLOR_VALUE);
      const db = getDb();

      if ((icon === null && color === null) || (icon === undefined && color === undefined)) {
        setFolderConfig(db, appPath, { icon: null, color: null });
      } else {
        setFolderConfig(db, appPath, {
          icon: icon === undefined ? undefined : icon || null,
          color: color === undefined ? undefined : color || null,
        });
      }

      res.json({ message: 'Icon updated' });
    } catch (error) {
      sendError(res, error);
    }
  });
}
