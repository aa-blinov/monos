import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { relPath, resolveNotesPath, safePathName, httpError } from '../utils.js';

const ATTACHMENTS_DIR = '_attachments';
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;

const imageMimes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter(req, file, cb) {
    if (imageMimes.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(httpError(400, 'Only image files are allowed'));
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

      const fallbackExt = imageMimes.get(req.file.mimetype) || '.webp';
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
      const mime = [...imageMimes.entries()].find(([, value]) => value === ext)?.[0] || 'application/octet-stream';
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
      res.json({
        path: relPath(nextFullPath),
        relativePath: attachmentRelativePath(notePath, nextFullPath),
        name: path.basename(nextFullPath),
        oldPath: relPath(oldFullPath),
        oldRelativePath: attachmentRelativePath(notePath, oldFullPath),
      });
    } catch (error) {
      sendError(res, error);
    }
  });
}
