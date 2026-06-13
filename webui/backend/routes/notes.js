import fs from 'fs';
import path from 'path';
import { getDb } from '../database.js';
import { parseFrontmatterMetadata, searchEntries } from '../search.js';
import { NOTES_DIR } from '../config.js';
import { nowISO, relPath, resolveNotesChildPath, resolveNotesPath } from '../utils.js';
import { indexAllFiles, indexDirectoryTree, indexFile } from '../indexing.js';
import { upsertFrontmatter } from '../frontmatter.js';
import { noteCardPayload, parseTags } from './helpers.js';
import { requireBodyFields, requireStringField } from './validate.js';

export function registerNoteRoutes(app) {
  app.post('/api/notes/create', (req, res) => {
    try {
      requireBodyFields(req, 'title');
      const { title, category, tags, content } = req.body;
      const fileName = title.replace(/[/\\?%*:|"<>]/g, '_') + '.md';
      const dirPath = category ? resolveNotesChildPath(category) : NOTES_DIR;
      fs.mkdirSync(dirPath, { recursive: true });
      if (category) indexDirectoryTree(dirPath);

      const filePath = path.join(dirPath, fileName);
      const noteContent = upsertFrontmatter(content || '', { title, category, tags: tags || [] });
      fs.writeFileSync(filePath, noteContent, 'utf-8');

      const relativePath = relPath(filePath);
      indexFile(filePath, noteContent);
      getDb().prepare('UPDATE notes_index SET trashed_at = NULL WHERE path = ?').run(relativePath);

      res.json({ path: relativePath, name: fileName, isDir: false });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  app.get('/api/notes/recent', (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);
      const entries = getDb().prepare(
        `SELECT notes_index.*, folder_config.color
         FROM notes_index
         LEFT JOIN folder_config ON folder_config.path = notes_index.path
         WHERE notes_index.is_dir = 0
           AND (notes_index.trashed_at IS NULL OR notes_index.trashed_at = '')
         ORDER BY notes_index.board_order IS NULL ASC,
                  notes_index.board_order ASC,
                  notes_index.last_opened DESC
         LIMIT ? OFFSET ?`
      ).all(limit, offset);

      res.json(entries.map(noteCardPayload));
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });

  app.get('/api/notes/trash', (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 200);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);
      const entries = getDb().prepare(`
        SELECT notes_index.*, folder_config.color
        FROM notes_index
        LEFT JOIN folder_config ON folder_config.path = notes_index.path
        WHERE notes_index.is_dir = 0
          AND notes_index.trashed_at IS NOT NULL
          AND notes_index.trashed_at != ''
        ORDER BY notes_index.trashed_at DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset);

      res.json(entries.map(noteCardPayload));
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });

  app.post('/api/notes/restore', (req, res) => {
    try {
      const { path: filePath } = req.query;
      const fullPath = resolveNotesPath(filePath);
      if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: 'File not found' });
      if (fs.statSync(fullPath).isDirectory()) return res.status(400).json({ detail: 'Path is a directory' });

      const restoredAt = nowISO();
      const db = getDb();
      const changed = db.prepare('UPDATE notes_index SET trashed_at = NULL, last_opened = ? WHERE path = ? AND is_dir = 0')
        .run(restoredAt, filePath);
      if (changed.changes === 0) return res.status(404).json({ detail: 'File not found' });

      const entry = db.prepare(`
        SELECT notes_index.*, folder_config.color
        FROM notes_index
        LEFT JOIN folder_config ON folder_config.path = notes_index.path
        WHERE notes_index.path = ? AND notes_index.is_dir = 0
      `).get(filePath);

      res.json(entry ? noteCardPayload(entry) : { path: filePath });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  app.post('/api/notes/touch', (req, res) => {
    try {
      const { path: filePath } = req.query;
      const fullPath = resolveNotesPath(filePath);
      if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: 'File not found' });
      if (fs.statSync(fullPath).isDirectory()) return res.status(400).json({ detail: 'Path is a directory' });
      const current = getDb().prepare('SELECT trashed_at FROM notes_index WHERE path = ?').get(filePath);
      if (current?.trashed_at) return res.status(410).json({ detail: 'File is in trash' });

      const openedAt = nowISO();
      const db = getDb();
      db.prepare('UPDATE notes_index SET last_opened = ? WHERE path = ?').run(openedAt, filePath);
      const entry = db.prepare(`
        SELECT notes_index.*, folder_config.color
        FROM notes_index
        LEFT JOIN folder_config ON folder_config.path = notes_index.path
        WHERE notes_index.path = ?
          AND notes_index.is_dir = 0
          AND (notes_index.trashed_at IS NULL OR notes_index.trashed_at = '')
      `).get(filePath);

      res.json(entry ? noteCardPayload(entry) : { path: filePath, lastOpened: openedAt });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  app.post('/api/notes/reorder', (req, res) => {
    try {
      const paths = Array.isArray(req.body?.paths)
        ? req.body.paths.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      const uniquePaths = [...new Set(paths)].slice(0, 200);
      if (uniquePaths.length === 0) return res.status(400).json({ detail: 'Paths required' });

      for (const filePath of uniquePaths) {
        const fullPath = resolveNotesPath(filePath);
        if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: `File not found: ${filePath}` });
        if (fs.statSync(fullPath).isDirectory()) return res.status(400).json({ detail: `Path is a directory: ${filePath}` });
        const note = getDb().prepare('SELECT trashed_at FROM notes_index WHERE path = ?').get(filePath);
        if (note?.trashed_at) return res.status(410).json({ detail: `File is in trash: ${filePath}` });
      }

      const db = getDb();
      const updateOrder = db.prepare('UPDATE notes_index SET board_order = ? WHERE path = ? AND is_dir = 0');
      const transaction = db.transaction((orderedPaths) => {
        orderedPaths.forEach((filePath, index) => updateOrder.run(index + 1, filePath));
      });
      transaction(uniquePaths);

      const placeholders = uniquePaths.map(() => '?').join(',');
      const entries = db.prepare(`
        SELECT notes_index.*, folder_config.color
        FROM notes_index
        LEFT JOIN folder_config ON folder_config.path = notes_index.path
        WHERE notes_index.path IN (${placeholders})
          AND notes_index.is_dir = 0
          AND (notes_index.trashed_at IS NULL OR notes_index.trashed_at = '')
        ORDER BY notes_index.board_order ASC
      `).all(...uniquePaths);

      res.json(entries.map(noteCardPayload));
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  app.post('/api/search', (req, res) => {
    try {
      const { query, search_content } = req.body;
      if (query !== undefined && typeof query !== 'string') {
        return res.status(400).json({ detail: 'query must be a string' });
      }
      const entries = getDb().prepare(`
        SELECT notes_index.*, folder_config.color
        FROM notes_index
        LEFT JOIN folder_config ON folder_config.path = notes_index.path
        WHERE notes_index.is_dir = 0
          AND (notes_index.trashed_at IS NULL OR notes_index.trashed_at = '')
      `).all();
      res.json(searchEntries(entries, {
        query,
        searchContent: Boolean(search_content),
      }));
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });

  app.get('/api/notes/backlinks', (req, res) => {
    try {
      const { path: filePath } = req.query;
      const db = getDb();
      const note = db.prepare('SELECT * FROM notes_index WHERE path = ?').get(filePath);
      if (!note || note.trashed_at) return res.json([]);

      const targetName = path.basename(filePath, '.md');
      const backlinks = db.prepare(`
        SELECT ni.* FROM notes_index ni
        JOIN note_links nl ON nl.source_path = ni.path
        WHERE (nl.target_name = ? OR nl.target_name = ?)
          AND (ni.trashed_at IS NULL OR ni.trashed_at = '')
      `).all(targetName, note.title || targetName);

      const linked = new Map();
      for (const entry of backlinks) {
        linked.set(entry.path, { entry, type: 'backlink' });
      }

      res.json([...linked.values()].map(({ entry, type }) => ({
        path: entry.path,
        name: entry.title?.trim() || entry.name.replace('.md', ''),
        type,
      })));
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });

  app.get('/api/notes/suggest', (req, res) => {
    try {
      const query = String(req.query.query || '').toLowerCase().trim();
      const excludePath = String(req.query.exclude || '').trim();
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 8, 1), 25);
      const entries = getDb().prepare(`
        SELECT path, name, title, last_opened
        FROM notes_index
        WHERE is_dir = 0
          AND (trashed_at IS NULL OR trashed_at = '')
        ORDER BY last_opened DESC
        LIMIT 250
      `).all();

      const suggestions = entries
        .filter((entry) => entry.path !== excludePath)
        .map((entry) => {
          const fileName = entry.name.replace(/\.md$/i, '');
          const fields = [fileName, entry.title, entry.path]
            .map((value) => String(value || '').toLowerCase());
          return {
            path: entry.path,
            name: fileName,
            title: entry.title || '',
            insertText: fileName,
            lastOpened: entry.last_opened,
            matches: !query || fields.some((field) => field.includes(query)),
          };
        })
        .filter((entry) => entry.matches)
        .sort((a, b) => {
          const aExact = a.name.toLowerCase() === query || a.title.toLowerCase() === query;
          const bExact = b.name.toLowerCase() === query || b.title.toLowerCase() === query;
          if (aExact !== bExact) return aExact ? -1 : 1;
          const aPrefix = a.name.toLowerCase().startsWith(query) || a.title.toLowerCase().startsWith(query);
          const bPrefix = b.name.toLowerCase().startsWith(query) || b.title.toLowerCase().startsWith(query);
          if (aPrefix !== bPrefix) return aPrefix ? -1 : 1;
          return (Date.parse(b.lastOpened) || 0) - (Date.parse(a.lastOpened) || 0);
        })
        .slice(0, limit)
        .map(({ matches, lastOpened, ...entry }) => entry);

      res.json(suggestions);
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });

  app.get('/api/notes/resolve-link', (req, res) => {
    try {
      const { name } = req.query;
      const entry = getDb().prepare(
        `SELECT * FROM notes_index
         WHERE is_dir = 0
           AND (trashed_at IS NULL OR trashed_at = '')
           AND (title = ? OR name = ? OR name = ?)
         LIMIT 1`
      ).get(name, name, name + '.md');

      res.json(entry
        ? { path: entry.path, name: entry.name.replace('.md', ''), isDir: false }
        : {});
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });

  app.get('/api/tags', (req, res) => {
    try {
      const rows = getDb().prepare(
        `SELECT tags FROM notes_index
         WHERE tags IS NOT NULL
           AND tags != '[]'
           AND tags != ''
           AND (trashed_at IS NULL OR trashed_at = '')`
      ).all();
      const tagSet = new Set();

      for (const row of rows) {
        try {
          for (const tag of JSON.parse(row.tags)) tagSet.add(tag);
        } catch {}
      }

      res.json([...tagSet].sort());
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });

  app.post('/api/format', (req, res) => {
    try {
      const excluded = new Set(['README.md', 'AGENTS.md']);
      let count = 0;

      function walk(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            walk(fullPath);
            continue;
          }

          if (entry.name.endsWith('.md') && !excluded.has(entry.name)) {
            const original = fs.readFileSync(fullPath, 'utf-8');
            const formatted = original
              .replace(/[ \t]+$/gm, '')
              .replace(/\r\n/g, '\n')
              .replace(/\n{3,}/g, '\n\n')
              .trim() + '\n';

            if (original !== formatted) {
              fs.writeFileSync(fullPath, formatted, 'utf-8');
              count++;
            }
          }
        }
      }

      walk(NOTES_DIR);
      if (count > 0) indexAllFiles();
      res.json({ success: true, message: `Formatted. Updated: ${count}` });
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });

  app.get('/api/settings', (req, res) => {
    try {
      const rows = getDb().prepare('SELECT key, value FROM settings').all();
      const settings = {};
      for (const row of rows) {
        try { settings[row.key] = JSON.parse(row.value); }
        catch { settings[row.key] = row.value; }
      }
      res.json(settings);
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });

  app.post('/api/settings', (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ detail: 'Request body must be an object' });
      }
      const db = getDb();
      const transaction = db.transaction((data) => {
        const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        for (const [key, value] of Object.entries(data)) {
          upsert.run(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
      });
      transaction(req.body);
      res.json({ message: 'Saved' });
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });
}
