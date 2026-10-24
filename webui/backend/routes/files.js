import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from '../database.js';
import { parseFrontmatterMetadata } from '../search.js';
import { assertCreatableSegments, canonicalAppPath, decodeTextBuffer, httpError, humanSize, isPathInside, nowISO, readTextFile, readTextForRewrite, relPath, resolveNotesPath, safePathName, textFileProblem, writeFileAtomic } from '../utils.js';
import { indexFile, indexAllFiles } from '../indexing.js';
import { setFrontmatterProperty, upsertFrontmatter } from '../frontmatter.js';
import { planLinkUpdate, refreshNotesAfterRename, rewriteNoteFile } from '../link-rename.js';
import { normalizePropertyKey, normalizePropertyType, normalizePropertyValue, parseStoredProperties, readProperties } from '../properties.js';
import { isLockedNote, moveSession, readWithSession, sealWithSession, sessionFor } from '../note-lock.js';
import { carryNoteAttachments } from '../move-attachments.js';
import { relocateIndexRows } from '../index-rows.js';
import { removeFolderConfig } from '../folder-config.js';
import { deleteFromTrash, findTrashedRow, forgetIndexRows, moveNoteToTrash, trashFolder } from '../trash.js';
import { isNoteName } from '../trash-store.js';
import { requireQueryPath, requireBodyFields } from './validate.js';
import { sendError } from './helpers.js';
import { sidesOfWrittenConflict } from './git.js';

const NOTE_NAME = /\.(md|txt)$/i;

// A path that names no file: a note in the trash answers "gone" so the page can say so, anything else is not found.
function sendMissing(res, filePath) {
  if (findTrashedRow(getDb(), filePath)) return res.status(410).json({ detail: 'File is in trash', code: 'trashed' });
  return res.status(404).json({ detail: 'File not found', code: 'not_found' });
}

// Why a file cannot be written back as the text the editor has: reading it would have changed its bytes.
function damagedTextCode(problem) {
  return problem === 'nul-bytes' ? 'nul_bytes' : 'not_utf8';
}

// The text a note is edited as. A locked note is edited through its session key, and only while it is
// unlocked: without the key the edit is refused, never written in plain text over the sealed file.
function noteTextForEdit(fullPath, filePath) {
  const stored = readTextForRewrite(fullPath);
  if (!isLockedNote(stored)) return { text: stored, session: null };
  const session = sessionFor(filePath);
  if (!session) throw httpError(423, 'This note is locked');
  return { text: readWithSession(stored, session), session };
}

/** A short fingerprint of a note's text. The editor sends back the one it started from with every save. */
export function textVersion(text) {
  return crypto.createHash('sha1').update(String(text ?? ''), 'utf8').digest('hex').slice(0, 16);
}

/**
 * A save that started from text the file no longer holds — a sync brought another device's edit while the
 * note was open — is refused with the text on disk, so the editor can combine the two instead of writing
 * over the other device's edit. A save without a base version is not checked.
 */
function refuseStaleSave(req, res, fullPath, filePath) {
  const base = req.body?.base_version;
  // A version that is not text would have skipped the check silently, and the save would have overwritten the other
  // device's edit: it is refused instead.
  if (base !== undefined && base !== null && typeof base !== 'string') {
    throw httpError(400, 'base_version must be a string', 'invalid_base_version');
  }
  if (typeof base !== 'string' || !base || !fs.existsSync(fullPath)) return false;
  const current = noteTextForEdit(fullPath, filePath).text;
  const version = textVersion(current);
  if (version === base) return false;
  // Who changed it, so the two sides of a conflict can be named ("Phone, today 14:35"), not just "the other".
  const sides = sidesOfWrittenConflict(filePath, new Date().toISOString());
  res.status(409).json({ detail: 'The note changed on disk', changed: true, content: current, version, sides });
  return true;
}

// Writes an edited note back: sealed again when it is locked, plain otherwise. Returns what the file holds.
function storeNoteText(fullPath, text, session) {
  const stored = session ? sealWithSession(text, session) : text;
  writeFileAtomic(fullPath, stored, 'utf-8');
  return stored;
}

