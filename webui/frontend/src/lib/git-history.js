/**
 * Note history, served by git.
 *
 * The notes folder is the repository, so this is a read of versions that already
 * exist rather than a second store of snapshots.
 */

async function readJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
  return data;
}

/**
 * Every recorded version of one note, newest first.
 * @param {string} notePath path relative to the notes folder
 * @returns {Promise<{revisions: Array, tracked: boolean}>}
 */
export async function noteHistoryRequest(notePath) {
  return readJson(`/api/git/history?path=${encodeURIComponent(notePath || '')}`);
}

/**
 * One version's text plus its diff against the note as it stands now.
 * @param {string} notePath
 * @param {string} sha
 */
export async function noteRevisionRequest(notePath, sha) {
  const query = `path=${encodeURIComponent(notePath || '')}&sha=${encodeURIComponent(sha)}`;
  return readJson(`/api/git/history/content?${query}`);
}

/**
 * Put the note back the way it was at a commit. History is not rewritten; the
 * restore is staged and shows up in the next sync.
 */
export async function restoreNoteRevisionRequest(notePath, sha) {
  return readJson('/api/git/history/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: notePath, sha }),
  });
}