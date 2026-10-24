import fs from 'fs';
import path from 'path';
import { NOTES_DIR } from './config.js';
import { getDb } from './database.js';
import { indexPaths } from './indexing.js';
import { isAgentRuleFile } from './agent-rules.js';
import { recordOutsideChanges } from './agent-review.js';
import { SIDECAR_SUFFIX, TRASH_NAME } from './trash-store.js';

// Files in the notes folder change without Monos: an agent in the terminal, another editor, a script.
// The folder is watched, and a change Monos did not make itself is indexed and announced to the open pages
// (GET /api/events), so the board, the tree and an open note follow at once. Monos's own writes are told
// apart by the index: a route indexes the file right after writing it, so the file's time matches the
// index; anything else does not.
const IGNORED = /^(\.git|\.monos|\.data|node_modules)(\/|$)/;
const SETTLE_MS = 300;

let watcher = null;
let timer = null;
const pending = new Set();
const clients = new Set();

function changedOutside(relative) {
  const full = path.join(NOTES_DIR, relative);
  const row = getDb().prepare('SELECT modified_at, is_dir FROM notes_index WHERE path = ?').get(`notes/${relative}`);
  let stat = null;
  try { stat = fs.statSync(full); } catch { /* removed */ }
  if (!stat) return Boolean(row);
  // A folder made inside the trash is the app's own doing (a note or a folder was deleted into it).
  if (stat.isDirectory() && relative.startsWith(`${TRASH_NAME}/`)) return false;
  if (!row) return true;
  if (stat.isDirectory()) return false;
  return stat.mtime.toISOString() !== row.modified_at;
}

function flush() {
  try {
    const paths = [...pending];
    pending.clear();
    let outside;
    try {
      outside = paths.filter(changedOutside);
    } catch {
      return; // the database is closing
    }
    if (!outside.length) return;
    // Only what changed: reading every note again for each file an agent writes was seconds on a big vault.
    indexPaths(outside.map((relative) => path.join(NOTES_DIR, relative)));
    const notePaths = outside.map((relative) => `notes/${relative}`);
    broadcast({ type: 'files', paths: notePaths });
    // Changed outside Monos while an agent session is open: they wait for review (agent-review.js).
    // Moving a note to the trash (or back) is the app's own doing, not an edit to review.
    const files = outside.filter((relative) => {
      if (relative === TRASH_NAME || relative.startsWith(`${TRASH_NAME}/`)) return false;
      try { return !fs.statSync(path.join(NOTES_DIR, relative)).isDirectory(); } catch { return true; }
    });
    if (files.length && recordOutsideChanges(files.map((relative) => `notes/${relative}`))) broadcast({ type: 'agent-review' });
  } catch (error) {
    // This runs from a timer, where nothing catches: a lock held by another backend on the same vault would end the app.
    console.error('Could not index files changed outside Monos; the app keeps running:', error);
  }
}

export function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(line);
}

export function startNotesWatcher() {
  if (watcher) return;
  try {
    watcher = fs.watch(NOTES_DIR, { recursive: true }, (_type, name) => {
      if (!name) return;
      const relative = String(name).replace(/\\/g, '/');
      if (IGNORED.test(relative) || path.basename(relative).startsWith('.')) return;
      // The file that says where a trashed note came from changes only together with the note, which is the one to read.
      if (relative.endsWith(SIDECAR_SUFFIX)) return;
      if (isAgentRuleFile(path.join(NOTES_DIR, relative))) return;
      pending.add(relative);
      clearTimeout(timer);
      timer = setTimeout(flush, SETTLE_MS);
    });
    watcher.on('error', () => stopNotesWatcher());
  } catch {
    watcher = null; // a folder that cannot be watched only loses live updates
  }
}

export function stopNotesWatcher() {
  clearTimeout(timer);
  pending.clear();
  watcher?.close();
  watcher = null;
  for (const res of clients) res.end();
  clients.clear();
}

/** GET /api/events: a stream of `{ type: 'files', paths }` for changes made outside Monos. */
export function registerEventRoutes(app) {
  app.get('/api/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders?.();
    res.write(': connected\n\n');
    clients.add(res);
    // A comment now and then keeps proxies and sleeping laptops from dropping a quiet stream.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
    });
  });
}
