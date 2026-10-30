// Where a new shell starts.
//
// An agent started from a note works in that note's folder, not in the whole notes folder: several agents can
// then work side by side, each in its own place, and none of them is "the" agent of the vault. The page names the
// folder (relative to the notes folder); the shell is the main process's, so the name is checked here: it stays
// inside the notes folder, through links too, and never names a hidden place such as .git.

const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {string} notesRoot absolute path of the notes folder
 * @param {unknown} folder a folder relative to it ('' or nothing for the notes folder itself)
 * @returns {string} the absolute folder to start in; the notes folder when the name is not a folder inside it
 */
function resolveSessionCwd(notesRoot, folder) {
  if (typeof folder !== 'string' || !folder.trim()) return notesRoot;
  const parts = folder.replace(/\\/g, '/').split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '..' || part.startsWith('.') || part.includes('\0'))) return notesRoot;
  try {
    const root = fs.realpathSync(notesRoot);
    const target = fs.realpathSync(path.join(notesRoot, ...parts));
    const inside = target === root || target.startsWith(root + path.sep);
    if (!inside || !fs.statSync(target).isDirectory()) return notesRoot;
    return path.join(notesRoot, ...parts);
  } catch {
    return notesRoot;
  }
}

module.exports = { resolveSessionCwd };
