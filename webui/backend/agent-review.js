import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { NOTES_DIR } from './config.js';

// Review of what an agent changed. When the agent starts, Monos takes a checkpoint of the notes folder; every
// file changed outside Monos after that (the watcher reports them) waits for review: keep it, or put it back
// as it was at the checkpoint. Kept edits go to the other devices in a commit of their own ("Agent edits");
// the ones still waiting are held back from the sync.
//
// Checkpoints live in a private repository of Monos, .monos/checkpoints.git, with the notes folder as its work
// tree: it works without GitHub, never touches the person's own .git, and stores a file that did not change
// only once.

const MONOS_DIR = () => path.join(NOTES_DIR, '.monos');
const GIT_DIR = () => path.join(MONOS_DIR(), 'checkpoints.git');
const STATE_FILE = () => path.join(MONOS_DIR(), 'agent-review.json');

function git(args, options = {}) {
  return execFileSync('git', [
    '-c', 'core.quotepath=false', '-c', 'core.autocrlf=false', '-c', 'user.name=Monos', '-c', 'user.email=monos@localhost',
    '--git-dir', GIT_DIR(), '--work-tree', NOTES_DIR, ...args,
  ], { encoding: options.buffer ? undefined : 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function readState() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
    return { checkpoint: state.checkpoint || null, touched: [...new Set(state.touched || [])], kept: [...new Set(state.kept || [])] };
  } catch {
    return { checkpoint: null, touched: [], kept: [] };
  }
}

function writeState(state) {
  fs.mkdirSync(MONOS_DIR(), { recursive: true });
  fs.writeFileSync(STATE_FILE(), JSON.stringify(state, null, 2), 'utf8');
}

function ensureRepo() {
  if (fs.existsSync(path.join(GIT_DIR(), 'HEAD'))) return;
  fs.mkdirSync(MONOS_DIR(), { recursive: true });
  execFileSync('git', ['init', '-q', '--bare', GIT_DIR()], { stdio: 'ignore' });
  // The person's repository, Monos's own files and the agent's rule files are not part of a checkpoint.
  fs.mkdirSync(path.join(GIT_DIR(), 'info'), { recursive: true });
  fs.writeFileSync(path.join(GIT_DIR(), 'info', 'exclude'), '.git/\n.monos/\n.DS_Store\n', 'utf8');
}

/** A snapshot of the whole notes folder as it is now. */
function snapshot() {
  ensureRepo();
  git(['add', '-A']);
  git(['commit', '-q', '--allow-empty', '-m', 'checkpoint']);
  return git(['rev-parse', 'HEAD']).trim();
}

/** The checkpoint review compares against, taken now if there is none (the terminal opened, the agent starts). */
export function ensureCheckpoint() {
  const state = readState();
  if (state.checkpoint) return state;
  try {
    state.checkpoint = snapshot();
    state.touched = [];
    writeState(state);
  } catch {
    // No git on this computer: changes are not tracked for review, everything else works.
  }
  return state;
}

const relative = (notePath) => String(notePath).replace(/^notes\//, '');

/** Files changed outside Monos since the checkpoint (the watcher calls this). Untracked while there is none. */
export function recordOutsideChanges(notePaths) {
  const state = readState();
  if (!state.checkpoint) return false;
  const before = state.touched.length;
  state.touched = [...new Set([...state.touched, ...notePaths.map(relative)])];
  if (state.touched.length === before) return false;
  writeState(state);
  return true;
}

function inCheckpoint(sha, file) {
  try {
    git(['cat-file', '-e', `${sha}:${file}`]);
    return true;
  } catch {
    return false;
  }
}

function changeOf(state, file) {
  const existsNow = fs.existsSync(path.join(NOTES_DIR, file));
  const existedBefore = inCheckpoint(state.checkpoint, file);
  if (!existsNow && !existedBefore) return null;
  if (existsNow && existedBefore) {
    const before = git(['show', `${state.checkpoint}:${file}`], { buffer: true });
    const now = fs.readFileSync(path.join(NOTES_DIR, file));
    if (Buffer.compare(before, now) === 0) return null; // changed and changed back
  }
  return { path: `notes/${file}`, status: !existedBefore ? 'added' : !existsNow ? 'deleted' : 'modified' };
}

/** What waits for review: each file the agent changed, and how. Files that ended up unchanged drop out. */
export function reviewList() {
  const state = readState();
  if (!state.checkpoint) return { checkpoint: null, changes: [] };
  const changes = [];
  const still = [];
  for (const file of state.touched) {
    const change = changeOf(state, file);
    if (change) {
      changes.push(change);
      still.push(file);
    }
  }
  if (still.length !== state.touched.length) {
    state.touched = still;
    writeState(state);
  }
  return { checkpoint: state.checkpoint, changes };
}

/** The unified diff of one file against the checkpoint. */
export function reviewDiff(notePath) {
  const state = readState();
  const file = relative(notePath);
  if (!state.checkpoint || !state.touched.includes(file)) return '';
  // Staged in Monos's private index only, so a new file shows as added.
  git(['add', '-A', '--', file]);
  return git(['diff', '--cached', state.checkpoint, '--', file]);
}

function settle(state) {
  // Once nothing waits, the baseline moves to now: the next changes are compared with what was kept.
  if (state.touched.length === 0) {
    try { state.checkpoint = snapshot(); } catch { state.checkpoint = null; }
  }
  writeState(state);
}

/** Keep the agent's version: it leaves the review and goes to the other devices with the next sync. */
export function keepChange(notePaths) {
  const state = readState();
  const files = notePaths.map(relative);
  state.touched = state.touched.filter((file) => !files.includes(file));
  state.kept = [...new Set([...state.kept, ...files])];
  settle(state);
}

/** Put the file back as it was at the checkpoint: its old text, or no file if the agent created it. */
export function revertChange(notePaths) {
  const state = readState();
  if (!state.checkpoint) return;
  for (const file of notePaths.map(relative)) {
    const full = path.join(NOTES_DIR, file);
    if (!path.resolve(full).startsWith(path.resolve(NOTES_DIR) + path.sep)) continue;
    if (inCheckpoint(state.checkpoint, file)) {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, git(['show', `${state.checkpoint}:${file}`], { buffer: true }));
    } else {
      fs.rmSync(full, { force: true });
    }
    state.touched = state.touched.filter((item) => item !== file);
  }
  settle(state);
}

/** Paths still waiting for review (held back from a sync), relative to the notes folder. */
export function pendingReview() {
  return readState().touched;
}

/** Paths kept since the last sync (committed apart as the agent's edits); taking them clears the list. */
export function takeKeptForSync() {
  const state = readState();
  const kept = state.kept;
  if (kept.length) {
    state.kept = [];
    writeState(state);
  }
  return kept;
}
