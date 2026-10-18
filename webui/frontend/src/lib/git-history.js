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
/**
 * A version's title in the interface language. Commit messages are written in English on every device (a
 * history shared by devices set to different languages has to pick one), so the known ones are named here;
 * the device is already on the line under the title.
 *
 * @param {string} message
 * @param {{ synced: string, savedBeforePull: string, connected: string, resolved: string, merged: string, agent: string }} words
 */
export function revisionTitle(message, words) {
  const text = String(message || '').trim();
  if (/^Auto-sync from .+ \(pending pull\)$/.test(text)) return words.savedBeforePull;
  if (/^Auto-sync from /.test(text)) return words.synced;
  if (/^Init from /.test(text)) return words.connected;
  if (/^Agent edits on /.test(text)) return words.agent;
  if (/^Resolve conflicts?\b/.test(text)) return words.resolved;
  if (/^Merge\b/.test(text)) return words.merged;
  return text;
}


/**
 * Revisions (newest first) cut into days for the timeline: `{ key, date, revisions }` per calendar day in the
 * reader's time zone, in the order they arrive. `date` is the day's first revision, for labelling.
 */
export function groupRevisionsByDay(revisions) {
  const groups = [];
  for (const revision of revisions || []) {
    const when = new Date(revision.date);
    const key = `${when.getFullYear()}-${when.getMonth()}-${when.getDate()}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) last.revisions.push(revision);
    else groups.push({ key, date: revision.date, revisions: [revision] });
  }
  return groups;
}

/** 'today' | 'yesterday' | null for the day of `date` against `now`. */
export function relativeDay(date, now = new Date()) {
  const day = (value) => { const d = new Date(value); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const diff = Math.round((day(now) - day(date)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return null;
}
