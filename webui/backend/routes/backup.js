import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import multer from 'multer';
import { NOTES_DIR } from '../config.js';
import { decodeTextBuffer, fileNameProblem, httpError, readTextFile, textFileBuffer } from '../utils.js';
import { getDb } from '../database.js';
import { indexAllFiles } from '../indexing.js';
import { relinkImportedNotes } from '../import-links.js';
import { checkedFolderEntries, folderConfigForExport, setFolderConfig } from '../folder-config.js';
import { sendError } from './helpers.js';
import { uploadError } from '../api-errors.js';

const MAX_ARCHIVE_SIZE = 100 * 1024 * 1024;
// What an archive may unpack to. A few hundred kilobytes of zip can hold a gigabyte of text, so the sizes the archive
// declares are checked before anything is read, and the bytes that come out are checked against them.
const MAX_ENTRIES = 50_000;
const MAX_TEXT_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_FILE_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_REPORTED = 50;
// Where the export keeps the icons and colours of folders; the import reads it back (hidden folders are skipped, so
// the file the app keeps them in is not exported as it is).
export const FOLDER_STYLES_FILE = 'monos-folders.json';
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
    // A Windows drive (`C:/…`) is dropped; a name like `a:b.md` is not a drive and is judged as the name it is.
    .replace(/^[a-zA-Z]:(?=\/)/, '')
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

// Why an entry of the archive cannot be imported, or null. Every folder and the file of the path must be a name the
// system can create; one that cannot is left out of the import and named in its answer.
function entryProblem(relativePath) {
  for (const segment of relativePath.split('/')) {
    const problem = fileNameProblem(segment);
    if (problem) return problem === 'reserved' ? 'reserved' : problem === 'too-long' ? 'too-long' : 'invalid-name';
  }
  return null;
}

function declaredSize(entry) {
  return Number(entry.header?.size ?? 0);
}

function openArchive(buffer) {
  try {
    return new AdmZip(buffer);
  } catch {
    throw httpError(400, 'The file is not a ZIP archive', 'invalid_archive');
  }
}

function folderStylesOf(zip) {
  const entry = zip.getEntry(FOLDER_STYLES_FILE);
  if (!entry || entry.isDirectory || declaredSize(entry) > 1024 * 1024) return {};
  try {
    return checkedFolderEntries(JSON.parse(entry.getData().toString('utf-8'))?.items);
  } catch {
    return {};
  }
}

