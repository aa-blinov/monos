/** True if `itemPath` equals `parentPath` or is nested below it. */
export function isSameOrDescendant(itemPath, parentPath) {
  return itemPath === parentPath || itemPath.startsWith(`${parentPath}/`);
}

/** Last segment of a `/`-separated path. */
export function basename(itemPath) {
  return itemPath.split('/').filter(Boolean).at(-1) || itemPath;
}

/** All segments except the last. Empty string for top-level. */
export function parentPath(itemPath) {
  const parts = String(itemPath || '').split('/').filter(Boolean);
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/');
}

/** Strip the `.md` extension from a note name. */
export function displayNoteName(name = '') {
  return name.replace(/\.md$/i, '');
}

/** Strip `.md` from a file name (directories pass through unchanged). */
export function renameInputName(name = '', isDir = false) {
  return isDir ? name : displayNoteName(name);
}

/** Last `.xxx` segment, or '' if no extension. */
export function fileExtension(name = '') {
  const match = String(name || '').match(/(\.[^.]*)$/);
  return match ? match[1] : '';
}

/** Re-prefix `itemPath` from `oldPrefix` to `newPrefix`. */
export function replacePathPrefix(itemPath, oldPrefix, newPrefix) {
  if (itemPath === oldPrefix) return newPrefix;
  if (itemPath.startsWith(`${oldPrefix}/`)) {
    return `${newPrefix}${itemPath.slice(oldPrefix.length)}`;
  }
  return itemPath;
}
