import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile, execFileSync } from 'child_process';
import { NOTES_DIR, ROOT_DIR } from '../config.js';
import { revealSecret } from './secret-store.js';
import { getDb } from '../database.js';
import { httpError, notesRelativePath, readTextFile } from '../utils.js';
import { indexAllFiles } from '../indexing.js';
import { isLockedNote, rememberSession, sealWithSession, sessionFor, unlockContent } from '../note-lock.js';
import { pendingReview, takeKeptForSync } from '../agent-review.js';

export function buildGithubRemoteUrl(repo) {
  return `https://github.com/${repo}.git`;
}

// The token travels in the environment, not in `git -c` arguments: `ps` shows
// every process's arguments to all local users. GIT_CONFIG_COUNT needs git 2.31+.
// core.quotepath=false: without it git prints a name outside ASCII as an escaped, quoted string
// ("\320\237…" for «План.md»), so a note with a Russian name could not be found by its path, its
// conflict could not be opened, and the list of sent files was unreadable.
export function gitEnv(token) {
  const config = [['core.quotepath', 'false']];
  if (token) {
    const credentials = Buffer.from(`x-access-token:${token}`).toString('base64');
    config.push(['http.https://github.com/.extraheader', `AUTHORIZATION: basic ${credentials}`]);
  }
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: String(config.length) };
  config.forEach(([key, value], index) => {
    env[`GIT_CONFIG_KEY_${index}`] = key;
    env[`GIT_CONFIG_VALUE_${index}`] = value;
  });
  return env;
}

function toGitError(error) {
  const stderr = typeof error.stderr === 'string' ? error.stderr.trim() : error.stderr?.toString?.().trim();
  const stdout = typeof error.stdout === 'string' ? error.stdout.trim() : error.stdout?.toString?.().trim();
  const message = [stderr, stdout].filter(Boolean).join('\n') || 'Git command failed';
  const gitError = new Error(message);
  gitError.status = error.status ?? error.code;
  gitError.stderr = stderr || '';
  gitError.stdout = stdout || '';
  return gitError;
}

function gitExec(args, options = {}) {
  const cwd = typeof options === 'string' ? options : options.cwd || NOTES_DIR;
  const token = typeof options === 'string' ? '' : options.token || '';

  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
      env: gitEnv(token),
    }).trim();
  } catch (error) {
    throw toGitError(error);
  }
}

/**
 * The same as gitExec for work that waits on the network (fetch, pull, push). The backend runs inside the app's
 * main process, so a synchronous git call there freezes the window, the terminal and every request for as long as
 * GitHub takes to answer — seconds, on every sync. Anything quick and local stays on gitExec.
 */
function gitExecAsync(args, options = {}) {
  const cwd = options.cwd || NOTES_DIR;
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, encoding: 'utf-8', timeout: 120000, maxBuffer: 64 * 1024 * 1024, env: gitEnv(options.token || '') }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        return reject(toGitError(error));
      }
      resolve(String(stdout).trim());
    });
  });
}

function gitExecBuffer(args, options = {}) {
  const cwd = typeof options === 'string' ? options : options.cwd || NOTES_DIR;
  const token = typeof options === 'string' ? '' : options.token || '';

  try {
    return execFileSync('git', args, {
      cwd,
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: gitEnv(token),
    });
  } catch (error) {
    const stderr = typeof error.stderr === 'string' ? error.stderr.trim() : error.stderr?.toString?.().trim();
    const stdout = typeof error.stdout === 'string' ? error.stdout.trim() : error.stdout?.toString?.().trim();
    const message = [stderr, stdout].filter(Boolean).join('\n') || 'Git command failed';
    const gitError = new Error(message);
    gitError.status = error.status;
    gitError.stderr = stderr || '';
    gitError.stdout = stdout || '';
    throw gitError;
  }
}

