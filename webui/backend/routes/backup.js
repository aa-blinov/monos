import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import multer from 'multer';
import { NOTES_DIR } from '../config.js';
import { decodeTextBuffer, httpError, readTextFile, textFileBuffer } from '../utils.js';
import { indexAllFiles } from '../indexing.js';

const MAX_ARCHIVE_SIZE = 100 * 1024 * 1024;
const ARCHIVE_FIELD = 'archive';
const SKIPPED_SEGMENTS = new Set(['__MACOSX', '.monos', '.git']);
const SKIPPED_FILES = new Set(['.DS_Store', 'Thumbs.db']);
const IMPORTABLE_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.pdf',
]);
const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ARCHIVE_SIZE, files: 1 },
  fileFilter(req, file, cb) {
    const name = String(file.originalname || '').toLowerCase();
    if (name.endsWith('.zip') || file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed') {
      cb(null, true);
      return;
    }
    cb(httpError(400, 'Only ZIP archives are supported'));
  },
});

function normalizeArchivePath(entryName) {
  const normalized = String(entryName || '')
    .replace(/\\/g, '/')
    .replace(/^[a-zA-Z]:/, '')
    .replace(/^\/+/, '');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return '';
  if (segments.some(segment => segment === '.' || segment === '..')) return '';
  if (segments.some(segment => segment.startsWith('.') || SKIPPED_SEGMENTS.has(segment))) return '';
  if (SKIPPED_FILES.has(segments.at(-1))) return '';
  return segments.join('/');
}

function resolveInsideNotes(relativePath) {
  const target = path.resolve(NOTES_DIR, relativePath);
  const notesRoot = path.resolve(NOTES_DIR);
  const relative = path.relative(notesRoot, target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw httpError(403, 'Archive entry must stay inside notes');
  }
  return target;
}

function isImportableFile(relativePath) {
  return IMPORTABLE_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

function normalizeTextFileBuffer(buffer) {
  return textFileBuffer(decodeTextBuffer(buffer));
}

function uniqueTargetPath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath;
  const dir = path.dirname(targetPath);
  const ext = path.extname(targetPath);
  const base = path.basename(targetPath, ext);
  let index = 2;
  let candidate = path.join(dir, `${base} ${index}${ext}`);
  while (fs.existsSync(candidate)) {
    index += 1;
    candidate = path.join(dir, `${base} ${index}${ext}`);
  }
  return candidate;
}

function shouldSkipExportPath(relativePath) {
  const segments = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments.some(segment => segment.startsWith('.') || SKIPPED_SEGMENTS.has(segment) || SKIPPED_FILES.has(segment));
}

function addDirectoryToArchive(zip, absoluteDir, relativeDir = '') {
  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  let exported = 0;

  for (const entry of entries) {
    const absolutePath = path.join(absoluteDir, entry.name);
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    if (shouldSkipExportPath(relativePath)) continue;

    if (entry.isDirectory()) {
      const nestedCount = addDirectoryToArchive(zip, absolutePath, relativePath);
      if (nestedCount === 0) {
        zip.addFile(`${relativePath}/`, Buffer.alloc(0));
      }
      exported += 1;
      continue;
    }

    if (entry.isFile()) {
      const ext = path.extname(relativePath).toLowerCase();
      zip.addFile(relativePath, TEXT_EXTENSIONS.has(ext) ? textFileBuffer(readTextFile(absolutePath)) : fs.readFileSync(absolutePath));
      exported += 1;
    }
  }

  return exported;
}

function importZip(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const summary = {
    importedFiles: 0,
    importedNotes: 0,
    importedAttachments: 0,
    skipped: 0,
    renamed: 0,
  };

  for (const entry of entries) {
    const relativePath = normalizeArchivePath(entry.entryName);
    if (!relativePath) {
      summary.skipped += 1;
      continue;
    }

    const targetPath = resolveInsideNotes(relativePath);
    if (entry.isDirectory) {
      fs.mkdirSync(targetPath, { recursive: true });
      continue;
    }

    if (!isImportableFile(relativePath)) {
      summary.skipped += 1;
      continue;
    }

    const finalPath = uniqueTargetPath(targetPath);
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });
    const entryData = entry.getData();
    const ext = path.extname(finalPath).toLowerCase();
    fs.writeFileSync(finalPath, TEXT_EXTENSIONS.has(ext) ? normalizeTextFileBuffer(entryData) : entryData);

    summary.importedFiles += 1;
    if (TEXT_EXTENSIONS.has(ext)) {
      summary.importedNotes += 1;
    } else {
      summary.importedAttachments += 1;
    }
    if (finalPath !== targetPath) summary.renamed += 1;
  }

  if (summary.importedFiles === 0) {
    throw httpError(400, 'Archive does not contain supported note files');
  }

  indexAllFiles();
  return summary;
}

function sendError(res, error) {
  res.status(error.statusCode || 500).json({ detail: error.message });
}

export function registerBackupRoutes(app) {
  app.get('/api/backup/export', (req, res) => {
    try {
      const zip = new AdmZip();
      const exportedFiles = addDirectoryToArchive(zip, NOTES_DIR);
      const today = new Date().toISOString().slice(0, 10);
      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="monos-notes-${today}.zip"`,
        'X-Monos-Exported-Files': String(exportedFiles),
      });
      res.send(zip.toBuffer());
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/backup/import', (req, res, next) => {
    upload.single(ARCHIVE_FIELD)(req, res, (error) => {
      if (error) {
        sendError(res, error);
        return;
      }
      next();
    });
  }, (req, res) => {
    try {
      if (!req.file) throw httpError(400, 'Archive file required');
      res.json(importZip(req.file.buffer));
    } catch (error) {
      sendError(res, error);
    }
  });
}
