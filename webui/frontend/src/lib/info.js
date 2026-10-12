/**
 * Facts about this installation that the interface should not invent.
 *
 * Showing the real notes folder is the point: the app's promise is that the
 * notes are ordinary files on the user's disk, so the path belongs on screen
 * rather than behind a menu.
 */
export async function fetchNotesDir() {
  const response = await fetch('/api/info');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
  return data.notesDir;
}
