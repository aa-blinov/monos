import path from 'path';
import { notesMentioning, updateNotes } from './link-rename.js';
import { replaceOutsideCode, resolveNotesPath } from './utils.js';

// The two forms the editor writes for an image: `![alt](_attachments/name.png)`, and the
// `![[name.png]]` embed, which means the note's own _attachments folder.
const IMAGE_REFERENCE = /!\[([^\]]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g;
const EMBED_REFERENCE = /!\[\[([^\]|#\n]+?)\]\]/g;

/**
 * Points every image reference in one note's text at `newFullPath`. A reference that resolves
 * to another file stays as it is, and so does anything inside code.
 */
export function rewriteAttachmentText(text, { noteDir, oldFullPath, newFullPath }) {
  const oldAbsolute = path.resolve(oldFullPath);
  const relative = path.relative(noteDir, newFullPath).split(path.sep).join('/');
  const markdown = replaceOutsideCode(text, IMAGE_REFERENCE, (whole, alt, url, title) => {
    if (/^(https?:|data:)/i.test(url)) return null;
    let decoded = url;
    try {
      decoded = decodeURI(url);
    } catch {
      // A malformed escape is still a path we can try as written.
    }
    if (path.resolve(noteDir, decoded) !== oldAbsolute) return null;
    return `![${alt}](${url.includes('%') ? encodeURI(relative) : relative}${title})`;
  });
  const embeds = replaceOutsideCode(markdown.content, EMBED_REFERENCE, (whole, target) => {
    if (path.resolve(noteDir, '_attachments', target) !== oldAbsolute) return null;
    return `![[${path.basename(newFullPath)}]]`;
  });
  return { content: embeds.content, count: markdown.count + embeds.count };
}

/** After an attachment file is renamed, points the notes that show it at the new file. */
export function rewriteAttachmentReferences({ oldFullPath, newFullPath }) {
  return updateNotes(notesMentioning(path.basename(oldFullPath)), (text, notePath) => rewriteAttachmentText(text, {
    noteDir: path.dirname(resolveNotesPath(notePath)),
    oldFullPath,
    newFullPath,
  }));
}
