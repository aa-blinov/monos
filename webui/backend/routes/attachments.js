import fs from 'fs';
import path from 'path';
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

  app.get('/api/attachments/raw', (req, res) => {
    try {
      const fullPath = assertAnyAttachmentPath(req.query.path);
      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        throw httpError(404, 'Attachment not found');
      }

      const ext = path.extname(fullPath).toLowerCase();
      const mime = [...imageMimes.entries()].find(([, value]) => value === ext)?.[0]
        || (ext === '.pdf' ? PDF_MIME : 'application/octet-stream');
      res.type(mime);
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
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, out);
    else out.push(full);
  }
  return out;
}

function resolveReferencedPaths(noteFullPath, markdown) {
  const noteDir = path.dirname(noteFullPath);
  const found = new Set();
  for (const match of String(markdown || '').matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
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

export function registerOrphanRoutes(app) {
  app.get('/api/attachments/orphans', (_req, res) => {
    try {
      const allFiles = collectFiles(NOTES_DIR);
      const notes = allFiles.filter((file) => file.endsWith('.md') || file.endsWith('.markdown'));

      const referenced = new Set();
      const named = new Set();
      let lockedNotes = 0;
      for (const note of notes) {
        const text = referenceTextOf(note);
        if (text === null) {
          lockedNotes += 1;
          continue;
        }
        for (const target of resolveReferencedPaths(note, text)) referenced.add(target);
        for (const name of namedReferences(text)) named.add(name);
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
