import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { resolveNotesPath, httpError } from './utils.js';

const ATTACHMENTS_DIR = '_attachments';

/**
 * Files of the note's own `_attachments` folder that its text points at: `](_attachments/a.png)`,
 * `src="_attachments/a.png"` (percent-encoded or not) and `![[a.pdf]]` embeds.
 * @returns {string[]} file names inside the folder, each once
 */
export function referencedAttachments(content, attachmentsDir) {
  if (!fs.existsSync(attachmentsDir)) return [];
  const text = String(content || '');
  const names = new Set();
  for (const match of text.matchAll(/_attachments\/([^)"'\s<>\]]+)/g)) {
    try { names.add(decodeURIComponent(match[1])); } catch { names.add(match[1]); }
  }
  for (const match of text.matchAll(/!?\[\[([^\]|#]+?)(?:[|#][^\]]*)?\]\]/g)) names.add(match[1].trim());
  return [...names].filter((name) => {
    if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.')) return false;
    const full = path.join(attachmentsDir, name);
    return fs.existsSync(full) && fs.statSync(full).isFile();
  });
}

/**
 * The exported note with its attachments, as one zip that unpacks into a folder:
 * `source` is the note's Markdown, which the links are read from (the text export has none left). `<file>` beside `_attachments/…`, so relative links keep working. Null when the note has none.
 */
export function buildExportBundle(notePath, fileName, content, source = content) {
  const noteFull = resolveNotesPath(notePath);
  const dir = path.join(path.dirname(noteFull), ATTACHMENTS_DIR);
  const files = referencedAttachments(source, dir);
  if (files.length === 0) return null;
  const safeName = path.basename(String(fileName || '')).replace(/[\\/\u0000-\u001f]/g, '_');
  if (!safeName) throw httpError(400, 'File name required');
  const folder = safeName.replace(/\.[^.]+$/, '') || 'note';
  const zip = new AdmZip();
  zip.addFile(`${folder}/${safeName}`, Buffer.from(String(content || ''), 'utf8'));
  for (const name of files) zip.addLocalFile(path.join(dir, name), `${folder}/${ATTACHMENTS_DIR}`);
  return { buffer: zip.toBuffer(), fileName: `${folder}.zip` };
}
