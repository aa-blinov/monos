/**
 * Decide whether a quick note should be renamed before opening.
 *
 * The Quick Note modal lets the user adjust the auto-generated filename
 * before opening the note. If they kept the default we skip the rename call
 * entirely; if they typed something else we send the new name (with the
 * extension reattached) to the backend.
 *
 * The comparison is done on the bare names (extension stripped) and is
 * case-insensitive so the user doesn't accidentally trigger a rename by
 * toggling the keyboard case.
 *
 * @param {string} currentName the existing filename (with or without extension)
 * @param {string} newName the value typed in the input (with or without extension)
 * @param {string} [extension='.md'] the file extension to normalise to
 * @returns {string|null} the new filename with extension, or null if no rename is needed
 */
export function resolveQuickNoteRename(currentName, newName, extension = '.md') {
  const ext = String(extension || '').toLowerCase();
  const stripExt = (s) => String(s ?? '').trim().replace(new RegExp(`${ext.replace('.', '\\.')}$`, 'i'), '').trim();
  const cur = stripExt(currentName);
  const next = stripExt(newName);

  if (!cur || !next) return null;
  if (cur.toLowerCase() === next.toLowerCase()) return null;

  return `${next}${ext}`;
}
