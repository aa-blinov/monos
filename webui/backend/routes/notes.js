import fs from 'fs';
import path from 'path';
import { getDb } from '../database.js';
import { parseFrontmatterMetadata, searchEntries, parseSearchQuery } from '../search.js';
import { searchFts } from '../fts.js';
import { NOTES_DIR } from '../config.js';
import { assertFileName, canonicalAppPath, folderLinkPatterns, headingLinkPattern, httpError, linkNameCandidates, noteLinkNames, nowISO, readTextFile, readTextForRewrite, relPath, resolveNotesChildPath, resolveNotesPath, writeFileAtomic } from '../utils.js';
import { indexAllFiles, indexDirectoryTree, indexFile } from '../indexing.js';
import { upsertFrontmatter } from '../frontmatter.js';
import { parseStoredProperties } from '../properties.js';
import { isEncryptedSecret, protectSecret, revealSecret } from './secret-store.js';
import { noteCardPayload, parseTags } from './helpers.js';
import { requireBodyFields } from './validate.js';
import { isThisComputerRequest } from '../lan-access.js';
import { findTrashedRow, restoreFromTrash } from '../trash.js';
import { sendError } from './helpers.js';

// The value a table column compares by, or null when the note does not have the property.
function tableCell(row, sort) {
  if (sort === 'title') return row.title;
  if (sort === 'modified') return row.modified ? Date.parse(row.modified) : null;
  const property = row.properties.find((item) => String(item.key).toLowerCase() === sort.toLowerCase());
  if (!property) return null;
  return Array.isArray(property.value) ? property.value.join(', ') : property.value;
}

// Numbers compare as numbers, booleans as booleans, everything else as text (ISO dates sort as text).
function compareCells(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right);
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}

// Rows without the column go last, whichever way the table is sorted.
function sortTableRows(rows, sort, descending) {
  const sign = descending ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = tableCell(a, sort);
    const right = tableCell(b, sort);
    if (left === null || right === null) {
      if (left === right) return a.title.localeCompare(b.title);
      return left === null ? 1 : -1;
    }
    return compareCells(left, right) * sign || a.title.localeCompare(b.title);
  });
}

