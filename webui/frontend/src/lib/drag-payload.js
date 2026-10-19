/**
 * The payload a dragged note carries.
 *
 * The file tree is what accepts a drop, so it decides the shape of the payload
 * and the places a drag can start from write it. The strings live here because
 * a second spelling would not throw: the tree falls back to `text/plain` and
 * quietly drops everything but the first note of a multi-note drag.
 */

export const TREE_NOTE_PATHS_DRAG_TYPE = 'application/x-monos-note-paths';

/** Write the dragged notes into a DataTransfer so any folder row can take them. */
export function writeNoteDragPayload(dataTransfer, paths, effectAllowed = 'copyMove') {
  const list = [...new Set((paths || []).filter(Boolean))];
  if (list.length === 0) return;
  dataTransfer.setData('text/plain', list[0]);
  dataTransfer.setData(TREE_NOTE_PATHS_DRAG_TYPE, JSON.stringify(list));
  dataTransfer.effectAllowed = effectAllowed;
}

/** The notes a drop carries. Returns an empty list for a drag that carries nothing of ours. */
export function readNoteDragPayload(dataTransfer, fallbackPath) {
  try {
    const parsed = JSON.parse(dataTransfer.getData(TREE_NOTE_PATHS_DRAG_TYPE) || '[]');
    if (Array.isArray(parsed)) {
      const list = parsed.filter(Boolean);
      if (list.length) return list;
    }
  } catch {
    // A payload written by an older build carries only the plain path.
  }
  return fallbackPath ? [fallbackPath] : [];
}