export function importZip(buffer) {
  const zip = openArchive(buffer);
  const entries = zip.getEntries();
  if (entries.length > MAX_ENTRIES) throw httpError(413, 'The archive holds too many files', 'archive_too_many_files');

  const summary = {
    importedFiles: 0,
    importedNotes: 0,
    importedAttachments: 0,
    skipped: 0,
    renamed: 0,
    relinkedImages: 0,
    unresolvedImages: [],
    invalid: [],
    folderStyles: 0,
  };
  const notesRoot = path.resolve(NOTES_DIR);

  // First everything is looked at and nothing is written: sizes, names, what is in the way.
  const plan = [];
  const planned = new Map();
  let totalBytes = 0;
  const reject = (name, reason) => {
    summary.skipped += 1;
    if (summary.invalid.length < MAX_REPORTED) summary.invalid.push({ name: String(name).slice(0, 200), reason });
  };
  for (const entry of entries) {
    const relativePath = normalizeArchivePath(entry.entryName);
    if (!relativePath) {
      summary.skipped += 1;
      continue;
    }
    if (entry.isDirectory) {
      const problem = entryProblem(relativePath);
      if (problem) reject(entry.entryName, problem);
      else plan.push({ entry, relativePath, directory: true });
      continue;
    }
    if (!isImportableFile(relativePath)) {
      summary.skipped += 1;
      continue;
    }
    const problem = entryProblem(relativePath);
    if (problem) {
      reject(entry.entryName, problem);
      continue;
    }
    const isText = TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
    const size = declaredSize(entry);
    if (size > (isText ? MAX_TEXT_ENTRY_BYTES : MAX_FILE_ENTRY_BYTES)) {
      throw httpError(413, `A file in the archive is too large: ${relativePath.slice(0, 120)}`, 'archive_entry_too_large');
    }
    totalBytes += size;
    if (totalBytes > MAX_TOTAL_BYTES) throw httpError(413, 'The archive unpacks to too much data', 'archive_too_large');
    // A file in the way of a folder the archive needs: an entry `Welcome.md/inner.md` beside a note `Welcome.md`.
    const parents = relativePath.split('/').slice(0, -1).map((_, index, all) => all.slice(0, index + 1).join('/'));
    const blocked = parents.some((parent) => {
      if (planned.get(parent) === 'file') return true;
      try { return !fs.statSync(path.join(notesRoot, parent)).isDirectory(); } catch { return false; }
    });
    if (blocked || planned.get(relativePath) === 'dir') {
      reject(entry.entryName, 'file-in-the-way');
      continue;
    }
    planned.set(relativePath, 'file');
    for (const parent of parents) planned.set(parent, 'dir');
    plan.push({ entry, relativePath, isText, size });
  }

  if (!plan.some((item) => !item.directory)) {
    throw httpError(400, 'Archive does not contain supported note files', 'archive_empty');
  }

  // Then it is written, and a failure on the way takes back what was written: an import is all of it or none of it.
  const importedNotePaths = [];
  const importedFiles = new Map();
  const written = [];
  const madeFolders = [];
  const makeFolder = (dir) => {
    const missing = [];
    for (let current = path.resolve(dir); current !== notesRoot && !fs.existsSync(current); current = path.dirname(current)) missing.push(current);
    fs.mkdirSync(dir, { recursive: true });
    madeFolders.push(...missing);
  };
  try {
    for (const item of plan) {
      const targetPath = resolveInsideNotes(item.relativePath);
      if (item.directory) {
        makeFolder(targetPath);
        continue;
      }
      const finalPath = uniqueTargetPath(targetPath);
      makeFolder(path.dirname(finalPath));
      let entryData;
      try {
        entryData = item.entry.getData();
      } catch {
        throw httpError(400, 'The archive is damaged', 'invalid_archive');
      }
      // The archive's own header said how big this is; what actually came out must not be more.
      if (entryData.length > item.size) throw httpError(400, 'The archive is damaged', 'invalid_archive');
      const ext = path.extname(finalPath).toLowerCase();
      fs.writeFileSync(finalPath, TEXT_EXTENSIONS.has(ext) ? normalizeTextFileBuffer(entryData) : entryData);
      written.push(finalPath);

      summary.importedFiles += 1;
      if (TEXT_EXTENSIONS.has(ext)) {
        summary.importedNotes += 1;
        importedNotePaths.push(finalPath);
      } else {
        summary.importedAttachments += 1;
        importedFiles.set(item.relativePath, finalPath);
      }
      if (finalPath !== targetPath) summary.renamed += 1;
    }
  } catch (error) {
    for (const file of written) { try { fs.unlinkSync(file); } catch { /* already gone */ } }
    for (const folder of madeFolders.reverse()) { try { fs.rmdirSync(folder); } catch { /* not empty or gone */ } }
    throw error;
  }

  // Links to pictures and files are found again in the new layout (see import-links.js).
  try {
    const links = relinkImportedNotes({ notesRoot, notes: importedNotePaths, files: importedFiles });
    summary.relinkedImages = links.relinked;
    summary.unresolvedImages = links.unresolved.slice(0, 50);
  } catch (error) {
    // The notes are in; only the link repair failed. Say so rather than fail the whole import.
    console.error('Relinking imported attachments failed:', error);
  }

  indexAllFiles();

  // The icons and colours the archive carried: given to the folders that are there now and have none yet.
  try {
    const db = getDb();
    const have = folderConfigForExport(db);
    for (const [relative, style] of Object.entries(folderStylesOf(zip))) {
      if (have[relative] || !fs.existsSync(path.join(notesRoot, relative))) continue;
      setFolderConfig(db, `notes/${relative}`, style);
      summary.folderStyles += 1;
    }
  } catch (error) {
    console.error('Folder icons and colours of the archive were not applied:', error);
  }
  return summary;
}

export function registerBackupRoutes(app) {
  app.get('/api/backup/export', (req, res) => {
    try {
      const zip = new AdmZip();
      const exportedFiles = addDirectoryToArchive(zip, NOTES_DIR);
      // The icons and colours of folders are kept in a hidden file of the app, so they travel in a visible one.
      const styles = folderConfigForExport(getDb());
      if (Object.keys(styles).length > 0) {
        zip.addFile(FOLDER_STYLES_FILE, Buffer.from(`${JSON.stringify({ version: 1, items: styles }, null, 2)}\n`, 'utf-8'));
      }
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
        sendError(res, uploadError(error));
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
