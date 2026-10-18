import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { resolveNotesPath, httpError } from './utils.js';

const ATTACHMENTS_DIR = '_attachments';
// One export is built in memory: past these limits it is refused instead of freezing the app.
export const MAX_BUNDLE_FILES = 200;
export const MAX_BUNDLE_BYTES = 100 * 1024 * 1024;
export const MAX_BUNDLE_TEXT = 4 * 1024 * 1024;

/**
 * Files of the note's own `_attachments` folder that its text points at: `](_attachments/a.png)`,
 * `src="_attachments/a.png"` (percent-encoded or not) and `![[a.pdf]]` embeds.
 * @returns {string[]} file names inside the folder, each once
 */
export function referencedAttachments(content, attachmentsDir) {
  if (!fs.existsSync(attachmentsDir)) return [];
  const text = String(content || '');
  const names = new Set();
  for (const match of text.matchAll(/(?<![A-Za-z0-9_])_attachments\/([^)"'\s<>\]]+)/g)) {
    try { names.add(decodeURIComponent(match[1])); } catch { names.add(match[1]); }
  }
  for (const match of text.matchAll(/!?\[\[([^\][|#\n]{1,255})/g)) names.add(match[1].trim());
  let realDir;
  try { realDir = fs.realpathSync(attachmentsDir); } catch { return []; }
  return [...names].filter((name) => {
    if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.')) return false;
    const full = path.join(attachmentsDir, name);
    try {
      // A link planted in the folder must not carry a file from elsewhere into the export.
      if (!fs.lstatSync(full).isFile()) return false;
      return fs.realpathSync(full).startsWith(realDir + path.sep);
    } catch {
      return false;
    }
  });
}

/**
 * The exported note with its attachments, as one zip that unpacks into a folder:
 * `source` is the note's Markdown, which the links are read from (the text export has none left). `<file>` beside `_attachments/…`, so relative links keep working. Null when the note has none.
 */
export function buildExportBundle(notePath, fileName, content, source = content) {
  if (String(content || '').length > MAX_BUNDLE_TEXT || String(source || '').length > MAX_BUNDLE_TEXT) {
    throw httpError(413, 'The note is too large to export with its files');
  }
  const noteFull = resolveNotesPath(notePath);
  if (!fs.existsSync(noteFull) || fs.statSync(noteFull).isDirectory()) throw httpError(404, 'Note not found');
  const dir = path.join(path.dirname(noteFull), ATTACHMENTS_DIR);
  const files = referencedAttachments(source, dir);
  if (files.length === 0) return null;
  if (files.length > MAX_BUNDLE_FILES) throw httpError(413, 'Too many attached files to export together');
  const total = files.reduce((sum, name) => sum + fs.statSync(path.join(dir, name)).size, 0);
  if (total > MAX_BUNDLE_BYTES) throw httpError(413, 'The attached files are too large to export together');
  const safeName = path.basename(String(fileName || '')).replace(/[\\/\u0000-\u001f]/g, '_');
  if (!safeName || /^\.+$/.test(safeName)) throw httpError(400, 'File name required');
  const folder = safeName.replace(/\.[^.]+$/, '') || 'note';
  const zip = new AdmZip();
  zip.addFile(`${folder}/${safeName}`, Buffer.from(String(content || ''), 'utf8'));
  for (const name of files) zip.addLocalFile(path.join(dir, name), `${folder}/${ATTACHMENTS_DIR}`);
  return { buffer: zip.toBuffer(), fileName: `${folder}.zip` };
}
