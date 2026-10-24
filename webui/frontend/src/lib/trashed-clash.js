// Renaming or moving a note into a name that a note in the Trash holds is refused with 409 and `code: 'trashed'`.
// It is a different answer from "a note of that name exists": the way forward is the Trash, not a number after the name.
export function isTrashedNameClash(error) {
  return error?.status === 409 && error?.body?.code === 'trashed';
}

// The place the trashed note rests: the trash lists a note by the path it was deleted from, which is where the new name points.
export function clashPath(path, newName) {
  const parts = String(path || '').split('/');
  parts[parts.length - 1] = newName;
  return parts.join('/');
}