export function registerFileRoutes(app) {
  app.get('/api/file', (req, res) => {
    try {
      const fullPath = resolveNotesPath(req.query.path);
      const filePath = relPath(fullPath);
      if (!fs.existsSync(fullPath)) return sendMissing(res, filePath);
      if (fs.statSync(fullPath).isDirectory()) return res.status(400).json({ detail: 'Path is a directory', code: 'is_directory' });

      const buffer = fs.readFileSync(fullPath);
      const problem = textFileProblem(buffer);
      const stored = decodeTextBuffer(buffer);
      let content = stored;
      if (isLockedNote(stored)) {
        const session = sessionFor(filePath);
        if (!session) return res.status(423).json({ detail: 'This note is locked', locked: true, code: 'locked' });
        content = readWithSession(stored, session);
      }
      getDb().prepare('UPDATE notes_index SET last_opened = ? WHERE path = ?').run(nowISO(), filePath);
      // The text above is what could be read; a file whose bytes it does not reproduce is shown, never saved over.
      res.json({ content, version: textVersion(content), ...(problem ? { readOnly: true, code: damagedTextCode(problem) } : {}) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/file', (req, res) => {
    try {
      const requestPath = requireQueryPath(req);
      requireBodyFields(req, 'content');
      const { content } = req.body;
      if (typeof content !== 'string') throw httpError(400, 'content must be a string', 'invalid_content');
      const fullPath = resolveNotesPath(requestPath);
      const filePath = relPath(fullPath);
      const exists = fs.existsSync(fullPath);
      // Saving does not recreate a note that was renamed or deleted; creating one is explicit.
      if (!exists && req.query.create !== '1') return sendMissing(res, filePath);
      // A new note is written into its folder, which has to exist already: saving does not make folders.
      if (!exists) {
        // Every segment of the path is a name the system has to be able to create, and a note is Markdown or text:
        // `evil.exe` and a file without an extension would be written and then never listed.
        assertCreatableSegments(filePath.replace(/^notes\/?/, ''));
        if (!NOTE_NAME.test(path.basename(fullPath))) throw httpError(400, 'A note is a .md or .txt file', 'note_extension');
        const folder = path.dirname(fullPath);
        if (!fs.existsSync(folder)) return res.status(404).json({ detail: 'Folder not found', code: 'folder_not_found' });
        if (!fs.statSync(folder).isDirectory()) return res.status(400).json({ detail: 'Parent is not a folder', code: 'not_a_folder' });
      }
      const onDisk = exists ? fs.readFileSync(fullPath) : null;
      // The editor holds the text as it could read it: a file with bytes that text cannot hold would lose them.
      const problem = onDisk ? textFileProblem(onDisk) : null;
      if (problem) {
        return res.status(409).json({ detail: 'The note is not valid UTF-8 text, so it was left unchanged', code: damagedTextCode(problem) });
      }
      const locked = onDisk ? isLockedNote(decodeTextBuffer(onDisk)) : false;
      const session = locked ? sessionFor(filePath) : null;
      if (locked && !session) return res.status(423).json({ detail: 'This note is locked', locked: true, code: 'locked' });
      if (refuseStaleSave(req, res, fullPath, filePath)) return;
      const stored = storeNoteText(fullPath, content, session);
      // The text is on disk from here on, and the file is the source of truth (the index is derived from it).
      // An index left behind makes search lag, not the save fail: answering 500 would say the text is lost
      // when it is not, and the person would keep re-saving a note that is already written.
      let modified = fs.statSync(fullPath).mtime.toISOString();
      try {
        indexFile(fullPath, stored);
        modified = getDb().prepare('SELECT modified_at FROM notes_index WHERE path = ?').get(filePath)?.modified_at || modified;
      } catch (error) {
        console.error('Note saved, index not updated:', error);
      }
      res.json({ message: 'Saved', modified, version: textVersion(content) });
    } catch (error) {
      sendError(res, error);
    }
  });

  // A note or a folder goes to the trash (`.trash/` in the notes folder, see trash-store.js) and can be brought back.
  // `permanent=1` removes it for good; from the trash page it names the note in the trash (`trashed=1` says so
  // outright: it is never read as the live note of the same name).
  app.delete('/api/file', (req, res) => {
    try {
      const requestPath = requireQueryPath(req);
      const permanent = req.query.permanent === '1' || req.query.permanent === 'true';
      const onlyTrashed = req.query.trashed === '1' || req.query.trashed === 'true';
      const db = getDb();
      const appPath = canonicalAppPath(requestPath);

      if (permanent) {
        const trashed = appPath ? findTrashedRow(db, appPath) : null;
        if (trashed) {
          deleteFromTrash(db, trashed);
          res.json({ message: 'Deleted' });
          return;
        }
        if (onlyTrashed) return res.status(404).json({ detail: 'File not found', code: 'not_found' });
      }

      const fullPath = resolveNotesPath(requestPath);
      const filePath = relPath(fullPath);
      if (!fs.existsSync(fullPath)) {
        // Deleting what is already in the trash is not an error: the second click of a double click lands here.
        const twin = !permanent ? findTrashedRow(db, filePath) : null;
        if (twin) return res.json({ message: 'Moved to trash', trashedAt: twin.trashed_at, trashPath: twin.path });
        return res.status(404).json({ detail: 'File not found', code: 'not_found' });
      }
      const isDir = fs.statSync(fullPath).isDirectory();

      if (!permanent) {
        if (isDir) {
          const result = trashFolder(db, fullPath);
          res.json({ message: 'Moved to trash', trashedAt: result.trashedAt, isDir: true, notes: result.notes });
          return;
        }
        if (!isNoteName(path.basename(fullPath))) {
          // Not a note: nothing in the app lists it, so the trash would never show it again.
          return res.status(400).json({ detail: 'Only notes and folders go to the trash', code: 'not_deletable' });
        }
        const result = moveNoteToTrash(db, fullPath);
        res.json({ message: 'Moved to trash', trashedAt: result.trashedAt, trashPath: result.trashPath });
        return;
      }

      if (isDir) fs.rmSync(fullPath, { recursive: true });
      else fs.unlinkSync(fullPath);
      forgetIndexRows(db, filePath);
      removeFolderConfig(db, filePath);

      res.json({ message: 'Deleted' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/file/rename', (req, res) => {
    try {
      const requestPath = requireQueryPath(req);
      const newName = safePathName(req.body?.new_name);
      const fullPath = resolveNotesPath(requestPath);
      const filePath = relPath(fullPath);
      if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: 'File not found', code: 'not_found' });
      const isDir = fs.statSync(fullPath).isDirectory();
      // A note renamed to `x.exe` would be written and never listed again.
      if (!isDir && isNoteName(path.basename(fullPath)) && !NOTE_NAME.test(newName)) {
        throw httpError(400, 'A note is a .md or .txt file', 'note_extension');
      }
      const newFullPath = path.join(path.dirname(fullPath), newName);
      // On a file system that ignores case, `Rn3.md` and `rn3.md` are one file: renaming it is a change of spelling,
      // not a clash with another note.
      if (newFullPath !== fullPath && fs.existsSync(newFullPath) && !isSameFile(fullPath, newFullPath)) {
        return res.status(409).json({ detail: 'Target already exists', code: 'exists' });
      }
      const newRelativePath = relPath(newFullPath);
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
      sendError(res, error);
    }
  });

  app.post('/api/file/move', (req, res) => {
    try {
      const { source, target } = req.query;
      const sourceFull = resolveNotesPath(source);
      const sourcePath = relPath(sourceFull);
      const targetDir = resolveNotesPath(target, { allowRoot: true });
      if (!fs.existsSync(sourceFull)) return res.status(404).json({ detail: 'File not found', code: 'not_found' });
      if (!fs.existsSync(targetDir)) return res.status(404).json({ detail: 'Folder not found', code: 'folder_not_found' });
      if (!fs.statSync(targetDir).isDirectory()) return res.status(400).json({ detail: 'Target is not a folder', code: 'not_a_folder' });
      const isDir = fs.statSync(sourceFull).isDirectory();
      // rename() cannot move a folder into itself, and its error would name both paths: refuse it here.
      if (isDir && isPathInside(sourceFull, targetDir)) {
        return res.status(400).json({ detail: 'A folder cannot be moved into itself', code: 'move_into_itself' });
      }
      const destination = path.join(targetDir, path.basename(sourceFull));
      // rename() would silently replace a note with the same name in the target folder.
      if (path.resolve(destination) !== path.resolve(sourceFull) && fs.existsSync(destination)) {
        return res.status(409).json({ detail: 'Target already exists', code: 'exists' });
      }
      const newRelativePath = relPath(destination);
      fs.renameSync(sourceFull, destination);
      relocateIndexRows(getDb(), sourcePath, newRelativePath, path.basename(destination), path.dirname(newRelativePath).replace(/\\/g, '/'));
      moveSession(sourcePath, newRelativePath);

      // The pictures stay in the old folder's `_attachments` unless they are carried along (move-attachments.js).
      let carried = 0;
      try {
        if (isDir) {
          for (const note of notesBelow(destination)) {
            const before = path.join(sourceFull, path.relative(destination, note));
            carried += carryNoteAttachments({ oldNoteFull: before, newNoteFull: note, moved: { from: sourceFull, to: destination } }).carried;
          }
        } else if (isNoteName(path.basename(destination))) {
          carried = carryNoteAttachments({ oldNoteFull: sourceFull, newNoteFull: destination }).carried;
        }
      } catch (error) {
        console.error('Moved, but the pictures could not all be carried along:', error);
      }
      indexAllFiles();
      res.json({ message: 'Moved', path: newRelativePath, attachments: carried });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/file-info', (req, res) => {
    try {
      const fullPath = resolveNotesPath(req.query.path, { allowRoot: true });
      const filePath = relPath(fullPath);
      if (!fs.existsSync(fullPath)) return sendMissing(res, filePath);

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
        properties: meta ? parseStoredProperties(meta.props) : [],
        locked: !stats.isDirectory() && isLockedNote(readTextFile(fullPath)),
        unlocked: Boolean(sessionFor(filePath)),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Sets one custom property in the note's frontmatter, or removes it with `remove: true`. The keys the
  // app manages (title, tags, category, pinned, aliases) have their own controls and are refused here.
  app.put('/api/file/property', (req, res) => {
    try {
      const fullPath = resolveNotesPath(requireQueryPath(req));
      const filePath = relPath(fullPath);
      if (!fs.existsSync(fullPath)) return sendMissing(res, filePath);

      const key = normalizePropertyKey(req.body?.key);
      if (!key) throw httpError(400, 'The property name is not allowed', 'invalid_property');
      let property = null;
      if (!req.body?.remove) {
        const type = normalizePropertyType(req.body?.type);
        const value = type ? normalizePropertyValue(type, req.body?.value) : null;
        if (!type || value === null) throw httpError(400, 'The value does not match the property type', 'invalid_property');
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
        if (error.message === 'not UTF-8') throw httpError(409, 'The note is not UTF-8 text, so it was left unchanged', 'not_utf8');
        throw error;
      }
      const text = readTextFile(fullPath);
      indexFile(fullPath, text);
      res.json({ path: filePath, properties: readProperties(text) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.put('/api/file/metadata', (req, res) => {
    try {
      const fullPath = resolveNotesPath(requireQueryPath(req));
      const filePath = relPath(fullPath);
      const { title, tags, category, content, pinned } = req.body || {};
      for (const [name, value] of [['title', title], ['category', category], ['content', content]]) {
        if (value !== undefined && value !== null && typeof value !== 'string') throw httpError(400, `${name} must be text`, `invalid_${name}`);
      }
      if (tags !== undefined && tags !== null && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string'))) {
        throw httpError(400, 'tags must be a list of text', 'invalid_tags');
      }
      if (pinned !== undefined && pinned !== null && typeof pinned !== 'boolean') throw httpError(400, 'pinned must be true or false', 'invalid_pinned');
      if (!fs.existsSync(fullPath)) return sendMissing(res, filePath);
      if (fs.statSync(fullPath).isDirectory()) return res.status(400).json({ detail: 'Path is a directory', code: 'is_directory' });
      const editable = noteTextForEdit(fullPath, filePath);
      if (refuseStaleSave(req, res, fullPath, filePath)) return;
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
        version: textVersion(nextContent),
      });
    } catch (error) {
      sendError(res, error);
    }
  });
}

function isSameFile(left, right) {
  try {
    const a = fs.statSync(left);
    const b = fs.statSync(right);
    return a.ino === b.ino && a.dev === b.dev;
  } catch {
    return false;
  }
}

// The notes under a folder, for the pictures of each to be carried after the folder moved.
function notesBelow(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_') || entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) notesBelow(full, out);
    else if (isNoteName(entry.name)) out.push(full);
  }
  return out;
}
