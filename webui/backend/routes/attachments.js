import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { NOTES_DIR } from '../config.js';
import { relPath, resolveNotesPath, safePathName, httpError, readTextFile } from '../utils.js';
import { rewriteAttachmentReferences } from '../attachment-refs.js';
import { isLockedNote, readWithSession, sessionFor } from '../note-lock.js';

const ATTACHMENTS_DIR = '_attachments';
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;

const imageMimes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
]);

// A PDF is kept as it is (no picture conversion) and shown by the `![[name.pdf]]` embed.
const PDF_MIME = 'application/pdf';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter(req, file, cb) {
    if (imageMimes.has(file.mimetype) || file.mimetype === PDF_MIME) {
      cb(null, true);
      return;
    }
    cb(httpError(400, 'Only image and PDF files are allowed'));
  },
});

function sendError(res, error) {
  res.status(error.statusCode || 500).json({ detail: error.message });
}

function normalizePosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function attachmentDirForNote(notePath) {
  const noteFullPath = resolveNotesPath(notePath);
  if (fs.existsSync(noteFullPath) && fs.statSync(noteFullPath).isDirectory()) {
    throw httpError(400, 'Path is a directory');
  }
  return path.join(path.dirname(noteFullPath), ATTACHMENTS_DIR);
}

function attachmentRelativePath(notePath, attachmentPath) {
  const noteDir = path.dirname(resolveNotesPath(notePath));
  return normalizePosixPath(path.relative(noteDir, attachmentPath));
}

function cleanAttachmentName(name, fallbackExt) {
  const requested = safePathName(String(name || '').trim() || `image-${Date.now()}${fallbackExt}`);
  const ext = path.extname(requested).toLowerCase();
  const base = path.basename(requested, ext).replace(/[^\p{L}\p{N}._ -]+/gu, '-').trim() || 'image';
  const nextExt = imageMimes.has(`image/${ext.slice(1)}`) ? ext : fallbackExt;
  return `${base}${nextExt}`;
}