export function registerNoteRoutes(app) {
  app.post('/api/notes/create', (req, res) => {
    try {
      requireBodyFields(req, 'title');
      const { category, tags, content } = req.body;
      if (typeof req.body.title !== 'string') throw httpError(400, 'title must be text', 'invalid_title');
      if (category !== undefined && category !== null && typeof category !== 'string') throw httpError(400, 'category must be text', 'invalid_category');
      if (tags !== undefined && tags !== null && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string'))) {
        throw httpError(400, 'tags must be a list of text', 'invalid_tags');
      }
      if (content !== undefined && content !== null && typeof content !== 'string') throw httpError(400, 'content must be text', 'invalid_content');
      // Название заметки — её имя на диске. То, что ОС не создаст, отклоняем сразу,
      // а не заменяем тихо: пользователь видит, что именно не так.
      const title = assertFileName(req.body.title.trim());
      const fileName = title + '.md';
      // Every folder of the category is a name the system has to be able to create, not only the last one.
      const dirPath = category ? resolveNotesChildPath(category, { forCreate: true }) : NOTES_DIR;
      fs.mkdirSync(dirPath, { recursive: true });
      if (category) indexDirectoryTree(dirPath);

      const filePath = path.join(dirPath, fileName);
      // The file is the only copy of its text, so a name that is taken is refused,
      // never written over. The existing path lets the UI open that note instead.
      // A note in the trash does not take its name: it rests in `.trash/` and comes back under another one if need be.
      if (fs.existsSync(filePath)) {
        // "Open or create" (today's note): the note that already has this name is the answer, not an error.
        if (req.body.openIfExists === true) {
          return res.json({ path: relPath(filePath), name: fileName, isDir: false, existing: true });
        }
        return res.status(409).json({
          detail: `A note named "${fileName.replace(/\.md$/, '')}" already exists in this folder.`,
          code: 'exists',
          path: relPath(filePath),
        });
      }
      const noteContent = upsertFrontmatter(content || '', { title, category, tags: tags || [], pinned: false });
      writeFileAtomic(filePath, noteContent, 'utf-8');

      const relativePath = relPath(filePath);
      indexFile(filePath, noteContent);

      res.json({ path: relativePath, name: fileName, isDir: false });
    } catch (error) {
      sendError(res, error);
    }
  });

  /**
   * Copy a note next to the original.
   *
   * The copy keeps the body and the metadata, loses the pin — a duplicate is
   * not something you were working on, and a stale pin on both copies is how a
   * pinned list grows by accident. The name gets a numeric suffix only if the
   * obvious one is taken, so duplicating twice reads «Копия», «Копия 2» (the word is the `suffix` the page sends).
   */
  app.post('/api/notes/duplicate', (req, res) => {
    try {
      const { path: requestPath } = req.query;
      if (typeof requestPath !== 'string' || !requestPath) {
        return res.status(400).json({ detail: 'path is required', code: 'path_required' });
      }
      // The word added to the name is the interface's own language ("copy", "копия"): the page sends it, English is
      // what a client that sends nothing gets.
      const requested = req.body?.suffix ?? req.query.suffix;
      if (requested !== undefined && requested !== null && typeof requested !== 'string') {
        throw httpError(400, 'suffix must be text', 'invalid_suffix');
      }
      const suffix = typeof requested === 'string' && requested.trim() ? requested.trim() : 'copy';
      assertFileName(`${suffix}.md`);
      if (suffix.length > 40) throw httpError(400, 'suffix is too long', 'invalid_suffix');
      const sourcePath = resolveNotesPath(requestPath);
      if (!fs.existsSync(sourcePath) || fs.statSync(sourcePath).isDirectory()) {
        return res.status(404).json({ detail: 'Note not found', code: 'not_found' });
      }

      const dir = path.dirname(sourcePath);
      const base = path.basename(sourcePath, path.extname(sourcePath));
      const extension = path.extname(sourcePath);
      let fileName = `${base} ${suffix}${extension}`;
      let counter = 2;
      while (fs.existsSync(path.join(dir, fileName))) {
        fileName = `${base} ${suffix} ${counter}${extension}`;
        counter += 1;
      }

      const targetPath = path.join(dir, fileName);
      const content = readTextForRewrite(sourcePath);
      const metadata = parseFrontmatterMetadata(content);
      const nextContent = upsertFrontmatter(content, {
        title: `${metadata.title || base} ${suffix}`,
        category: metadata.category,
        tags: metadata.tags,
        pinned: false,
      });
      writeFileAtomic(targetPath, nextContent, 'utf-8');
      indexFile(targetPath, nextContent);

      res.json({
        path: relPath(targetPath),
        name: fileName,
        isDir: false,
      });
    } catch (error) {
      sendError(res, error);
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
        let content;
        try {
          content = readTextForRewrite(absolute);
        } catch {
          // A note whose bytes text cannot hold is left as it is, and named among those that were not changed.
          missing.push(requestPath);
          continue;
        }
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
        writeFileAtomic(absolute, updated, 'utf-8');
        indexFile(absolute, updated);
        changed.push(requestPath);
      }

      res.json({ changed, missing, tag: cleanTag });
    } catch (error) {
      sendError(res, error);
    }
  });

  // The board's order. Pinned notes come first in every order: pinning is how a note is kept at the top.
  const BOARD_ORDERS = {
    modified: `notes_index.pinned DESC,
                  notes_index.modified_at DESC,
                  notes_index.last_opened DESC,
                  notes_index.path COLLATE NOCASE ASC`,
    opened: `notes_index.pinned DESC,
                  notes_index.last_opened DESC,
                  notes_index.path COLLATE NOCASE ASC`,
    title: `notes_index.pinned DESC,
                  COALESCE(NULLIF(TRIM(notes_index.title), ''), notes_index.name) COLLATE NOCASE ASC,
                  notes_index.path COLLATE NOCASE ASC`,
  };
  const BOARD_DEFAULT_ORDER = `notes_index.pinned DESC,
                  notes_index.board_order IS NULL ASC,
                  notes_index.board_order ASC,
                  notes_index.last_opened DESC,
                  notes_index.path COLLATE NOCASE ASC`;

  // Tags are stored as a JSON array, so the quoted name is an exact match: "plan" never finds "planning".
  function boardFilter(req) {
    const tag = String(req.query.tag || '').trim();
    return tag
      ? { sql: 'AND instr(notes_index.tags, ?) > 0', params: [JSON.stringify(tag)] }
      : { sql: '', params: [] };
  }

  app.get('/api/notes/recent', (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);
      const orderBy = BOARD_ORDERS[String(req.query.sort || '').trim()] || BOARD_DEFAULT_ORDER;
      const filter = boardFilter(req);
      const entries = getDb().prepare(
        `SELECT notes_index.*, folder_config.color
         FROM notes_index
         LEFT JOIN folder_config ON folder_config.path = notes_index.path
         WHERE notes_index.is_dir = 0
           AND (notes_index.trashed_at IS NULL OR notes_index.trashed_at = '')
           ${filter.sql}
         ORDER BY ${orderBy}
         LIMIT ? OFFSET ?`
      ).all(...filter.params, limit, offset);

      res.json(entries.map(noteCardPayload));
    } catch (error) {
      sendError(res, error);
    }
  });

  // How many notes the board holds (for the tag when one is chosen): the "shown N of M" line.
  app.get('/api/notes/recent/count', (req, res) => {
    try {
      const filter = boardFilter(req);
      const row = getDb().prepare(
        `SELECT COUNT(*) AS total FROM notes_index
         WHERE notes_index.is_dir = 0
           AND (notes_index.trashed_at IS NULL OR notes_index.trashed_at = '')
           ${filter.sql}`
      ).get(...filter.params);
      res.json({ total: row?.total ?? 0 });
    } catch (error) {
      sendError(res, error);
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
      sendError(res, error);
    }
  });

  // Brings a note back from the trash. The path is the one the trash list gives (where the note was deleted from),
  // which is also the one a page has when it undoes a deletion. A note that is not in the trash and is there is
  // answered as restored: undoing twice is not an error.
  app.post('/api/notes/restore', (req, res) => {
    try {
      const { path: requestPath } = req.query;
      const appPath = canonicalAppPath(requestPath);
      if (!appPath) throw httpError(400, 'Path required', 'path_required');
      const db = getDb();
      const withColor = `
        SELECT notes_index.*, folder_config.color
        FROM notes_index
        LEFT JOIN folder_config ON folder_config.path = notes_index.path
        WHERE notes_index.path = ? AND notes_index.is_dir = 0`;
      const row = findTrashedRow(db, appPath);
      if (!row) {
        const live = db.prepare(withColor).get(appPath);
        if (live && !live.trashed_at) return res.json(noteCardPayload(live));
        return res.status(404).json({ detail: 'File not found', code: 'not_found' });
      }

      const restored = restoreFromTrash(db, row);
      const entry = db.prepare(withColor).get(restored.path);
      res.json({ ...(entry ? noteCardPayload(entry) : { path: restored.path }), ...(restored.renamed ? { renamed: true } : {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/notes/touch', (req, res) => {
    try {
      const fullPath = resolveNotesPath(req.query.path);
      const filePath = relPath(fullPath);
      if (!fs.existsSync(fullPath)) {
        if (findTrashedRow(getDb(), filePath)) return res.status(410).json({ detail: 'File is in trash', code: 'trashed' });
        return res.status(404).json({ detail: 'File not found', code: 'not_found' });
      }
      if (fs.statSync(fullPath).isDirectory()) return res.status(400).json({ detail: 'Path is a directory', code: 'is_directory' });

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

      uniquePaths.splice(0, uniquePaths.length, ...uniquePaths.map((item) => {
        const fullPath = resolveNotesPath(item);
        const filePath = relPath(fullPath);
        if (!fs.existsSync(fullPath)) {
          if (findTrashedRow(getDb(), filePath)) throw httpError(410, `File is in trash: ${filePath}`, 'trashed');
          throw httpError(404, `File not found: ${filePath}`, 'not_found');
        }
        if (fs.statSync(fullPath).isDirectory()) throw httpError(400, `Path is a directory: ${filePath}`, 'is_directory');
        return filePath;
      }));

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
      sendError(res, error);
    }
  });

  app.post('/api/search', (req, res) => {
    try {
      const { query, search_content } = req.body || {};
      if (query !== undefined && typeof query !== 'string') {
        return res.status(400).json({ detail: 'query must be a string', code: 'invalid_query' });
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
      sendError(res, error);
    }
  });

  // The notes as rows of their properties. `query` takes the search syntax, so `prop:status=done` filters
  // the rows; `sort` is `modified`, `title` or a property name, and `dir` is `asc` or `desc`. `keys` lists
  // every property the notes use, most used first, so the table can offer them as columns.
  app.get('/api/notes/table', (req, res) => {
    try {
      const query = String(req.query.query || '').trim();
      const sort = String(req.query.sort || 'modified');
      const descending = req.query.dir !== 'asc';
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 300, 1), 1000);
      const entries = getDb().prepare(`
        SELECT path, name, title, category, tags, modified_at, props
        FROM notes_index
        WHERE is_dir = 0 AND (trashed_at IS NULL OR trashed_at = '')
      `).all();

      const keyUse = new Map();
      for (const entry of entries) {
        for (const property of parseStoredProperties(entry.props)) {
          const id = String(property.key).toLowerCase();
          // The favourite mark is the app's own flag, not a property to build columns from.
          if (id === 'monos-favorite') continue;
          const use = keyUse.get(id) || { key: String(property.key), count: 0, type: property.type };
          use.count += 1;
          keyUse.set(id, use);
        }
      }

      const matched = query
        ? new Set(searchEntries(entries, { query, limit: entries.length, excerpts: false }).map((item) => item.path))
        : null;
      const rows = entries
        .filter((entry) => !matched || matched.has(entry.path))
        .map((entry) => ({
          path: entry.path,
          title: entry.title?.trim() || entry.name.replace(/\.md$/i, ''),
          category: entry.category || '',
          tags: parseTags(entry.tags),
          modified: entry.modified_at || null,
          properties: parseStoredProperties(entry.props),
        }));
      const sorted = sortTableRows(rows, sort, descending);
      res.json({
        rows: sorted.slice(0, limit),
        total: sorted.length,
        keys: [...keyUse.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, 60),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/notes/backlinks', (req, res) => {
    try {
      const filePath = canonicalAppPath(req.query.path);
      const db = getDb();
      const note = filePath ? db.prepare('SELECT * FROM notes_index WHERE path = ?').get(filePath) : null;
      if (!note || note.trashed_at) return res.json([]);

      // A link reaches the note by its file name, its title or an alias, optionally followed by a
      // heading: [[Name#Heading]]. A note's own links to itself are not backlinks.
      const aliases = db.prepare('SELECT alias_nfc FROM note_aliases WHERE path = ?').all(filePath).map((row) => row.alias_nfc);
      const names = noteLinkNames(note, aliases);
      // A link reaches a name as `Name`, `Name#Heading`, `Folder/Name` or `Folder/Name#Heading`.
      const linkMatch = "(nl.target_name = ? OR nl.target_name LIKE ? ESCAPE '\\' OR nl.target_name LIKE ? ESCAPE '\\' OR nl.target_name LIKE ? ESCAPE '\\')";
      const backlinks = db.prepare(`
        SELECT DISTINCT ni.* FROM notes_index ni
        JOIN note_links nl ON nl.source_path = ni.path
        WHERE (${names.map(() => linkMatch).join(' OR ')})
          AND ni.path != ?
          AND (ni.trashed_at IS NULL OR ni.trashed_at = '')
      `).all(...names.flatMap((name) => [name, headingLinkPattern(name), ...folderLinkPatterns(name)]), filePath);

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
      sendError(res, error);
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
      sendError(res, error);
    }
  });

  app.get('/api/notes/resolve-link', (req, res) => {
    try {
      const { name } = req.query;
      // Several notes can answer to one name — the corpus had three such pairs.
      // `LIMIT 1` used to pick one of them in silence, which is the worst
      // possible answer: the caller believes it resolved the link it asked
      // about. So all candidates are reported and the caller decides.
      // Имя ищется по нормализованному ключу: на диске имена разложены (NFD),
      // а связи набирают сложёнными (NFC) — «Запрос новой функциональности» не
      // находился, хотя файл рядом.
      // An alias (aliases: in the frontmatter) answers like a title, and `Name#Heading` resolves to
      // `Name`: the whole name is tried first, so a note whose own name has `#` still resolves.
      const wanted = String(name || '').normalize('NFC');
      let rows = [];
      for (const candidate of linkNameCandidates(wanted)) {
        const bare = candidate.replace(/\.md$/i, '');
        rows = getDb().prepare(
          `SELECT path, name, title FROM notes_index
           WHERE is_dir = 0
             AND (trashed_at IS NULL OR trashed_at = '')
             AND (title = ? OR name_nfc = ? OR name_nfc = ?
                  OR path IN (SELECT path FROM note_aliases WHERE alias_nfc = ?))
           ORDER BY path COLLATE NOCASE ASC
           LIMIT 10`
        ).all(bare, bare, `${bare}.md`, bare);
        if (rows.length) break;
      }

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
      sendError(res, error);
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
      sendError(res, error);
    }
  });

  /**
   * Categories used by the notes, each with the number of notes carrying it.
   * Feeds the suggestions in a note's category field. Spellings that differ
   * only by case count as one category, shown in its first spelling.
   */
  app.get('/api/categories', (req, res) => {
    try {
      const rows = getDb().prepare(
        `SELECT MIN(category) AS name, COUNT(*) AS count FROM notes_index
         WHERE is_dir = 0
           AND category IS NOT NULL
           AND category != ''
           AND (trashed_at IS NULL OR trashed_at = '')
         GROUP BY category COLLATE NOCASE
         ORDER BY count DESC, name COLLATE NOCASE ASC`
      ).all();
      res.json(rows);
    } catch (error) {
      sendError(res, error);
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
      sendError(res, error);
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
      let content;
      try {
        content = readTextForRewrite(absolute);
      } catch {
        continue;
      }
      const metadata = parseFrontmatterMetadata(content);
      const updated = upsertFrontmatter(content, {
        title: metadata.title,
        category: metadata.category,
        tags: nextTags,
        pinned: metadata.pinned,
      });
      writeFileAtomic(absolute, (hasBom ? '\uFEFF' : '') + updated, 'utf-8');
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
      sendError(res, error);
    }
  });

  app.post('/api/tags/delete', (req, res) => {
    try {
      res.json({ changed: rewriteTag(req.body?.tag, null) });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Credentials are for this computer only: another device that got in with the access token reads the preferences,
  // never the GitHub token, and cannot replace it.
  const SECRET_SETTINGS = ['git_token', 'git_token_protected'];
  const SETTING_KEY = /^[A-Za-z0-9_.:-]{1,64}$/;
  const MAX_SETTINGS_PER_REQUEST = 200;
  const MAX_SETTING_TEXT = 8192;
  const fromThisComputer = (req) => isThisComputerRequest({ remoteAddress: req.socket.remoteAddress, headers: req.headers });

  app.get('/api/settings', async (req, res) => {
    try {
      const rows = getDb().prepare('SELECT key, value FROM settings').all();
      const settings = {};
      for (const row of rows) {
        try { settings[row.key] = JSON.parse(row.value); }
        catch { settings[row.key] = row.value; }
      }
      if (!fromThisComputer(req)) {
        for (const key of SECRET_SETTINGS) delete settings[key];
        res.json(settings);
        return;
      }
      // The frontend needs a working token to query the repo list; it must not
      // receive the keychain blob.
      if (typeof settings.git_token === 'string' && isEncryptedSecret(settings.git_token)) {
        const { value } = await revealSecret(settings.git_token);
        settings.git_token = value;
      }
      res.json(settings);
    } catch (error) {
      sendError(res, error);
    }
  });

  // Preferences: a name and a text, a number, a true/false (or null to clear it). Anything bigger is not a preference.
  function checkedSettings(body) {
    const entries = Object.entries(body);
    if (entries.length > MAX_SETTINGS_PER_REQUEST) throw httpError(400, 'Too many settings at once', 'too_many_settings');
    for (const [key, value] of entries) {
      if (!SETTING_KEY.test(key)) throw httpError(400, `The setting name "${key.slice(0, 40)}" is not allowed`, 'invalid_setting');
      const primitive = value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
      if (primitive) continue;
      if (typeof value === 'string' && value.length <= MAX_SETTING_TEXT) continue;
      throw httpError(400, `The setting "${key}" must be a short text, a number or true/false`, 'invalid_setting');
    }
    return entries;
  }

  // A text that reads as another JSON value ("3", "true") is stored quoted, so it comes back as the text it was.
  const storedSetting = (value) => {
    if (typeof value !== 'string') return JSON.stringify(value);
    try { JSON.parse(value); return JSON.stringify(value); } catch { return value; }
  };

  app.post('/api/settings', async (req, res) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ detail: 'Request body must be an object', code: 'invalid_body' });
      }
      const db = getDb();
      const payload = Object.fromEntries(checkedSettings(req.body));
      const ignored = [];
      if (!fromThisComputer(req)) {
        for (const key of SECRET_SETTINGS) {
          if (key in payload) {
            delete payload[key];
            ignored.push(key);
          }
        }
      }
      // The git token is a credential, not a preference: wrap it in the OS
      // keychain before it ever reaches the settings table.
      if (typeof payload.git_token === 'string' && payload.git_token) {
        const { value, protectedAtRest } = await protectSecret(payload.git_token);
        payload.git_token = value;
        payload.git_token_protected = protectedAtRest ? 1 : 0;
      }
      const transaction = db.transaction((data) => {
        const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        for (const [key, value] of Object.entries(data)) {
          upsert.run(key, storedSetting(value));
        }
      });
      // `payload`, not `req.body`: the git token must be stored in its
      // protected form, not the one that arrived.
      transaction(payload);
      res.json({ message: 'Saved', ...(ignored.length ? { ignored } : {}) });
    } catch (error) {
      sendError(res, error);
    }
  });
}
