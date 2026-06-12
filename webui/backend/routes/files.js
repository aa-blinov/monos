import fs from 'fs';
import path from 'path';
import { getDb } from '../database.js';
import { parseFrontmatterMetadata, searchEntries } from '../search.js';
import { NOTES_DIR } from '../config.js';
import { humanSize, nowISO, relPath, resolveNotesChildPath, resolveNotesPath, safePathName } from '../utils.js';
import { indexAllFiles, indexDirectoryTree, indexFile } from '../indexing.js';
import { upsertFrontmatter } from '../frontmatter.js';

export function registerFileRoutes(app) {
  function sendError(res, error) {
    res.status(error.statusCode || 500).json({ detail: error.message });
  }

  function normalizeMentionText(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function stripWikiLinks(content) {
    return String(content || '').replace(/\[\[(.*?)\]\]/g, ' ');
  }

  function hasPlainMention(entry, candidates) {
    const content = normalizeMentionText(stripWikiLinks(entry.content));
    return candidates.some((candidate) => {
      const normalizedCandidate = normalizeMentionText(candidate);
      return normalizedCandidate && content.includes(normalizedCandidate);
    });
  }

  function parseTags(rawTags) {
    try {
      const parsed = JSON.parse(rawTags || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function stripFrontmatter(content) {
    return String(content || '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  }

  function noteCardPayload(entry) {
    return {
      path: entry.path,
      name: entry.title?.trim() || entry.name.replace('.md', ''),
      excerpt: entry.content
        ? stripFrontmatter(entry.content).replace(/\s+/g, ' ').trim().slice(0, 180)
        : '',
      color: entry.color || null,
      category: entry.category || '',
      tags: parseTags(entry.tags),
      lastOpened: entry.last_opened,
      boardOrder: entry.board_order ?? null,
    };
  }

  app.get('/api/tree', (req, res) => {
    try {
      const db = getDb();

      function buildNode(relativePath) {
        const name = relativePath === 'notes' ? 'notes' : path.basename(relativePath);
        const folderConfig = db.prepare('SELECT * FROM folder_config WHERE path = ?').get(relativePath);
        const children = db.prepare(
          'SELECT * FROM notes_index WHERE parent_path = ? ORDER BY is_dir DESC, name COLLATE NOCASE ASC'
        ).all(relativePath);

        return {
          path: relativePath,
          name,
          is_dir: true,
          icon: folderConfig?.icon || null,
          color: folderConfig?.color || null,
          size: 0,
          size_human: '',
          children: children.map((child) => {
            if (child.is_dir) return buildNode(child.path);

            const childConfig = db.prepare('SELECT * FROM folder_config WHERE path = ?').get(child.path);
            return {
              path: child.path,
              name: child.name,
              is_dir: false,
              icon: childConfig?.icon || null,
              color: childConfig?.color || null,
              size: 0,
              size_human: '',
              children: [],
              metadata: {
                title: child.title || null,
                date: child.date_created || null,
                category: child.category || null,
                tags: JSON.parse(child.tags || '[]'),
              },
            };
          }),
          metadata: null,
        };
      }

      res.json(buildNode('notes'));
    } catch (error) {
      console.error('/api/tree error:', error);
      res.status(500).json({ detail: error.message });
    }
  });

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
      sendError(res, error);
    }
  });

  app.post('/api/file', (req, res) => {
    try {
      const { path: filePath } = req.query;
      const { content } = req.body;
      const fullPath = resolveNotesPath(filePath);
      fs.writeFileSync(fullPath, content, 'utf-8');
      indexFile(fullPath, content);
      res.json({ message: 'Saved' });
    } catch (error) {
      sendError(res, error);
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
      sendError(res, error);
    }
  });

  app.post('/api/file/rename', (req, res) => {
    try {
      const { path: filePath } = req.query;
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
      sendError(res, error);
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
      sendError(res, error);
    }
  });

  app.get('/api/file-info', (req, res) => {
    try {
      const { path: filePath } = req.query;
      const fullPath = resolveNotesPath(filePath, { allowRoot: true });
      if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: 'File not found' });

      const stats = fs.statSync(fullPath);
      const meta = getDb().prepare('SELECT * FROM notes_index WHERE path = ?').get(filePath);

      res.json({
        path: filePath,
        name: path.basename(filePath),
        is_dir: stats.isDirectory(),
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
      sendError(res, error);
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
      sendError(res, error);
    }
  });

  app.post('/api/notes/create', (req, res) => {
    try {
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

      res.json({ path: relativePath, name: fileName, isDir: false });
    } catch (error) {
      sendError(res, error);
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

  app.post('/api/notes/touch', (req, res) => {
    try {
      const { path: filePath } = req.query;
      const fullPath = resolveNotesPath(filePath);
      if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: 'File not found' });
      if (fs.statSync(fullPath).isDirectory()) return res.status(400).json({ detail: 'Path is a directory' });

      const openedAt = nowISO();
      const db = getDb();
      db.prepare('UPDATE notes_index SET last_opened = ? WHERE path = ?').run(openedAt, filePath);
      const entry = db.prepare(`
        SELECT notes_index.*, folder_config.color
        FROM notes_index
        LEFT JOIN folder_config ON folder_config.path = notes_index.path
        WHERE notes_index.path = ? AND notes_index.is_dir = 0
      `).get(filePath);

      res.json(entry ? noteCardPayload(entry) : { path: filePath, lastOpened: openedAt });
    } catch (error) {
      sendError(res, error);
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
        WHERE notes_index.path IN (${placeholders}) AND notes_index.is_dir = 0
        ORDER BY notes_index.board_order ASC
      `).all(...uniquePaths);

      res.json(entries.map(noteCardPayload));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/search', (req, res) => {
    try {
      const { query, search_content } = req.body;
      const entries = getDb().prepare(`
        SELECT notes_index.*, folder_config.color
        FROM notes_index
        LEFT JOIN folder_config ON folder_config.path = notes_index.path
        WHERE notes_index.is_dir = 0
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
      if (!note) return res.json([]);

      const targetName = path.basename(filePath, '.md');
      const candidates = Array.from(new Set([targetName, note.title].filter(Boolean)));
      const backlinks = db.prepare(`
        SELECT ni.* FROM notes_index ni
        JOIN note_links nl ON nl.source_path = ni.path
        WHERE nl.target_name = ? OR nl.target_name = ?
      `).all(targetName, note.title || targetName);

      const linked = new Map();
      for (const entry of backlinks) {
        linked.set(entry.path, { entry, type: 'backlink' });
      }

      const mentionCandidates = db.prepare(
        'SELECT * FROM notes_index WHERE is_dir = 0 AND path != ?'
      ).all(filePath);

      for (const entry of mentionCandidates) {
        if (!linked.has(entry.path) && hasPlainMention(entry, candidates)) {
          linked.set(entry.path, { entry, type: 'mention' });
        }
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

  app.get('/api/notes/resolve-link', (req, res) => {
    try {
      const { name } = req.query;
      const entry = getDb().prepare(
        'SELECT * FROM notes_index WHERE is_dir = 0 AND (title = ? OR name = ? OR name = ?) LIMIT 1'
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
        'SELECT tags FROM notes_index WHERE tags IS NOT NULL AND tags != \'[]\' AND tags != \'\''
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
      sendError(res, error);
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