function uniquePath(dir, fileName) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = path.join(dir, fileName);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}-${index}${ext}`);
    index += 1;
  }
  return candidate;
}

function assertAttachmentPathForNote(notePath, itemPath) {
  const attachmentDir = path.resolve(attachmentDirForNote(notePath));
  const fullPath = path.resolve(resolveNotesPath(itemPath));
  const relative = path.relative(attachmentDir, fullPath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw httpError(403, 'Attachment path must be inside note attachments');
  }
  return fullPath;
}

function assertAnyAttachmentPath(itemPath) {
  const fullPath = resolveNotesPath(itemPath);
  const parts = normalizePosixPath(itemPath).split('/');
  if (!parts.includes(ATTACHMENTS_DIR)) {
    throw httpError(403, 'Attachment path required');
  }
  return fullPath;
}

export function registerAttachmentRoutes(app) {
  function uploadAttachment(req, res, next) {
    upload.single('file')(req, res, (error) => {
      if (error) {
        sendError(res, error);
        return;
      }
      next();
    });
  }

  app.post('/api/attachments', uploadAttachment, (req, res) => {
    try {
      const { notePath } = req.query;
      if (!req.file) throw httpError(400, 'File required');

      const dir = attachmentDirForNote(notePath);
      fs.mkdirSync(dir, { recursive: true });

      const fallbackExt = imageMimes.get(req.file.mimetype) || (req.file.mimetype === PDF_MIME ? '.pdf' : '.webp');
      const fileName = cleanAttachmentName(req.body?.name || req.file.originalname, fallbackExt);
      const fullPath = uniquePath(dir, fileName);
      fs.writeFileSync(fullPath, req.file.buffer);

      res.json({
        path: relPath(fullPath),
        relativePath: attachmentRelativePath(notePath, fullPath),
        name: path.basename(fullPath),
        mime: req.file.mimetype,
        size: req.file.size,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/attachments/thumb', async (req, res) => {
    try {
      const fullPath = assertAnyAttachmentPath(req.query.path);
      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) throw httpError(404, 'Attachment not found');
      const width = Math.min(THUMB_MAX, Math.max(THUMB_MIN, Number.parseInt(req.query.w, 10) || 480));
      const made = await thumbnailFor(fullPath, width);
      // The address carries the file's time (`v`), so a copy never goes stale and the browser keeps it.
      res.set('Cache-Control', req.query.v ? 'private, max-age=31536000, immutable' : 'private, max-age=60');
      if (!made) {
        // A PDF without a preview here has no picture to give; anything else is served as it is.
        if (/\.pdf$/i.test(fullPath)) throw httpError(404, 'No preview for this file');
        res.set('X-Thumbnail', 'original');
        res.redirect(307, `/api/attachments/raw?path=${encodeURIComponent(req.query.path)}`);
        return;
      }
      if (Math.random() < 0.02) setImmediate(purgeOldThumbnails);
      res.sendFile(made, { dotfiles: 'allow' });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/attachments/raw', (req, res) => {
    try {
      const fullPath = assertAnyAttachmentPath(req.query.path);
      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        throw httpError(404, 'Attachment not found');
      }

      const ext = path.extname(fullPath).toLowerCase();
      const mime = [...imageMimes.entries()].find(([, value]) => value === ext)?.[0]
        || (ext === '.pdf' ? PDF_MIME : ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream');
      res.type(mime);
      res.set('X-Content-Type-Options', 'nosniff');
      // A picture from an imported archive is not trusted: an SVG may carry script, so it runs in a sandbox. Only
      // an SVG: a sandbox policy on a PDF would stop the viewer from showing it.
      if (ext === '.svg') res.set('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
      res.sendFile(fullPath);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/attachments/rename', (req, res) => {
    try {
      const { notePath, path: itemPath, newName } = req.body || {};
      const oldFullPath = assertAttachmentPathForNote(notePath, itemPath);
      if (!fs.existsSync(oldFullPath) || fs.statSync(oldFullPath).isDirectory()) {
        throw httpError(404, 'Attachment not found');
      }

      const ext = path.extname(oldFullPath).toLowerCase();
      const nextName = cleanAttachmentName(newName, ext);
      const nextFullPath = path.join(path.dirname(oldFullPath), nextName);
      if (fs.existsSync(nextFullPath) && path.resolve(nextFullPath) !== path.resolve(oldFullPath)) {
        throw httpError(409, 'Attachment already exists');
      }

      fs.renameSync(oldFullPath, nextFullPath);
      const references = rewriteAttachmentReferences({ oldFullPath, newFullPath: nextFullPath });
      res.json({
        path: relPath(nextFullPath),
        relativePath: attachmentRelativePath(notePath, nextFullPath),
        name: path.basename(nextFullPath),
        oldPath: relPath(oldFullPath),
        oldRelativePath: attachmentRelativePath(notePath, oldFullPath),
        ...references,
      });
    } catch (error) {
      sendError(res, error);
    }
  });
}

/**
 * Attachment files that no note points at.
 *
 * Nothing in the interface could surface these: the tree hides `_attachments`,
 * and the board only lists notes. After the migration that moved pooled images
 * next to their notes, one orphan (`image-1.png`) was left behind with no way
 * to find it — the file just took up space in every ZIP export.
 */
function collectFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    // A link is neither a note nor an attachment: it may dangle or point out of the notes.
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, out);
    else out.push(full);
  }
  return out;
}

function resolveReferencedPaths(noteFullPath, markdown) {
  const noteDir = path.dirname(noteFullPath);
  const found = new Set();
  // Images `![](…)` and plain links `[name](…)` both keep a file in use (a PDF is linked, not embedded).
  for (const match of String(markdown || '').matchAll(/\]\(([^)\s]+)/g)) {
    let target = match[1].trim();
    if (/^(https?:|data:)/i.test(target)) continue;
    try {
      target = decodeURI(target);
    } catch {
      // A malformed escape is still a path we can try as-is.
    }
    const full = path.resolve(noteDir, target);
    if (!full.startsWith(path.resolve(noteDir) + path.sep)) continue;
    found.add(path.resolve(full));
  }
  return found;
}

// Obsidian and the editor name a file rather than a path: `![[pic.png]]` and `[[report.pdf|the report]]`
// mean a file of that name wherever it sits in the notes, and an HTML <img src> may carry a path. A file
// whose name is written anywhere counts as in use.
function namedReferences(markdown) {
  const names = new Set();
  const text = String(markdown || '');
  for (const match of text.matchAll(/\[\[([^\]|#\n]+)/g)) names.add(fileNameOf(match[1]));
  for (const match of text.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) names.add(fileNameOf(match[1]));
  return names;
}

function fileNameOf(target) {
  let name = String(target).trim();
  try {
    name = decodeURI(name);
  } catch {
    // A malformed escape is still a name we can try as written.
  }
  return name.split('/').pop();
}

// The text a note is read from for its references. A locked note is unreadable until it is unlocked in
// this session: null tells the caller that the pictures it uses are unknown.
function referenceTextOf(notePath) {
  const text = readTextFile(notePath);
  if (!isLockedNote(text)) return text;
  const session = sessionFor(relPath(notePath));
  if (!session) return null;
  try {
    return readWithSession(text, session);
  } catch {
    return null;
  }
}

/**
 * Every picture and PDF in a `_attachments` folder, with the notes that use it. A file is used by a note that
 * links it by path or writes its name; `usedBy` is empty for an unused one. Null while a locked note is closed:
 * what it uses is unknown, so nothing is called unused.
 */
/** The folder of the notes a file belongs to: what comes before its first `_attachments` segment. */
function folderOfAttachment(file) {
  const parts = path.relative(path.resolve(NOTES_DIR), file).split(path.sep);
  const at = parts.indexOf(ATTACHMENTS_DIR);
  return parts.slice(0, at < 0 ? -1 : at).join('/');
}

// What each note points at, remembered by the note's size and modification time: a list of the whole vault
// reads only the notes that changed since the last one. A locked note is never remembered (its text is only
// readable while it is unlocked in this session).
const referenceCache = new Map(); // absolute note path -> { signature, paths, names }
const REFERENCE_CACHE_LIMIT = 20000;

/** @returns {{ locked: true } | { locked: false, paths: Set<string>, names: Set<string> }} */
function noteReferences(notePath) {
  let signature = '';
  try {
    const stats = fs.statSync(notePath);
    signature = `${stats.size}:${stats.mtimeMs}`;
  } catch {
    return { locked: false, paths: new Set(), names: new Set() };
  }
  const cached = referenceCache.get(notePath);
  if (cached && cached.signature === signature) return { locked: false, paths: cached.paths, names: cached.names };
  const stored = readTextFile(notePath);
  const sealed = isLockedNote(stored);
  const text = sealed ? referenceTextOf(notePath) : stored;
  if (text === null) return { locked: true };
  const result = { paths: resolveReferencedPaths(notePath, text), names: namedReferences(text) };
  if (!sealed) {
    if (referenceCache.size >= REFERENCE_CACHE_LIMIT) referenceCache.clear();
    referenceCache.set(notePath, { signature, ...result });
  }
  return { locked: false, ...result };
}

function listAttachments() {
  const allFiles = collectFiles(NOTES_DIR);
  const notes = allFiles.filter((file) => /\.(md|markdown)$/i.test(file));
  const byPath = new Map();
  const byName = new Map();
  let lockedNotes = 0;
  for (const note of notes) {
    const references = noteReferences(note);
    if (references.locked) {
      lockedNotes += 1;
      continue;
    }
    const entry = { path: relPath(note), title: path.basename(note).replace(/\.(md|markdown)$/i, '') };
    for (const target of references.paths) {
      if (!byPath.has(target)) byPath.set(target, new Map());
      byPath.get(target).set(entry.path, { ...entry, via: 'link' });
    }
    for (const name of references.names) {
      if (!byName.has(name)) byName.set(name, new Map());
      byName.get(name).set(entry.path, { ...entry, via: 'name' });
    }
  }
  const items = allFiles
    .filter((file) => path.relative(path.resolve(NOTES_DIR), file).split(path.sep).includes(ATTACHMENTS_DIR))
    .filter((file) => /\.(png|jpe?g|gif|webp|svg|pdf)$/i.test(file))
    .map((file) => {
      let stats;
      try { stats = fs.statSync(file); } catch { return null; }
      // A note that links the file by path is told apart from one that only writes its name: a name matches every
      // file of that name, so it is the weaker kind of use.
      const users = new Map([...(byName.get(path.basename(file)) || []), ...(byPath.get(path.resolve(file)) || [])]);
      return {
        path: relPath(file),
        name: path.basename(file),
        kind: /\.pdf$/i.test(file) ? 'pdf' : 'image',
        folder: folderOfAttachment(file),
        size: stats.size,
        modified: stats.mtime.toISOString(),
        usedBy: [...users.values()],
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.modified.localeCompare(a.modified));
  return { items, lockedNotes };
}

// Small copies for the Attachments page. A page of 60 cards must not load 60 originals (photos run to megabytes),
// so each card asks for a copy about its own size. The copy is made by Electron's image library in the app
// (and by the system's preview for the first page of a PDF, where there is one), kept in `.monos/thumbs`, and
// keyed by the file's size and time, so a changed file gets a new copy. Without Electron (a plain Node run) the
// original is served: slower, never wrong.
const THUMB_MIN = 96;
const THUMB_MAX = 1200;
let electronImageModule;
async function electronImage() {
  if (electronImageModule !== undefined) return electronImageModule;
  try {
    const electron = process.versions?.electron ? await import('electron') : null;
    electronImageModule = electron?.nativeImage ? electron.nativeImage : null;
  } catch {
    electronImageModule = null;
  }
  return electronImageModule;
}

// Decoding a big picture takes a moment and the page asks for many at once: a few at a time.
const THUMB_PARALLEL = 3;
let thumbRunning = 0;
const thumbWaiting = [];
async function withThumbSlot(task) {
  if (thumbRunning >= THUMB_PARALLEL) await new Promise((resolve) => thumbWaiting.push(resolve));
  thumbRunning += 1;
  try {
    return await task();
  } finally {
    thumbRunning -= 1;
    thumbWaiting.shift()?.();
  }
}

const thumbsRoot = () => path.join(NOTES_DIR, '.monos', 'thumbs');
const thumbsInFlight = new Map();

/** The path of a ready copy of `fullPath` at `width`, or null when none can be made here. */
async function thumbnailFor(fullPath, width) {
  const nativeImage = await electronImage();
  if (!nativeImage) return null;
  const ext = path.extname(fullPath).toLowerCase();
  const isPdf = ext === '.pdf';
  if (!isPdf && !['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return null; // svg and gif are served as they are
  const stats = fs.statSync(fullPath);
  const key = crypto.createHash('sha1').update(`${fullPath}|${stats.size}|${stats.mtimeMs}|${width}`).digest('hex');
  const outExt = isPdf || ext === '.png' ? '.png' : '.jpg';
  const target = path.join(thumbsRoot(), `${key}${outExt}`);
  if (fs.existsSync(target)) return target;
  if (thumbsInFlight.has(target)) return thumbsInFlight.get(target);
  const job = withThumbSlot(async () => {
    let image;
    if (isPdf) {
      if (typeof nativeImage.createThumbnailFromPath !== 'function') return null;
      image = await nativeImage.createThumbnailFromPath(fullPath, { width, height: Math.round(width * 1.42) });
    } else {
      image = nativeImage.createFromPath(fullPath);
      const size = image.isEmpty() ? null : image.getSize();
      // Already as small as the card needs: the original is the copy.
      if (!size || size.width <= width) return null;
      image = image.resize({ width, quality: 'good' });
    }
    if (!image || image.isEmpty()) return null;
    fs.mkdirSync(thumbsRoot(), { recursive: true });
    const data = outExt === '.jpg' ? image.toJPEG(80) : image.toPNG();
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, data);
    fs.renameSync(temporary, target);
    return target;
  }).catch(() => null).finally(() => thumbsInFlight.delete(target));
  thumbsInFlight.set(target, job);
  return job;
}

/** Copies not touched for 30 days go; called now and then, never on the request's way. */
function purgeOldThumbnails() {
  const limit = Date.now() - 30 * 86400000;
  try {
    for (const name of fs.readdirSync(thumbsRoot())) {
      const full = path.join(thumbsRoot(), name);
      if (fs.statSync(full).atimeMs < limit && fs.statSync(full).mtimeMs < limit) fs.rmSync(full, { force: true });
    }
  } catch {
    // No copies yet.
  }
}

const TRASH_DAYS = 30;
const trashRoot = () => path.join(NOTES_DIR, '.monos', 'attachments-trash');

function walkFiles(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

/** Batches older than TRASH_DAYS are gone for good; recent ones can still be restored. */
function purgeOldBatches() {
  const root = trashRoot();
  let batches = [];
  try { batches = fs.readdirSync(root); } catch { return; }
  const limit = Date.now() - TRASH_DAYS * 86400000;
  for (const batch of batches) {
    const stamp = Number(batch.split('-')[0]);
    if (Number.isFinite(stamp) && stamp < limit) fs.rmSync(path.join(root, batch), { recursive: true, force: true });
  }
}

export function registerOrphanRoutes(app) {
  // Unused pictures and PDFs go to a local trash (`.monos/attachments-trash`, kept 30 days), never straight to
  // nothing. A file any note still uses is refused, whatever the client says.
  app.post('/api/attachments/delete', (req, res) => {
    try {
      const requested = Array.isArray(req.body?.paths) ? req.body.paths : [];
      if (requested.length > 5000) throw httpError(413, 'Too many files at once');
      if (requested.length === 0) throw httpError(400, 'Nothing to delete');
      const { items, lockedNotes } = listAttachments();
      if (lockedNotes > 0) throw httpError(409, 'A locked note is closed, so its files cannot be told from unused ones');
      const byPath = new Map(items.map((item) => [item.path, item]));
      const batch = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let deleted = 0;
      let bytes = 0;
      const trashed = [];
      const skipped = { used: 0, missing: 0 };
      for (const itemPath of requested) {
        const item = byPath.get(itemPath);
        if (!item) { skipped.missing += 1; continue; }
        if (item.usedBy.length > 0) { skipped.used += 1; continue; }
        const full = assertAnyAttachmentPath(item.path);
        const target = path.join(trashRoot(), batch, path.relative(path.resolve(NOTES_DIR), full));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.renameSync(full, target);
        deleted += 1;
        bytes += item.size;
        trashed.push(item.path);
      }
      purgeOldBatches();
      res.json({ batch: deleted ? batch : null, deleted, bytes, skipped, trashed });
    } catch (error) {
      sendError(res, error);
    }
  });

  // What is in the local trash, newest batch first, so a person can bring a file back after the notice is gone.
  app.get('/api/attachments/trash', (_req, res) => {
    try {
      const root = trashRoot();
      let batches = [];
      try { batches = fs.readdirSync(root); } catch { batches = []; }
      const out = batches.filter((batch) => /^\d+-[0-9a-z]+$/.test(batch)).map((batch) => {
        const dir = path.join(root, batch);
        const files = walkFiles(dir).map((file) => ({
          path: path.relative(dir, file).split(path.sep).join('/'),
          name: path.basename(file),
          size: fs.statSync(file).size,
        }));
        return { batch, at: new Date(Number(batch.split('-')[0])).toISOString(), files };
      }).filter((entry) => entry.files.length > 0).sort((a, b) => b.at.localeCompare(a.at));
      res.json({ batches: out, days: TRASH_DAYS });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Brings back a whole batch, or only `paths` from it. A name that is taken again is not overwritten: the
  // restored file gets "(restored)" in its name, and the answer says how many were renamed.
  app.post('/api/attachments/restore', (req, res) => {
    try {
      const batch = String(req.body?.batch || '');
      if (!/^\d+-[0-9a-z]+$/.test(batch)) throw httpError(400, 'Invalid batch');
      const dir = path.join(trashRoot(), batch);
      if (!fs.existsSync(dir)) throw httpError(404, 'Nothing to restore');
      const only = Array.isArray(req.body?.paths) ? new Set(req.body.paths.map((value) => String(value))) : null;
      const notesRootAbs = path.resolve(NOTES_DIR);
      let restored = 0;
      let renamed = 0;
      for (const file of walkFiles(dir)) {
        const relative = path.relative(dir, file).split(path.sep).join('/');
        if (only && !only.has(relative) && !only.has(`notes/${relative}`)) continue;
        let target = path.join(notesRootAbs, relative);
        if (!path.resolve(target).startsWith(notesRootAbs + path.sep)) continue;
        if (fs.existsSync(target)) {
          const ext = path.extname(target);
          let index = 1;
          do {
            target = path.join(path.dirname(target), `${path.basename(target, ext).replace(/ \(restored(?: \d+)?\)$/, '')} (restored${index > 1 ? ` ${index}` : ''})${ext}`);
            index += 1;
          } while (fs.existsSync(target));
          renamed += 1;
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.renameSync(file, target);
        restored += 1;
      }
      if (walkFiles(dir).length === 0) fs.rmSync(dir, { recursive: true, force: true });
      res.json({ restored, renamed });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/attachments/all', (_req, res) => {
    try {
      res.json(listAttachments());
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });

  app.get('/api/attachments/orphans', (_req, res) => {
    try {
      const allFiles = collectFiles(NOTES_DIR);
      const notes = allFiles.filter((file) => /\.(md|markdown)$/i.test(file));

      const referenced = new Set();
      const named = new Set();
      let lockedNotes = 0;
      for (const note of notes) {
        const references = noteReferences(note);
        if (references.locked) {
          lockedNotes += 1;
          continue;
        }
        for (const target of references.paths) referenced.add(target);
        for (const name of references.names) named.add(name);
      }

      // A closed locked note may show any picture and its text cannot be read, so until it is unlocked
      // nothing is listed as unused: a picture it still uses must not be reported as unused.
      if (lockedNotes > 0) {
        res.json({ orphans: [], totalSize: 0, lockedNotes });
        return;
      }

      const orphans = allFiles
        .filter((file) => !referenced.has(path.resolve(file)) && !named.has(path.basename(file)))
        .filter((file) => /\.(png|jpe?g|gif|webp|svg)$/i.test(file))
        .map((file) => {
          const stats = fs.statSync(file);
          return {
            path: relPath(file),
            name: path.basename(file),
            folder: path.relative(path.resolve(NOTES_DIR), path.dirname(file)).split(path.sep).join('/'),
            size: stats.size,
            modified: stats.mtime.toISOString(),
          };
        })
        .sort((a, b) => b.size - a.size);

      res.json({ orphans, totalSize: orphans.reduce((sum, item) => sum + item.size, 0), lockedNotes: 0 });
    } catch (error) {
      res.status(500).json({ detail: error.message });
    }
  });
}
