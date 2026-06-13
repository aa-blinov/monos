import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { NOTES_DIR, ROOT_DIR } from '../config.js';
import { getDb } from '../database.js';
import { indexAllFiles } from '../indexing.js';

export function buildGithubRemoteUrl(repo) {
  return `https://github.com/${repo}.git`;
}

function gitArgsWithAuth(args, token) {
  if (!token) return args;
  const credentials = Buffer.from(`x-access-token:${token}`).toString('base64');
  return ['-c', `http.https://github.com/.extraheader=AUTHORIZATION: basic ${credentials}`, ...args];
}

function gitExec(args, options = {}) {
  const cwd = typeof options === 'string' ? options : options.cwd || NOTES_DIR;
  const token = typeof options === 'string' ? '' : options.token || '';

  try {
    return execFileSync('git', gitArgsWithAuth(args, token), {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }).trim();
  } catch (error) {
    const stderr = typeof error.stderr === 'string' ? error.stderr.trim() : error.stderr?.toString?.().trim();
    const stdout = typeof error.stdout === 'string' ? error.stdout.trim() : error.stdout?.toString?.().trim();
    const message = stderr || stdout || error.message || String(error);
    const gitError = new Error(message);
    gitError.status = error.status;
    gitError.stderr = stderr || '';
    gitError.stdout = stdout || '';
    throw gitError;
  }
}

function readStoredGitToken() {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('git_token');
    if (!row) return '';

    try {
      const parsed = JSON.parse(row.value);
      return typeof parsed === 'string' ? parsed : '';
    } catch {
      return typeof row.value === 'string' ? row.value : '';
    }
  } catch {
    return '';
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

async function fetchGithubJson(token, apiPath) {
  const https = await import('https');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      headers: {
        'User-Agent': 'Monos',
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    };

    https.get(options, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve([]);
        }
      });
    }).on('error', reject);
  });
}

export function registerGitRoutes(app) {
  app.post('/api/git/setup', (req, res) => {
    try {
      const { token, repo, branch, device_name } = req.body;
      if (!token || !repo || !branch) return res.status(400).json({ detail: 'Missing token, repo, or branch' });

      const remoteUrl = buildGithubRemoteUrl(repo);
      const authToken = token.trim();
      if (!isGitRepo()) {
        gitExec(['init']);
        gitExec(['remote', 'add', 'origin', remoteUrl]);
      } else {
        gitExec(['remote', 'set-url', 'origin', remoteUrl]);
      }

      gitExec(['config', 'user.name', device_name || 'Monos']);
      gitExec(['config', 'user.email', `${device_name || 'user'}@monos.local`]);
      gitExec(['fetch', '--depth=1', 'origin', branch], { token: authToken });
      gitExec(['checkout', '-B', branch, `origin/${branch}`]);

      writeGitSettings({ repo, branch, device_name });

      gitExec(['add', '-A']);
      try { gitExec(['commit', '-m', `Init from ${device_name || 'Monos'}`]); } catch {}
      try { gitExec(['push', 'origin', branch], { token: authToken }); } catch {}

      res.json({ message: `Connected to ${repo}/${branch}` });
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
        status: hasChanges ? 'dirty' : 'clean',
        ahead,
        behind,
        last_sync: settings.last_sync || null,
      });
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
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

  app.post('/api/git/sync', (req, res) => {
    try {
      if (!isGitRepo()) return res.status(400).json({ detail: 'Git not initialized' });

      const authToken = readStoredGitToken();
      let result = 'Synced';
      try {
        result = gitExec(['pull', '--no-edit'], { token: authToken });
      } catch (error) {
        const errorText = error.stderr || error.message || '';
        if (errorText.includes('CONFLICT')) return res.json({ message: 'Conflicts detected', conflicts: true });
        throw error;
      }

      gitExec(['add', '-A']);
      try {
        gitExec(['diff', '--cached', '--quiet']);
      } catch {
        gitExec(['commit', '-m', 'Auto-sync from Monos']);
      }

      gitExec(['push'], { token: authToken });

      indexAllFiles();
      writeGitSettings({ ...readGitSettings(), last_sync: new Date().toISOString() });

      res.json({ message: result, conflicts: false });
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  });

  app.get('/api/git/log', (req, res) => {
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

  app.get('/api/git/conflicts', (req, res) => {
    try {
      if (!isGitRepo()) return res.json([]);
      const status = gitExec(['diff', '--name-only', '--diff-filter=U']);
      const files = status.split('\n').filter(Boolean);
      const details = files.map(filePath => {
        try {
          const content = fs.readFileSync(path.join(NOTES_DIR, filePath), 'utf-8');
          const ours = [];
          const theirs = [];
          const lines = content.split('\n');
          let section = 'context';
          for (const line of lines) {
            if (line.startsWith('<<<<<<< HEAD')) { section = 'ours'; continue; }
            if (line.startsWith('=======')) { section = 'theirs'; continue; }
            if (line.startsWith('>>>>>>> ')) { section = 'context'; continue; }
            if (section === 'ours') ours.push(line);
            else if (section === 'theirs') theirs.push(line);
          }
          return { path: filePath, ours: ours.join('\n'), theirs: theirs.join('\n'), raw: content };
        } catch {
          return { path: filePath, ours: '', theirs: '', raw: '' };
        }
      });
      res.json(details);
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  });

  app.post('/api/git/conflicts/resolve', (req, res) => {
    try {
      const { files, resolutions } = req.body;
      if (!isGitRepo()) return res.status(400).json({ detail: 'Git not initialized' });
      if (resolutions && typeof resolutions === 'object') {
        for (const [filePath, choice] of Object.entries(resolutions)) {
          if (choice === 'ours') {
            const content = fs.readFileSync(path.join(NOTES_DIR, filePath), 'utf-8');
            const ours = [];
            let section = 'keep';
            for (const line of content.split('\n')) {
              if (line.startsWith('<<<<<<< HEAD')) { section = 'skip'; continue; }
              if (line.startsWith('=======')) { section = 'ours'; continue; }
              if (line.startsWith('>>>>>>> ')) { section = 'keep'; continue; }
              if (section === 'keep') ours.push(line);
              else if (section === 'ours') ours.push(line);
            }
            fs.writeFileSync(path.join(NOTES_DIR, filePath), ours.join('\n'), 'utf-8');
          } else if (choice === 'theirs') {
            const content = fs.readFileSync(path.join(NOTES_DIR, filePath), 'utf-8');
            const theirs = [];
            let section = 'skip';
            for (const line of content.split('\n')) {
              if (line.startsWith('<<<<<<< HEAD')) { section = 'skip'; continue; }
              if (line.startsWith('=======')) { section = 'theirs'; continue; }
              if (line.startsWith('>>>>>>> ')) { section = 'keep'; continue; }
              if (section === 'keep') theirs.push(line);
              else if (section === 'theirs') theirs.push(line);
            }
            fs.writeFileSync(path.join(NOTES_DIR, filePath), theirs.join('\n'), 'utf-8');
          }
          gitExec(['add', '--', filePath]);
        }
      } else {
        for (const file of (files || [])) gitExec(['add', '--', file]);
      }
      gitExec(['commit', '-m', 'Resolve conflicts']);
      indexAllFiles();
      res.json({ message: 'Conflicts resolved' });
    } catch (error) {
      res.status(500).json({ detail: error.message || String(error) });
    }
  });
}
