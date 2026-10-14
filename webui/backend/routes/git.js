import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { NOTES_DIR, ROOT_DIR } from '../config.js';
import { revealSecret } from './secret-store.js';
import { getDb } from '../database.js';
import { httpError, notesRelativePath, readTextFile } from '../utils.js';
import { indexAllFiles } from '../indexing.js';

export function buildGithubRemoteUrl(repo) {
  return `https://github.com/${repo}.git`;
}

// The token travels in the environment, not in `git -c` arguments: `ps` shows
// every process's arguments to all local users. GIT_CONFIG_COUNT needs git 2.31+.
export function gitEnv(token) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  if (!token) return env;
  const credentials = Buffer.from(`x-access-token:${token}`).toString('base64');
  return {
    ...env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${credentials}`,
  };
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

function commitStagedChanges(message) {
  try {
    gitExec(['diff', '--cached', '--quiet']);
  } catch {
    gitExec(['commit', '-m', message]);
  }
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

function branchExistsOnRemote(branch, token) {
  try {
    gitExec(['fetch', 'origin', branch], { token });
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
    gitExec(['rm', '--ignore-unmatch', '--', safePath]);
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

export function registerGitRoutes(app) {
  app.post('/api/git/setup', async (req, res) => {
    try {
      const { token, repo, branch, device_name, acknowledgePublic } = req.body;
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

      gitExec(['config', 'user.name', device_name || 'Monos']);
      // zdiff3 adds the `|||||||` base section. For prose, seeing the original
      // text is the difference between guessing which side is right and knowing.
      gitExec(['config', 'merge.conflictStyle', 'zdiff3']);
      gitExec(['config', 'user.email', `${device_name || 'user'}@monos.local`]);
      writeGitSettings({ repo, branch, device_name });
      writeRepoHygieneFiles();

      gitExec(['checkout', '-B', branch]);
      gitExec(['add', '-A']);
      commitStagedChanges(`Init from ${device_name || 'Monos'}`);

      const remoteBranchExists = branchExistsOnRemote(branch, authToken);
      if (remoteBranchExists) {
        gitExec(['branch', '--set-upstream-to', `origin/${branch}`, branch]);
        if (hasCommits()) {
          try {
            gitExec(['merge', '--no-edit', '--allow-unrelated-histories', `origin/${branch}`]);
          } catch (error) {
            const errorText = error.stderr || error.message || '';
            if (errorText.includes('CONFLICT') || hasUnmergedFiles()) {
              return res.json({ message: 'Conflicts detected during setup', conflicts: true });
            }
            throw error;
          }
        } else {
          gitExec(['checkout', '-B', branch, `origin/${branch}`]);
        }
      }

      gitExec(['push', '-u', 'origin', branch], { token: authToken });

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
      const hasConflicts = hasUnmergedFiles();
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
  app.post('/api/git/resolve-note', async (req, res) => {
    try {
      if (!isGitRepo()) return res.status(400).json({ detail: 'Git not initialized' });
      const { path: requestPath, content } = req.body || {};
      if (typeof content !== 'string') return res.status(400).json({ detail: 'Content is required' });

      const safePath = notesRelativePath(assertSafeGitPath(requestPath || ''));
      const absolute = path.join(NOTES_DIR, safePath);
      if (!fs.existsSync(absolute)) return res.status(404).json({ detail: 'Note not found' });

      const stages = getConflictStages(safePath);
      if (!stages.has(1) && !stages.has(2) && !stages.has(3)) {
        return res.status(409).json({ detail: 'This note has no unresolved conflict' });
      }

      // Keep a copy of everything involved before the working tree is rewritten.
      archiveConflictVersions(safePath, stages);
      fs.writeFileSync(absolute, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
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
      res.json({ message: 'Conflict resolved', mergeCommitted, remaining: listUnmergedFiles() });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message || String(error) });
    }
  });

  app.post('/api/git/pull', async (req, res) => {
    try {
      if (!isGitRepo()) return res.status(400).json({ detail: 'Git not initialized' });
      if (hasUnmergedFiles()) return res.json({ message: 'Conflicts detected', conflicts: true });

      const authToken = await readStoredGitToken();
      const { branch } = readGitSettings();
      const before = divergenceSummary(branch);

      // With a dirty tree git refuses to merge, so park local work in a commit
      // first and pull after it — the same order the full sync uses.
      const dirtied = hasStagedChanges() || hasUnstagedChanges();
      if (dirtied) {
        gitExec(['add', '-A']);
        commitStagedChanges('Auto-sync from Monos (pending pull)');
      }

      let message = 'Already up to date.';
      try {
        message = gitExec(['pull', '--no-rebase', '--no-edit'], { token: authToken });
      } catch (error) {
        const errorText = error.stderr || error.message || '';
        if (errorText.includes('CONFLICT') || hasUnmergedFiles()) {
          return res.json({ message: 'Conflicts detected', conflicts: true, dirtied });
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
        received: Math.max(0, before.behind - after.behind),
        dirtied,
        inSync: after.ahead === 0 && after.behind === 0,
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ detail: error.message || String(error) });
    }
  });

  app.post('/api/git/sync', async (req, res) => {
    try {
      if (!isGitRepo()) return res.status(400).json({ detail: 'Git not initialized' });
      // Idempotent: an existing repo adopts the hygiene files on its next sync.
      writeRepoHygieneFiles();
      if (hasUnmergedFiles()) return res.json({ message: 'Conflicts detected', conflicts: true });

      const authToken = await readStoredGitToken();
      const { device_name: deviceName, branch } = readGitSettings();
      const before = divergenceSummary(branch);

      gitExec(['add', '-A']);
      // Naming the device in the message is what makes a shared history
      // readable: "Auto-sync from Monos" on both devices gives you no way to
      // tell whose edit a commit was.
      const committed = hasStagedChanges();
      if (committed) commitStagedChanges(`Auto-sync from ${deviceName || 'Monos'}`);
      const pushedFiles = committed ? changedFilesSinceHead() : [];

      let result = 'Synced';
      try {
        result = gitExec(['pull', '--no-rebase', '--no-edit'], { token: authToken });
      } catch (error) {
        const errorText = error.stderr || error.message || '';
        if (errorText.includes('CONFLICT') || hasUnmergedFiles()) {
          return res.json({
            message: 'Conflicts detected',
            conflicts: true,
            committed,
            pushed: [],
            device: deviceName || null,
          });
        }
        throw error;
      }

      gitExec(['push'], { token: authToken });
      const after = divergenceSummary(branch);

      indexAllFiles();
      writeGitSettings({ ...readGitSettings(), last_sync: new Date().toISOString() });

      res.json({
        message: result,
        conflicts: false,
        committed,
        // What this device added. With two devices the other one's commits show
        // up as `pulled`, which is the number people actually look for.
        pushed: pushedFiles,
        pulled: Math.max(0, after.behind - before.behind),
        inSync: after.ahead === 0 && after.behind === 0,
        device: deviceName || null,
      });
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  });

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
        };
      });
      res.json(details);
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  });

  app.post('/api/git/conflicts/resolve', async (req, res) => {
    try {
      const { files, resolutions } = req.body;
      if (!isGitRepo()) return res.status(400).json({ detail: 'Git not initialized' });
      if (resolutions && typeof resolutions === 'object') {
        for (const [filePath, choice] of Object.entries(resolutions)) {
          if (choice === 'ours' || choice === 'theirs' || choice === 'auto') {
            resolveConflictPath(filePath, choice);
          } else {
            gitExec(['add', '--', assertSafeGitPath(filePath)]);
          }
        }
      } else {
        for (const file of (files || [])) gitExec(['add', '--', assertSafeGitPath(file)]);
      }
      gitExec(['commit', '-m', 'Resolve conflicts']);
      indexAllFiles();
      res.json({ message: 'Conflicts resolved' });
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  });
}