function listUnmergedFiles() {
  try {
    return gitExec(['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function hasUnmergedFiles() {
  return listUnmergedFiles().length > 0;
}

/**
 * After a merge stops on conflicts: a note both devices deleted has nothing to choose between, so it is
 * settled here instead of waiting for a person; then the notes that did merge cleanly are indexed, or the
 * board would not show them until the conflict is resolved.
 */
function afterConflictedMerge() {
  for (const filePath of listUnmergedFiles()) {
    const stages = getConflictStages(filePath);
    if (!stages.has(2) && !stages.has(3)) gitExec(['rm', '-q', '--ignore-unmatch', '--', filePath]);
    else keepLockedNoteWhole(filePath, stages);
  }
  if (!hasUnmergedFiles()) {
    try { commitStagedChanges('Merge: notes deleted on both devices'); } catch { /* nothing to commit */ }
  }
  indexAllFiles();
}

function assertSafeGitPath(filePath) {
  if (typeof filePath !== 'string' || !filePath) {
    throw httpError(400, 'Invalid conflict path');
  }

  const normalized = path.posix.normalize(filePath.replace(/\\/g, '/'));
  if (path.isAbsolute(filePath) || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw httpError(400, 'Invalid conflict path');
  }

  return normalized;
}

async function readStoredGitToken() {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('git_token');
    if (!row) return '';

    let stored = row.value;
    try {
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'string') stored = parsed;
    } catch {
      // stored raw, not JSON-quoted
    }
    if (!stored) return '';
    const { value } = await revealSecret(stored);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

const MARKER_LINE = /^(?:<{7}|>{7})(?: |$)|^={7}$/m;

/**
 * Unstage the staged notes whose text still holds merge markers and return their paths. The file on
 * disk is left as it is, so the note can still be resolved in place.
 */
function holdBackNotesWithMarkers() {
  const staged = gitExec(['diff', '--cached', '--name-only', '-z']).split('\0').filter((name) => name.endsWith('.md'));
  const held = staged.filter((name) => {
    try {
      return hasConflictMarkers(fs.readFileSync(path.join(NOTES_DIR, name), 'utf8'));
    } catch {
      return false;
    }
  });
  if (held.length) gitExec(['reset', '-q', '--', ...held]);
  return held;
}

/**
 * Everything this device sends, staged. The agent's edits the person kept go first, in a commit of their own
 * ("Agent edits on Laptop"), so the history on every device says what the agent did. The ones still waiting
 * for review stay behind, and so does a note that still holds merge markers.
 */
function stageForSync(deviceName) {
  const pending = pendingReview();
  const kept = takeKeptForSync().filter((file) => !pending.includes(file));
  if (kept.length) {
    for (const file of kept) {
      try { gitExec(['add', '-A', '--', file]); } catch { /* gone and never tracked */ }
    }
    if (hasStagedChanges()) commitStagedChanges(`Agent edits on ${deviceName || 'Monos'}`);
  }
  gitExec(['add', '-A']);
  if (pending.length) {
    try { gitExec(['reset', '-q', '--', ...pending]); } catch { /* nothing of them staged */ }
  }
  return { held: holdBackNotesWithMarkers(), heldForReview: pending };
}

/**
 * Files the agent changed here that wait for review and that another device changed too. Git would refuse to
 * pull over them ("local changes would be overwritten") with nothing a person can act on; the sync stops before
 * that and names them, so they are kept or reverted first. Empty when nothing waits or the remote cannot be read.
 */
async function reviewBlocksPull(token) {
  const pending = pendingReview();
  if (!pending.length) return [];
  try {
    await gitExecAsync(['fetch', '-q'], { token });
    const incoming = gitExec(['diff', '--name-only', 'HEAD...@{u}']).split('\n').filter(Boolean);
    return incoming.filter((file) => pending.includes(file));
  } catch {
    return [];
  }
}

const reviewBlockedAnswer = (files, extra = {}) => ({
  detail: 'Agent edits wait for review in files that changed on another device too',
  reason: 'agent-review',
  files,
  ...extra,
});

/**
 * Notes whose text holds merge markers without a conflict in git: held back from a sync, left by an older
 * version, or written by the editor when a sync changed an open note in the place it was being edited.
 * They are conflicts to the person all the same, so the board and the sidebar mark them.
 */
function notesWithMarkers() {
  try {
    const unmerged = new Set(listUnmergedFiles());
    return gitExec(['grep', '-l', '--untracked', '-E', '^<{7}( |$)', '--', '*.md', ':!.monos'])
      .split('\n').filter((file) => file && !unmerged.has(file));
  } catch {
    // git grep exits 1 when nothing matches
    return [];
  }
}

/**
 * A locked note's text is one sealed envelope: merging two of them line by line puts markers inside the
 * cipher and leaves a file no passphrase opens. Git keeps both versions as the conflict's sides, so the
 * working file goes back to this device's sealed version, whole and readable; the person then keeps one
 * side, or opens both with the passphrase and merges the plain texts (see /api/git/locked-conflict).
 */
function lockedConflict(filePath, stages = getConflictStages(filePath)) {
  if (!String(filePath).toLowerCase().endsWith('.md')) return false;
  return [1, 2, 3].some((stage) => stages.has(stage) && isLockedNote(readConflictStage(filePath, stage)?.toString('utf-8') || ''));
}

function keepLockedNoteWhole(filePath, stages) {
  if (!lockedConflict(filePath, stages)) return;
  const side = readConflictStage(filePath, stages.has(2) ? 2 : 3);
  if (side) fs.writeFileSync(path.join(NOTES_DIR, filePath), side);
}

/** Whether a text still holds merge markers. */
export function hasConflictMarkers(text) {
  return MARKER_LINE.test(String(text || ''));
}

function mergeInProgress() {
  try {
    gitExec(['rev-parse', '-q', '--verify', 'MERGE_HEAD']);
    return true;
  } catch {
    return false;
  }
}

function commitStagedChanges(message) {
  // A merge is committed even when its result equals this device's version (every conflict resolved
  // "as here"): the commit is what records the other side as merged. Skipped, git keeps MERGE_HEAD and
  // refuses every later pull.
  if (mergeInProgress()) {
    gitExec(['commit', '--no-edit', '-m', message]);
    return;
  }
  try {
    gitExec(['diff', '--cached', '--quiet']);
  } catch {
    gitExec(['commit', '-m', message]);
  }
}

/** A merge whose conflicts are all resolved but that was never committed (an older version left it so). */
function finishResolvedMerge() {
  if (mergeInProgress() && !hasUnmergedFiles()) commitStagedChanges('Resolve conflicts');
}

function hasCommits() {
  try {
    gitExec(['rev-parse', '--verify', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

function isGitRepo() {
  try {
    if (!fs.existsSync(path.join(NOTES_DIR, '.git'))) return false;
    gitExec(['rev-parse', '--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}

async function branchExistsOnRemote(branch, token) {
  try {
    await gitExecAsync(['fetch', 'origin', branch], { token });
    gitExec(['rev-parse', '--verify', `origin/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

function getConflictStages(filePath) {
  const safePath = assertSafeGitPath(filePath);
  const output = gitExec(['ls-files', '-u', '--', safePath]);
  const stages = new Set();

  for (const line of output.split('\n').filter(Boolean)) {
    const match = line.match(/^\d+\s+[0-9a-f]+\s+([123])\t/);
    if (match) stages.add(Number(match[1]));
  }

  return stages;
}

function readConflictStage(filePath, stage) {
  const safePath = assertSafeGitPath(filePath);
  try {
    return gitExecBuffer(['show', `:${stage}:${safePath}`]);
  } catch {
    return null;
  }
}

/**
 * Who wrote each side of a conflicted note, and when: the last commit that touched it on this device
 * (HEAD) and on the other one (MERGE_HEAD). Every device commits under its own name, so the author is
 * the device. Shown as "Phone, today 14:35" instead of "the other version".
 */
function conflictSide(ref, safePath) {
  try {
    const line = gitExec(['log', '-1', '--format=%an%x09%aI', ref, '--', safePath]);
    if (!line) return null;
    const [device, date] = line.split('\t');
    return { device: device && device !== 'Monos' ? device : null, date: date || null };
  } catch {
    return null;
  }
}

/**
 * The latest change to a note made on another device: who and when. A conflict the editor writes itself
 * (a sync changed the note while it was being edited) has no git sides; this names the other one all the
 * same, as "Phone, today 14:35". Null when git has no such change, or this is not a repository.
 *
 * @param {string} notePath path inside the notes folder, with or without `notes/`
 */
export function lastChangeFromAnotherDevice(notePath) {
  if (!isGitRepo()) return null;
  try {
    const gitPath = assertSafeGitPath(String(notePath || '').replace(/^notes\//, ''));
    const self = storedDeviceName();
    const lines = gitExec(['log', '-n', '50', '--no-merges', '--format=%an%x09%aI', 'HEAD', '--', gitPath]).split('\n').filter(Boolean);
    for (const line of lines) {
      const [device, date] = line.split('\t');
      if (device && device !== self && device !== 'Monos') return { device, date: date || null };
    }
  } catch {
    // no history for this path
  }
  return null;
}

/** Both sides of a conflict the editor wrote: this device, now; the other, from the history. */
export function sidesOfWrittenConflict(notePath, modified) {
  return {
    ours: { device: storedDeviceName() || null, date: modified || null },
    theirs: lastChangeFromAnotherDevice(notePath),
  };
}

function isProbablyBinary(buffer) {
  return Buffer.isBuffer(buffer) && buffer.includes(0);
}

function conflictPreview(buffer) {
  if (!buffer) return '';
  if (isProbablyBinary(buffer)) return '[Binary file]';
  const text = buffer.toString('utf-8').replace(/\n$/, '');
  return text.length > 20000 ? `${text.slice(0, 20000)}\n...` : text;
}

/**
 * Copy every version involved in a conflict aside, before anything is written.
 *
 * Resolution must never be the only place a version exists: whichever side the
 * user drops is about to leave the working tree, the index and the next commit
 * at the same time. The archive is local-only and pruned, so it costs nothing
 * to keep and nothing if they never look at it.
 */
function archiveConflictVersions(safePath, stages) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const slug = safePath.replace(/\.md$/i, '').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60);
  const dir = path.join(NOTES_DIR, '.monos', 'conflict-archive', slug);
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const [label, stage] of [['ours', 2], ['theirs', 3], ['base', 1]]) {
      if (!stages.has(stage)) continue;
      const buffer = readConflictStage(safePath, stage);
      if (!buffer || isProbablyBinary(buffer)) continue;
      fs.writeFileSync(path.join(dir, `${stamp}-${label}.md`), buffer);
    }
    pruneConflictArchive(dir);
  } catch {
    // Archiving is best-effort: a failure here must not block resolution.
  }
}

/** Keep the archive small — newest 20 versions, nothing older than 90 days. */
function pruneConflictArchive(dir) {
  try {
    const entries = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().reverse();
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    entries.forEach((name, index) => {
      const full = path.join(dir, name);
      const isOld = fs.statSync(full).mtimeMs < cutoff;
      if (index >= 20 || isOld) fs.rmSync(full, { force: true });
    });
  } catch {
    // nothing to prune
  }
}

/**
 * Choose a side without consulting which device is asking.
 *
 * Two devices can open the same conflict and resolve it at the same moment —
 * each sees its own side as "ours". Picking ours/theirs by position then makes
 * them converge on *different* bytes and overwrite each other forever. Ordering
 * the two sides by a content-derived value means both devices independently
 * produce the identical file, so the conflict settles instead of ping-ponging.
 */
function deterministicSide(safePath, stages) {
  if (!stages.has(2) && !stages.has(3)) return null;
  if (!stages.has(2)) return 3;
  if (!stages.has(3)) return 2;

  const hashOf = (stage) => {
    try {
      return String(gitExec(['rev-parse', `:${stage}:${safePath}`])).trim();
    } catch {
      // Blob may be unhashable in pathological cases; fall back to content.
      const buffer = readConflictStage(safePath, stage);
      return buffer ? crypto.createHash('sha1').update(buffer).digest('hex') : '';
    }
  };

  const ours = hashOf(2);
  const theirs = hashOf(3);
  if (!ours || !theirs) return 2;
  return ours < theirs ? 2 : 3;
}

function resolveConflictPath(filePath, choice) {
  const safePath = assertSafeGitPath(filePath);
  const stages = getConflictStages(safePath);

  // 'auto' is the default: both devices reach the same result independently.
  const stage = choice === 'auto' || !choice
    ? deterministicSide(safePath, stages)
    : (choice === 'ours' ? 2 : 3);

  if (!stage || !stages.has(stage)) {
    // The kept side is the deletion: the edited text is archived first, so removing it loses nothing.
    archiveConflictVersions(safePath, stages);
    gitExec(['rm', '-q', '--ignore-unmatch', '--', safePath]);
    return;
  }

  archiveConflictVersions(safePath, stages);
  gitExec(['checkout', stage === 2 ? '--ours' : '--theirs', '--', safePath]);
  gitExec(['add', '--', safePath]);
}

/**
 * Repository hygiene for a notes folder shared by more than one device.
 *
 * Without `.gitattributes`, a note edited on Windows lands in the working tree
 * as CRLF while macOS keeps LF. Each device then reports the other's files as
 * modified forever, `git add -A` churns empty commits, and a real conflict
 * gets buried under noise. `eol=lf` makes every device agree: LF in the working
 * tree, normalised in the object store.
 *
 * `.gitignore` keeps OS and editor droppings out of the shared history —
 * `.DS_Store`, `._*` AppleDouble files that appear when the folder lands on a
 * non-native volume, and `*~` editor backups. Note that ignoring a file does
 * not untrack one that is already committed; that needs `git rm --cached`.
 */
const GITATTRIBUTES = `# Managed by Monos. Every device checks out LF, whatever the OS.
* text=auto eol=lf

*.md   text eol=lf
*.txt  text eol=lf
*.json text eol=lf

*.png  binary
*.jpg  binary
*.jpeg binary
*.gif  binary
*.webp binary
*.svg  text eol=lf
*.pdf  binary
`;

const GITIGNORE = `# Managed by Monos — OS and editor droppings never enter shared history.
.DS_Store
Thumbs.db
desktop.ini
._*
*~
*.tmp
*.swp
*.swo
.monos/
`;

function writeRepoHygieneFiles() {
  for (const [name, body] of [['.gitattributes', GITATTRIBUTES], ['.gitignore', GITIGNORE]]) {
    const target = path.join(NOTES_DIR, name);
    // Never clobber a file the user wrote by hand.
    if (fs.existsSync(target)) continue;
    fs.writeFileSync(target, body, 'utf-8');
  }
}

/** How many commits this device is ahead / behind the remote branch. */
function divergenceSummary(branch) {
  const counts = { ahead: 0, behind: 0 };
  try {
    const raw = gitExec(['rev-list', '--left-right', '--count', `HEAD...origin/${branch}`]);
    const [behind, ahead] = String(raw).split(/\s+/).map((n) => parseInt(n, 10) || 0);
    counts.ahead = ahead;
    counts.behind = behind;
  } catch {
    // No upstream yet (fresh repo, or first sync) — treat as no divergence.
  }
  return counts;
}

/** Relative paths this device committed in the sync commit. */
function changedFilesSinceHead() {
  try {
    const raw = gitExec(['show', '--name-only', '--pretty=format:', 'HEAD']);
    return String(raw).split('\n').map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function hasUnstagedChanges() {
  try {
    gitExec(['diff', '--quiet']);
    return false;
  } catch {
    return true;
  }
}

function hasStagedChanges() {
  try {
    gitExec(['diff', '--cached', '--quiet']);
    return false;
  } catch {
    return true;
  }
}

// Git work on the notes folder runs one task at a time: the automatic sync and a manual one must not hold the
// index together. A task that arrives while another one runs waits for it.
let gitQueue = Promise.resolve();
function runGitTask(task) {
  const run = gitQueue.then(task);
  gitQueue = run.catch(() => {});
  return run;
}

// The commit this device stands on, or '' before the first commit.
function currentHead() {
  try { return gitExec(['rev-parse', 'HEAD']).trim(); } catch { return ''; }
}

// Commits from the other devices that this device did not have before its pull: the number the person acts on.
// Counted against the remote branch after the pull, so the download is seen even when git fetched it itself.
function arrivedCommits(headBefore, branch) {
  try {
    // Without a configured branch, the one that is checked out is the one git pull works on.
    const name = branch || gitExec(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    const range = headBefore ? headBefore + '..origin/' + name : 'origin/' + name;
    return Number(gitExec(['rev-list', '--count', range]).trim()) || 0;
  } catch {
    return 0;
  }
}

// A setting from Settings, parsed from the JSON it is stored as. Undefined when it was never saved.
function readSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return undefined;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

function readGitSettings() {
  const settingsPath = path.join(ROOT_DIR, '.data', 'git_settings.json');
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeGitSettings(settings) {
  const settingsPath = path.join(ROOT_DIR, '.data', 'git_settings.json');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

async function fetchGithubJson(token, apiPath, { withMeta = false } = {}) {
  // Global fetch rather than a hand-rolled https.get: it honours the proxy and
  // CA environment the rest of the app already relies on, and it is the part
  // tests have to be able to substitute.
  const response = await fetch(`https://api.github.com${apiPath}`, {
    headers: {
      'User-Agent': 'Monos',
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = [];
  }
  // `withMeta` hands back the headers too: GitHub reports the token's granted
  // scopes there, and nowhere else.
  if (withMeta) {
    return { data, status: response.status, headers: Object.fromEntries(response.headers.entries()) };
  }
  return data;
}

/**
 * Scopes worth naming out loud.
 *
 * `repo` is required — it is the one scope Monos genuinely cannot work
 * without. Everything below is not needed to sync notes, and each one widens
 * what a leaked token can reach well past this repository.
 */
const RISKY_SCOPES = {
  workflow: 'can modify CI workflows — a token holder could push code that runs on this account',
  admin: 'full administration rights on repositories and organisations',
  delete_repo: 'can delete repositories',
  gist: 'can create gists outside this app',
};

function scopeWarnings(scopes) {
  const list = String(scopes || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list
    .filter((scope) => RISKY_SCOPES[scope])
    .map((scope) => ({ scope, why: RISKY_SCOPES[scope] }));
}

/**
 * What this computer calls itself, offered as the device's name on first launch: "Alex's MacBook Pro"
 * rather than a host name like `alexs-mbp.local`.
 */
export function suggestedDeviceName() {
  if (process.platform === 'darwin') {
    try {
      const name = execFileSync('scutil', ['--get', 'ComputerName'], { encoding: 'utf-8', timeout: 2000 }).trim();
      if (name) return name.slice(0, 40);
    } catch { /* fall back to the host name */ }
  }
  const host = os.hostname().replace(/\.(local|lan|home)$/i, '').replace(/[-_]+/g, ' ').trim();
  return (host || 'Monos').slice(0, 40);
}

/** A device name as stored: one line, at most 40 characters, nothing that breaks a git identity. */
export function cleanDeviceName(value) {
  return String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
}

/** The name this device signs its commits with: chosen on first launch or in Settings. */
function storedDeviceName() {
  const saved = readSetting('device_name');
  return cleanDeviceName(typeof saved === 'string' ? saved : '') || cleanDeviceName(readGitSettings().device_name);
}

/** Every later commit carries the new name; the commits already made keep the one they were made with. */
function applyDeviceNameToRepo(name) {
  if (!isGitRepo()) return;
  gitExec(['config', 'user.name', name]);
  gitExec(['config', 'user.email', `${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'user'}@monos.local`]);
  const gitSettings = readGitSettings();
  if (gitSettings.repo) writeGitSettings({ ...gitSettings, device_name: name });
}

export function registerGitRoutes(app) {
  // The device's name: what the history and the conflict screens call it ("Phone, today 14:35").
  app.get('/api/device', (_req, res) => {
    try {
      res.json({ name: storedDeviceName(), suggested: suggestedDeviceName() });
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  });

  app.post('/api/device', (req, res) => {
    try {
      const name = cleanDeviceName(req.body?.name);
      if (!name) return res.status(400).json({ detail: 'Device name is required' });
      getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('device_name', name);
      applyDeviceNameToRepo(name);
      res.json({ name });
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  });

  app.post('/api/git/setup', async (req, res) => {
    try {
      const { token, repo, branch, acknowledgePublic } = req.body;
      const device_name = cleanDeviceName(req.body.device_name) || storedDeviceName() || suggestedDeviceName();
      if (!token || !repo || !branch) return res.status(400).json({ detail: 'Missing token, repo, or branch' });

      const remoteUrl = buildGithubRemoteUrl(repo);
      const authToken = token.trim();

      // Refuse to push notes into a public repository unless the caller has
      // explicitly acknowledged it. `git init` + `push` used to run straight
      // through, so a mistyped repo name could publish the whole vault.
      if (acknowledgePublic !== true) {
        const { data, status } = await fetchGithubJson(
          authToken,
          `/repos/${String(repo).trim()}`,
          { withMeta: true },
        );
        if (status === 200 && (data?.private === false || data?.visibility === 'public')) {
          return res.status(409).json({
            detail: 'This repository is public. Notes pushed there become public, and stay in the git history.',
            publicRepo: true,
            repository: data?.full_name || repo,
          });
        }
      }

      if (!isGitRepo()) {
        gitExec(['init']);
        gitExec(['remote', 'add', 'origin', remoteUrl]);
      } else {
        gitExec(['remote', 'set-url', 'origin', remoteUrl]);
      }

      // zdiff3 adds the `|||||||` base section. For prose, seeing the original
      // text is the difference between guessing which side is right and knowing.
      gitExec(['config', 'merge.conflictStyle', 'zdiff3']);
      writeGitSettings({ repo, branch, device_name });
      getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('device_name', device_name);
      applyDeviceNameToRepo(device_name);
      writeRepoHygieneFiles();

      gitExec(['checkout', '-B', branch]);
      gitExec(['add', '-A']);
      commitStagedChanges(`Init from ${device_name || 'Monos'}`);

      const remoteBranchExists = await branchExistsOnRemote(branch, authToken);
      if (remoteBranchExists) {
        gitExec(['branch', '--set-upstream-to', `origin/${branch}`, branch]);
        if (hasCommits()) {
          try {
            gitExec(['merge', '--no-edit', '--allow-unrelated-histories', `origin/${branch}`]);
          } catch (error) {
            const errorText = error.stderr || error.message || '';
            if (errorText.includes('CONFLICT') || hasUnmergedFiles()) {
              afterConflictedMerge();
              return res.json({ message: 'Conflicts detected during setup', conflicts: hasUnmergedFiles() });
            }
            throw error;
          }
        } else {
          gitExec(['checkout', '-B', branch, `origin/${branch}`]);
        }
      }

      await gitExecAsync(['push', '-u', 'origin', branch], { token: authToken });

      // The notes that came down with the repository are on disk now; index them, or a second device
      // shows an empty board until the app restarts.
      indexAllFiles();
      res.json({ message: `Connected to ${repo}/${branch}`, conflicts: false });
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  });

  app.get('/api/git/status', (req, res) => {
    try {
      if (!isGitRepo()) return res.json({ initialized: false });

      const settings = readGitSettings();
      const currentBranch = gitExec(['rev-parse', '--abbrev-ref', 'HEAD']);
      const statusOut = gitExec(['status', '--porcelain']);
      const hasChanges = statusOut.length > 0;
      const hasConflicts = hasUnmergedFiles() || notesWithMarkers().length > 0;
      let ahead = 0;
      let behind = 0;

      try {
        gitExec(['rev-parse', '@{u}']);
        const counts = gitExec(['rev-list', '--left-right', '--count', '@{u}...HEAD']).split('\t');
        behind = parseInt(counts[0]) || 0;
        ahead = parseInt(counts[1]) || 0;
      } catch {}

      res.json({
        initialized: true,
        current_branch: currentBranch,
        branch: currentBranch,
        repo: settings.repo || '',
        hasChanges,
        status: hasConflicts ? 'conflict' : (hasChanges ? 'dirty' : 'clean'),
        ahead,
        behind,
        last_sync: settings.last_sync || null,
      });
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  });

  /**
   * What a repository and a token actually allow, before anything is pushed.
   *
   * A public repository means every note in it becomes public text on GitHub
   * history, permanently. That is not a setting — it is a one-way door, and
   * the old setup path walked through it in silence.
   */
  app.get('/api/git/repo-check', async (req, res) => {
    try {
      const { token, repo } = req.query;
      if (!token || !repo) return res.status(400).json({ detail: 'Token and repo are required' });

      const authToken = String(token).trim();
      const { data, status, headers } = await fetchGithubJson(
        authToken,
        `/repos/${String(repo).trim()}`,
        { withMeta: true },
      );

      if (status === 404) {
        return res.status(404).json({ detail: 'Repository not found or not accessible' });
      }
      if (status === 401) {
        return res.status(401).json({ detail: 'Token rejected by GitHub' });
      }

      const scopes = headers?.['x-oauth-scopes'] || '';
      const isPublic = data?.private === false || data?.visibility === 'public';

      res.json({
        repo: data?.full_name || repo,
        private: data?.private === true,
        visibility: data?.visibility || (data?.private === true ? 'private' : 'public'),
        defaultBranch: data?.default_branch || null,
        scopes: scopes.split(',').map((s) => s.trim()).filter(Boolean),
        scopeWarnings: scopeWarnings(scopes),
        // The one thing the caller must not ignore.
        safe: !isPublic,
      });
    } catch (error) {
      res.status(500).json({ detail: error.message || 'Could not reach GitHub' });
    }
  });

  app.get('/api/git/repos', async (req, res) => {
    try {
      const { token } = req.query;
      if (!token) return res.status(400).json({ detail: 'Token required' });
      const repos = await fetchGithubJson(token, '/user/repos?per_page=100&sort=updated');
      res.json(repos.map((repo) => repo.full_name));
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  });

  app.get('/api/git/branches', async (req, res) => {
    try {
      const { token, repo } = req.query;
      if (!token || !repo) return res.status(400).json({ detail: 'Token and repo required' });
      const branches = await fetchGithubJson(token, `/repos/${repo}/branches?per_page=100`);
      res.json(branches.map((branch) => branch.name));
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  });

  app.get('/api/git/user', async (req, res) => {
    try {
      const { token } = req.query;
      if (!token) return res.status(400).json({ detail: 'Token required' });
      const user = await fetchGithubJson(token, '/user');
      res.json({ login: user.login || 'unknown' });
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  });

  /**
   * Pull only.
   *
   * The one action that should never wait for a human. Committing is the user's
   * decision; making sure the device is not quietly working from a stale copy is
   * not. A device that pulls before editing is what keeps two-device conflicts
   * down to the genuinely overlapping case.
   */
  /**
   * Stage a conflict resolution produced in the note itself.
   *
   * The editor refuses to open a conflicted note, so the resolution is composed
   * there from the raw text — which can mix sides region by region. This writes
   * the result and marks the path resolved, so git can finish the merge. If that
   * was the last conflict, the merge is committed straight away rather than
   * leaving the repository stuck mid-merge.
   */
  /**
   * Opens both sides of a locked note's conflict with its passphrase, for the conflict view to merge.
   * The plain texts go back in this answer only; nothing is written. A side sealed with another passphrase
   * (it was changed on the other device) comes back as null and is named in `unreadable`.
   */
  app.post('/api/git/locked-conflict', (req, res) => {
    try {
      if (!isGitRepo()) return res.status(400).json({ detail: 'Git not initialized' });
      const requestPath = String(req.body?.path || '');
      const passphrase = req.body?.passphrase;
      if (typeof passphrase !== 'string' || !passphrase) return res.status(400).json({ detail: 'Enter the passphrase' });
      const safePath = notesRelativePath(assertSafeGitPath(requestPath));
      const stages = getConflictStages(safePath);
      if (!lockedConflict(safePath, stages)) return res.status(409).json({ detail: 'This note has no locked conflict' });

      const open = (stage) => {
        if (!stages.has(stage)) return { text: '', session: null, readable: true };
        const raw = readConflictStage(safePath, stage)?.toString('utf-8') || '';
        if (!isLockedNote(raw)) return { text: raw, session: null, readable: true };
        try {
          const { plaintext, session } = unlockContent(raw, passphrase);
          return { text: plaintext, session, readable: true };
        } catch {
          return { text: null, session: null, readable: false };
        }
      };
      const [base, ours, theirs] = [open(1), open(2), open(3)];
      if (!ours.readable && !theirs.readable) return res.status(403).json({ detail: 'The passphrase is wrong' });
      // The result is sealed again with this device's key (or the other one's, if only that side opened).
      const session = ours.session || theirs.session;
      if (session) rememberSession(`notes/${safePath}`, session);
      res.json({
        base: base.text ?? '',
        ours: ours.text,
        theirs: theirs.text,
        unreadable: [!ours.readable && 'ours', !theirs.readable && 'theirs'].filter(Boolean),
        sides: { ours: conflictSide('HEAD', safePath), theirs: conflictSide('MERGE_HEAD', safePath) },
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message || String(error) });
    }
  });

  app.post('/api/git/resolve-note', async (req, res) => {
    try {
      if (!isGitRepo()) return res.status(400).json({ detail: 'Git not initialized' });
      const { path: requestPath, content, keep } = req.body || {};
      const safePath = notesRelativePath(assertSafeGitPath(requestPath || ''));
      const absolute = path.join(NOTES_DIR, safePath);

      // One side of the file as a whole, for a conflict that has no text to merge: one device deleted the
      // note and the other changed it. Keeping the deletion removes the file; its text stays in the archive
      // and in the history.
      if (keep === 'ours' || keep === 'theirs') {
        const stages = getConflictStages(safePath);
        if (!stages.size) return res.status(409).json({ detail: 'This note has no unresolved conflict' });
        resolveConflictPath(safePath, keep);
        let mergeCommitted = false;
        if (!hasUnmergedFiles()) {
          try { commitStagedChanges(`Resolve conflict in ${safePath}`); mergeCommitted = true; } catch { /* already recorded */ }
        }
        indexAllFiles();
        return res.json({ message: 'Conflict resolved', resolved: true, removed: !fs.existsSync(absolute), mergeCommitted, remaining: listUnmergedFiles() });
      }

      if (typeof content !== 'string') return res.status(400).json({ detail: 'Content is required' });
      if (!fs.existsSync(absolute)) return res.status(404).json({ detail: 'Note not found' });

      const stages = getConflictStages(safePath);
      if (!stages.has(1) && !stages.has(2) && !stages.has(3)) {
        // Markers left in the text by an earlier merge, with nothing unmerged in git: the choice is an
        // ordinary edit of the file, and the next sync sends it.
        if (hasConflictMarkers(fs.readFileSync(absolute, 'utf8'))) {
          fs.writeFileSync(absolute, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
          indexAllFiles();
          return res.json({ message: 'Markers resolved', resolved: !hasConflictMarkers(content), remaining: [] });
        }
        return res.status(409).json({ detail: 'This note has no unresolved conflict' });
      }

      // A locked note's merged text is sealed again before it touches the disk, and only a full resolution
      // is taken: markers inside a sealed note could not be seen by anything that does not hold its key.
      const locked = lockedConflict(safePath, stages);
      const session = locked ? sessionFor(`notes/${safePath}`) : null;
      if (locked && !session) return res.status(423).json({ detail: 'Open the note with its passphrase first', locked: true });
      if (locked && hasConflictMarkers(content)) return res.status(409).json({ detail: 'Choose a version for every part', partial: true });

      // Keep a copy of everything involved before the working tree is rewritten.
      archiveConflictVersions(safePath, stages);
      const plain = content.endsWith('\n') ? content : `${content}\n`;
      fs.writeFileSync(absolute, locked ? sealWithSession(plain, session) : plain, 'utf8');

      // Some parts are still undecided: keep what was chosen, but leave the note in conflict. Marking it
      // resolved would commit the remaining markers and send them to the other devices as text.
      if (hasConflictMarkers(content)) {
        indexAllFiles();
        return res.json({ message: 'Partially resolved', resolved: false, remaining: listUnmergedFiles() });
      }
      gitExec(['add', '--', safePath]);

      let mergeCommitted = false;
      if (!hasUnmergedFiles()) {
        try {
          commitStagedChanges(`Resolve conflict in ${safePath}`);
          mergeCommitted = true;
        } catch {
          // Nothing staged to commit — the file is already recorded.
        }
      }

      indexAllFiles();
      res.json({ message: 'Conflict resolved', resolved: true, mergeCommitted, remaining: listUnmergedFiles() });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message || String(error) });
    }
  });

  app.post('/api/git/pull', (req, res) => runGitTask(async () => {
    try {
      // An automatic round while Git is not connected is ordinary: a 400 here filled the console every round.
      if (!isGitRepo()) return req.query.auto === '1' ? res.json({ skipped: 'not-connected' }) : res.status(400).json({ detail: 'Git not initialized' });
      if (hasUnmergedFiles()) return res.json({ message: 'Conflicts detected', conflicts: true });
      finishResolvedMerge();

      const authToken = await readStoredGitToken();
      const { branch } = readGitSettings();
      const before = divergenceSummary(branch);

      // With a dirty tree git refuses to merge, so park local work in a commit
      // first and pull after it — the same order the full sync uses.
      const dirtied = hasStagedChanges() || hasUnstagedChanges();
      if (dirtied) {
        stageForSync(storedDeviceName());
        if (hasStagedChanges()) commitStagedChanges('Auto-sync from Monos (pending pull)');
      }

      const blocked = await reviewBlocksPull(authToken);
      if (blocked.length) return res.status(409).json(reviewBlockedAnswer(blocked, { dirtied }));

      const headBefore = currentHead();
      let message = 'Already up to date.';
      try {
        message = await gitExecAsync(['pull', '--no-rebase', '--no-edit'], { token: authToken });
      } catch (error) {
        const errorText = error.stderr || error.message || '';
        if (errorText.includes('CONFLICT') || hasUnmergedFiles()) {
          afterConflictedMerge();
          return res.json({ message: 'Conflicts detected', conflicts: hasUnmergedFiles(), dirtied });
        }
        throw error;
      }

      const after = divergenceSummary(branch);
      if (after.behind !== before.behind || after.ahead !== before.ahead) indexAllFiles();
      writeGitSettings({ ...readGitSettings(), last_pull: new Date().toISOString() });

      res.json({
        message,
        conflicts: false,
        // How many remote commits arrived — the number a user can act on.
        received: arrivedCommits(headBefore, branch),
        dirtied,
        inSync: after.ahead === 0 && after.behind === 0,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message || String(error) });
    }
  }));

  async function syncRoute(req, res) {
    try {
      // An automatic round while Git is not connected is ordinary: a 400 here filled the console every round.
      if (!isGitRepo()) return req.query.auto === '1' ? res.json({ skipped: 'not-connected' }) : res.status(400).json({ detail: 'Git not initialized' });
      // Idempotent: an existing repo adopts the hygiene files on its next sync.
      writeRepoHygieneFiles();
      if (hasUnmergedFiles()) return res.json({ message: 'Conflicts detected', conflicts: true });
      finishResolvedMerge();

      const authToken = await readStoredGitToken();
      const { branch } = readGitSettings();
      const deviceName = storedDeviceName();

      // A note that still holds merge markers is never sent: they would reach the other devices as text.
      // Neither is an agent's edit that waits for review.
      const { held, heldForReview } = stageForSync(deviceName);
      // Naming the device in the message is what makes a shared history
      // readable: "Auto-sync from Monos" on both devices gives you no way to
      // tell whose edit a commit was.
      const committed = hasStagedChanges();
      if (committed) commitStagedChanges(`Auto-sync from ${deviceName || 'Monos'}`);
      const pushedFiles = committed ? changedFilesSinceHead() : [];

      const blocked = await reviewBlocksPull(authToken);
      if (blocked.length) return res.status(409).json(reviewBlockedAnswer(blocked, { committed }));

      const headBeforePull = currentHead();
      let result = 'Synced';
      try {
        result = await gitExecAsync(['pull', '--no-rebase', '--no-edit'], { token: authToken });
      } catch (error) {
        const errorText = error.stderr || error.message || '';
        if (errorText.includes('CONFLICT') || hasUnmergedFiles()) {
          afterConflictedMerge();
          return res.json({
            message: 'Conflicts detected',
            conflicts: hasUnmergedFiles(),
            committed,
            pushed: [],
            device: deviceName || null,
          });
        }
        throw error;
      }

      await gitExecAsync(['push'], { token: authToken });
      const after = divergenceSummary(branch);

      // Reading every note again takes a while and blocks the app for it; only a pull that brought something in
      // changes what the index holds (this device's own edits were indexed as they were saved).
      if (currentHead() !== headBeforePull) indexAllFiles();
      writeGitSettings({ ...readGitSettings(), last_sync: new Date().toISOString() });

      res.json({
        message: result,
        conflicts: false,
        committed,
        // What this device added. With two devices the other one's commits show
        // up as `pulled`, which is the number people actually look for.
        pushed: pushedFiles,
        held,
        heldForReview,
        pulled: arrivedCommits(headBeforePull, branch),
        inSync: after.ahead === 0 && after.behind === 0,
        device: deviceName || null,
      });
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  }

  app.post('/api/git/sync', (req, res) => runGitTask(() => syncRoute(req, res)));

  // Called by the desktop app just before it quits. Nothing is sent unless the person chose it in Settings.
  app.post('/api/git/sync-on-quit', (req, res) => runGitTask(async () => {
    if (readSetting('git_auto_upload_quit') !== true) return res.json({ skipped: 'off' });
    if (!isGitRepo()) return res.json({ skipped: 'not-connected' });
    return syncRoute(req, res);
  }));

  app.get('/api/git/log', async (req, res) => {
    try {
      if (!isGitRepo()) return res.json([]);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
      const log = gitExec(['log', '--oneline', `-${limit}`])
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [hash, ...rest] = line.split(' ');
          return { hash, message: rest.join(' ') };
        });
      res.json(log);
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  });

  /**
   * Every version of one note.
   *
   * The notes folder *is* the repository, so the history of a note already
   * exists and is already versioned. `--follow` keeps the trail when a note was
   * renamed or moved, which is the case that matters most to someone looking
   * for "when did I write this".
   */
  app.get('/api/git/history', async (req, res) => {
    try {
      if (!isGitRepo()) return res.json({ revisions: [], tracked: false });
      const safePath = assertSafeGitPath(req.query.path || '');
      if (!fs.existsSync(path.join(NOTES_DIR, safePath))) {
        return res.status(404).json({ detail: 'Note not found' });
      }
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 200);

      // A new or never-committed note has no history — that is a real answer,
      // not an error, so the UI can say "not synced yet" instead of showing an
      // empty list that looks broken.
      let tracked = true;
      try {
        gitExec(['ls-files', '--error-unmatch', '--', safePath]);
      } catch {
        // git exits non-zero for an untracked path; that is the answer here.
        tracked = false;
      }

      if (!tracked) return res.json({ revisions: [], tracked: false });

      const raw = gitExec([
        'log', `--follow`, `--max-count=${limit}`,
        '--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1f',
        '--', safePath,
      ]);

      const revisions = raw.split('\n').filter(Boolean).map((line) => {
        const [sha, short, author, date, message] = line.split('\u001f');
        return { sha, short, author, date, message };
      });

      res.json({ revisions, tracked: true, path: safePath });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message || String(error) });
    }
  });

  /**
   * What a note looked like at a given commit, and how it differs from now.
   *
   * Returning both the old and the new text lets the UI show a side-by-side
   * without a second request, and lets "restore" be an explicit act rather than
   * a hidden consequence of picking a version.
   */
  app.get('/api/git/history/content', async (req, res) => {
    try {
      if (!isGitRepo()) return res.status(400).json({ detail: 'Git not initialized' });
      const safePath = assertSafeGitPath(req.query.path || '');
      const { sha } = req.query;
      if (!/^[0-9a-f]{7,40}$/.test(String(sha || ''))) {
        return res.status(400).json({ detail: 'Invalid revision' });
      }

      const oldText = gitExecBuffer(['show', `${sha}:${safePath}`])?.toString('utf-8') || '';
      const currentPath = path.join(NOTES_DIR, safePath);
      const currentText = fs.existsSync(currentPath) ? readTextFile(currentPath) : '';
      // Without core.quotePath=false git escapes every non-ASCII byte, so a
      // Russian note name arrives as "\320\237\321\200..." in the diff header —
      // unreadable, and the only line a user reads first.
      const diff = gitExecBuffer(['-c', 'core.quotePath=false', 'diff', '--no-color', '--unified=3', `${sha}`, '--', safePath])
        ?.toString('utf-8') || '';

      res.json({
        sha,
        path: safePath,
        old: oldText,
        current: currentText,
        diff,
        changed: oldText !== currentText,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message || String(error) });
    }
  });

  /**
   * Put a note back the way it was at an earlier commit.
   *
   * Restoring writes the old text to the file and stages it; it never rewrites
   * history, so the act of restoring is itself visible in the next sync.
   */
  app.post('/api/git/history/restore', async (req, res) => {
    try {
      if (!isGitRepo()) return res.status(400).json({ detail: 'Git not initialized' });
      const safePath = assertSafeGitPath(req.body?.path || '');
      const { sha } = req.body || {};
      if (!/^[0-9a-f]{7,40}$/.test(String(sha || ''))) {
        return res.status(400).json({ detail: 'Invalid revision' });
      }

      const restored = gitExecBuffer(['show', `${sha}:${safePath}`])?.toString('utf-8');
      if (restored === undefined || restored === null) {
        throw httpError(404, 'That version of the note is no longer available');
      }

      const absolute = path.join(NOTES_DIR, safePath);
      fs.writeFileSync(absolute, restored, 'utf8');
      gitExec(['add', '--', safePath]);
      indexAllFiles();

      res.json({ message: 'Note restored', path: safePath, sha });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message || String(error) });
    }
  });

  app.get('/api/git/conflicts', async (req, res) => {
    try {
      if (!isGitRepo()) return res.json([]);
      const files = listUnmergedFiles();
      const details = files.map(filePath => {
        const safePath = assertSafeGitPath(filePath);
        const oursBuffer = readConflictStage(safePath, 2);
        const theirsBuffer = readConflictStage(safePath, 3);
        const binary = isProbablyBinary(oursBuffer) || isProbablyBinary(theirsBuffer);
        return {
          path: safePath,
          ours: conflictPreview(oursBuffer),
          theirs: conflictPreview(theirsBuffer),
          oursExists: Boolean(oursBuffer),
          theirsExists: Boolean(theirsBuffer),
          binary,
          raw: binary ? '[Binary file]' : '',
          sides: { ours: conflictSide('HEAD', safePath), theirs: conflictSide('MERGE_HEAD', safePath) },
          locked: lockedConflict(safePath),
        };
      });
      for (const filePath of notesWithMarkers()) {
        let modified = null;
        try { modified = fs.statSync(path.join(NOTES_DIR, filePath)).mtime.toISOString(); } catch { /* gone meanwhile */ }
        details.push({ path: filePath, markers: true, ours: '', theirs: '', oursExists: true, theirsExists: true, binary: false, raw: '', sides: sidesOfWrittenConflict(filePath, modified) });
      }
      res.json(details);
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  });

  // One side of a conflicted file as it is, so an image can be shown as an image when choosing between two.
  app.get('/api/git/conflict-file', (req, res) => {
    try {
      if (!isGitRepo()) return res.status(400).json({ detail: 'Git not initialized' });
      // The conflict list names files relative to the notes folder, as git does.
      const safePath = assertSafeGitPath(String(req.query.path || '').replace(/^notes\//, ''));
      const stage = req.query.side === 'theirs' ? 3 : 2;
      const buffer = readConflictStage(safePath, stage);
      if (!buffer) return res.status(404).json({ detail: 'No such version' });
      const types = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif' };
      const ext = path.extname(safePath).slice(1).toLowerCase();
      res.set('Content-Type', types[ext] || 'application/octet-stream');
      // An SVG from the other device is shown as a picture, never run as a document.
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.set('X-Content-Type-Options', 'nosniff');
      res.send(buffer);
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message || String(error) });
    }
  });

  app.post('/api/git/conflicts/resolve', async (req, res) => {
    try {
      const { files, resolutions } = req.body;
      if (!isGitRepo()) return res.status(400).json({ detail: 'Git not initialized' });
      if (resolutions && typeof resolutions === 'object') {
        for (const [filePath, choice] of Object.entries(resolutions)) {
          // A file with no conflict in git (a note that only holds markers) has no sides to pick here:
          // resolveConflictPath would take "no side" for a deletion and remove the note.
          if (!getConflictStages(filePath).size) continue;
          if (choice === 'ours' || choice === 'theirs' || choice === 'auto') {
            resolveConflictPath(filePath, choice);
          } else {
            gitExec(['add', '--', assertSafeGitPath(filePath)]);
          }
        }
      } else {
        for (const file of (files || [])) gitExec(['add', '--', assertSafeGitPath(file)]);
      }
      // The merge is committed once nothing is left unmerged; until then each choice is staged.
      if (!hasUnmergedFiles()) {
        try { commitStagedChanges('Resolve conflicts'); } catch { /* nothing staged */ }
      }
      indexAllFiles();
      res.json({ message: 'Conflicts resolved' });
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  });
}
