import fs from 'fs';
import path from 'path';
import { getDb } from '../database.js';
import { parseFrontmatterMetadata, searchEntries, parseSearchQuery } from '../search.js';
import { searchFts } from '../fts.js';
import { NOTES_DIR } from '../config.js';
import { httpError, nowISO, readTextFile, relPath, resolveNotesChildPath, resolveNotesPath } from '../utils.js';
import { indexAllFiles, indexDirectoryTree, indexFile } from '../indexing.js';
import { upsertFrontmatter } from '../frontmatter.js';
import { isEncryptedSecret, protectSecret, revealSecret } from './secret-store.js';
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
      const noteContent = upsertFrontmatter(content || '', { title, category, tags: tags || [], pinned: false });
      fs.writeFileSync(filePath, noteContent, 'utf-8');

      const relativePath = relPath(filePath);
      indexFile(filePath, noteContent);
      getDb().prepare('UPDATE notes_index SET trashed_at = NULL WHERE path = ?').run(relativePath);

      res.json({ path: relativePath, name: fileName, isDir: false });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  /**
   * Copy a note next to the original.
   *
   * The copy keeps the body and the metadata, loses the pin — a duplicate is
   * not something you were working on, and a stale pin on both copies is how a
   * pinned list grows by accident. The name gets a numeric suffix only if the
   * obvious one is taken, so duplicating twice reads «Копия», «Копия 2».
   */
  app.post('/api/notes/duplicate', (req, res) => {
    try {
      const { path: requestPath } = req.query;
      if (typeof requestPath !== 'string' || !requestPath) {
        return res.status(400).json({ detail: 'path is required' });
      }
      const sourcePath = resolveNotesPath(requestPath);
      if (!fs.existsSync(sourcePath) || fs.statSync(sourcePath).isDirectory()) {
        return res.status(404).json({ detail: 'Note not found' });
      }

      const dir = path.dirname(sourcePath);
      const base = path.basename(sourcePath, path.extname(sourcePath));
      const extension = path.extname(sourcePath);
      let fileName = `${base} копия${extension}`;
      let counter = 2;
      while (fs.existsSync(path.join(dir, fileName))) {
        fileName = `${base} копия ${counter}${extension}`;
        counter += 1;
      }

      const targetPath = path.join(dir, fileName);
      const content = readTextFile(sourcePath);
      const metadata = parseFrontmatterMetadata(content);
      const nextContent = upsertFrontmatter(content, {
        title: `${metadata.title || base} копия`,
        category: metadata.category,
        tags: metadata.tags,
        pinned: false,
      });
      fs.writeFileSync(targetPath, nextContent, 'utf-8');
      indexFile(targetPath, nextContent);

      res.json({
        path: relPath(targetPath),
        name: fileName,
        isDir: false,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  /**
   * Add a tag to many notes at once, or take one away.
   *
   * The notes keep every other key of their frontmatter — a bulk action that
   * quietly dropped a `due` date or a pin would be worse than no action.
   */
  app.post('/api/notes/bulk-tag', (req, res) => {
    try {
      const { paths, tag, remove } = req.body || {};
      const cleanTag = String(tag || '').trim();
      if (!Array.isArray(paths) || paths.length === 0) {
        return res.status(400).json({ detail: 'paths is required' });
      }
      if (!cleanTag) return res.status(400).json({ detail: 'tag is required' });

      const changed = [];
      const missing = [];
      for (const requestPath of paths) {
        if (typeof requestPath !== 'string' || !requestPath) continue;
        let absolute;
        try {
          absolute = resolveNotesPath(requestPath);
        } catch {
          missing.push(requestPath);
          continue;
        }
        if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) {
          missing.push(requestPath);
          continue;
        }
        const content = readTextFile(absolute);
        const metadata = parseFrontmatterMetadata(content);
        const has = metadata.tags.includes(cleanTag);
        if (remove && !has) continue;
        if (!remove && has) continue;

        const nextTags = remove
          ? metadata.tags.filter((item) => item !== cleanTag)
          : [...metadata.tags, cleanTag];
        const updated = upsertFrontmatter(content, {
          title: metadata.title,
          category: metadata.category,
          tags: nextTags,
          pinned: metadata.pinned,
        });
        fs.writeFileSync(absolute, updated, 'utf-8');
        indexFile(absolute, updated);
        changed.push(requestPath);
      }

      res.json({ changed, missing, tag: cleanTag });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  app.get('/api/notes/recent', (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);
      const sort = String(req.query.sort || '').trim();
      const orderBy = sort === 'modified'
        ? `notes_index.modified_at DESC,
                  notes_index.last_opened DESC,
                  notes_index.path COLLATE NOCASE ASC`
        : `notes_index.board_order IS NULL ASC,
                  notes_index.board_order ASC,
                  notes_index.last_opened DESC,
                  notes_index.path COLLATE NOCASE ASC`;
      const entries = getDb().prepare(
        `SELECT notes_index.*, folder_config.color
         FROM notes_index
         LEFT JOIN folder_config ON folder_config.path = notes_index.path
         WHERE notes_index.is_dir = 0
           AND (notes_index.trashed_at IS NULL OR notes_index.trashed_at = '')
         ORDER BY ${orderBy}
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
      const db = getDb();
      const searchContent = Boolean(search_content);

      // The full-text index narrows the candidate set; `searchEntries` still
      // does the ranking and the excerpts. `null` means "index untrustworthy",
      // and we fall through to the plain scan rather than return nothing.
      let candidatePaths = null;
      try {
        const parsed = parseSearchQuery(String(query || ''));
        candidatePaths = searchFts(db, parsed, { searchContent });
      } catch {
        candidatePaths = null;
      }

      const base = `
        FROM notes_index
        LEFT JOIN folder_config ON folder_config.path = notes_index.path
        WHERE notes_index.is_dir = 0
          AND (notes_index.trashed_at IS NULL OR notes_index.trashed_at = '')
      `;

      const entries = candidatePaths === null
        ? db.prepare(`SELECT notes_index.*, folder_config.color ${base}`).all()
        : candidatePaths.length === 0
          ? []
          : db.prepare(`
              SELECT notes_index.*, folder_config.color
              ${base}
                AND notes_index.path IN (${candidatePaths.map(() => '?').join(',')})
            `).all(...candidatePaths);

      res.json(searchEntries(entries, { query, searchContent }));
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

      // Names shared by more than one note. Without the flag the picker lists
      // both rows with the same label and the path in small type, which is easy
      // to skim past; `[[X]]` written afterwards then points at whichever one
      // was meant.
      const duplicates = new Set(
        getDb().prepare(`
          SELECT name FROM notes_index
          WHERE is_dir = 0 AND (trashed_at IS NULL OR trashed_at = '')
          GROUP BY name HAVING COUNT(*) > 1
        `).all().map((row) => row.name)
      );

      res.json(suggestions.map((entry) => ({
        ...entry,
        duplicate: duplicates.has(`${entry.name}.md`),
      })));
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });

  app.get('/api/notes/resolve-link', (req, res) => {
    try {
      const { name } = req.query;
      // Several notes can answer to one name — the corpus had three such pairs.
      // `LIMIT 1` used to pick one of them in silence, which is the worst
      // possible answer: the caller believes it resolved the link it asked
      // about. So all candidates are reported and the caller decides.
      const rows = getDb().prepare(
        `SELECT path, name, title FROM notes_index
         WHERE is_dir = 0
           AND (trashed_at IS NULL OR trashed_at = '')
           AND (title = ? OR name = ? OR name = ?)
         ORDER BY path COLLATE NOCASE ASC
         LIMIT 10`
      ).all(name, name, name + '.md');

      if (!rows.length) {
        res.json({});
        return;
      }
      if (rows.length > 1) {
        res.json({
          ambiguous: true,
          name,
          matches: rows.map((row) => ({
            path: row.path,
            name: row.name.replace(/\.md$/i, ''),
            isDir: false,
          })),
        });
        return;
      }

      res.json({ path: rows[0].path, name: rows[0].name.replace(/\.md$/i, ''), isDir: false });
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

  /**
   * Tags with the number of notes carrying each, for the tag panel.
   * Kept apart from `/api/tags`, which the search box consumes as a flat list
   * of names and must keep receiving.
   */
  app.get('/api/tags/stats', (req, res) => {
    try {
      const rows = getDb().prepare(
        `SELECT tags FROM notes_index
         WHERE tags IS NOT NULL
           AND tags != '[]'
           AND tags != ''
           AND (trashed_at IS NULL OR trashed_at = '')`
      ).all();
      const counts = new Map();

      for (const row of rows) {
        let tags;
        try {
          tags = JSON.parse(row.tags);
        } catch {
          continue;
        }
        if (!Array.isArray(tags)) continue;
        for (const tag of tags) {
          const name = String(tag || '').trim();
          if (!name) continue;
          counts.set(name, (counts.get(name) || 0) + 1);
        }
      }

      const stats = [...counts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        // Busiest first, alphabetical within the same count — the order the
        // panel reads best when a vault has hundreds of tags.
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

      res.json(stats);
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });

  /**
   * Rename or drop a tag across every note that carries it.
   *
   * The tag lives in each note's YAML frontmatter, so this rewrites the files
   * and reindexes them. Notes are written back through the same path the
   * editor uses, which keeps unknown frontmatter keys intact — a rename must
   * not quietly drop a `due` date someone set.
   */
  const rewriteTag = (from, to) => {
    const name = String(from || '').trim();
    if (!name) throw httpError(400, 'Tag required');

    const db = getDb();
    const rows = db.prepare(
      `SELECT path, tags FROM notes_index
       WHERE is_dir = 0
         AND (trashed_at IS NULL OR trashed_at = '')`
    ).all();

    const changed = [];
    for (const row of rows) {
      let tags;
      try {
        tags = JSON.parse(row.tags);
      } catch {
        continue;
      }
      if (!Array.isArray(tags) || !tags.includes(name)) continue;

      const nextTags = [];
      for (const tag of tags) {
        const value = tag === name ? (to || null) : tag;
        if (value && !nextTags.includes(value)) nextTags.push(value);
      }

      // Пути в индексе хранятся с префиксом `notes/`, поэтому склеивать их с
      // NOTES_DIR руками нельзя — нужен штатный резолвер.
      let absolute;
      try {
        absolute = resolveNotesPath(row.path);
      } catch {
        continue;
      }
      if (!fs.existsSync(absolute)) continue;
      // Декодер снимает BOM при чтении — иначе он мешал бы разбору, — поэтому
      // пометку о нём берём из сырых байтов и возвращаем при записи. Иначе
      // переименование тега молча переписывало бы файл уже без BOM.
      const hasBom = fs.readFileSync(absolute).subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]));
      const content = readTextFile(absolute);
      const metadata = parseFrontmatterMetadata(content);
      const updated = upsertFrontmatter(content, {
        title: metadata.title,
        category: metadata.category,
        tags: nextTags,
        pinned: metadata.pinned,
      });
      fs.writeFileSync(absolute, (hasBom ? '\uFEFF' : '') + updated, 'utf-8');
      indexFile(absolute, updated);
      changed.push(row.path);
    }
    return changed;
  };

  app.post('/api/tags/rename', (req, res) => {
    try {
      const { from, to } = req.body || {};
      const target = String(to || '').trim();
      if (!target) return res.status(400).json({ detail: 'New tag name required' });
      if (target === String(from || '').trim()) {
        return res.json({ changed: [], message: 'Same name' });
      }
      res.json({ changed: rewriteTag(from, target) });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
    }
  });

  app.post('/api/tags/delete', (req, res) => {
    try {
      res.json({ changed: rewriteTag(req.body?.tag, null) });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message });
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
            const original = readTextFile(fullPath);
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

  app.get('/api/settings', async (req, res) => {
    try {
      const rows = getDb().prepare('SELECT key, value FROM settings').all();
      const settings = {};
      for (const row of rows) {
        try { settings[row.key] = JSON.parse(row.value); }
        catch { settings[row.key] = row.value; }
      }
      // The frontend needs a working token to query the repo list; it must not
      // receive the keychain blob.
      if (typeof settings.git_token === 'string' && isEncryptedSecret(settings.git_token)) {
        const { value } = await revealSecret(settings.git_token);
        settings.git_token = value;
      }
      res.json(settings);
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });

  app.post('/api/settings', async (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ detail: 'Request body must be an object' });
      }
      const db = getDb();
      // The git token is a credential, not a preference: wrap it in the OS
      // keychain before it ever reaches the settings table.
      const payload = { ...req.body };
      if (typeof payload.git_token === 'string' && payload.git_token) {
        const { value, protectedAtRest } = await protectSecret(payload.git_token);
        payload.git_token = value;
        payload.git_token_protected = protectedAtRest ? 1 : 0;
      }
      const transaction = db.transaction((data) => {
        const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        for (const [key, value] of Object.entries(data)) {
          upsert.run(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
      });
      // `payload`, not `req.body`: the git token must be stored in its
      // protected form, not the one that arrived.
      transaction(payload);
      res.json({ message: 'Saved' });
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });
}
