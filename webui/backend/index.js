import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { getDb, closeDb } from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = process.env.NOTES_ROOT
  ? path.resolve(process.env.NOTES_ROOT)
  : path.resolve(__dirname, '..', '..');
const NOTES_DIR = path.join(ROOT_DIR, 'notes');

const app = express();
app.use(cors());
app.use(express.json());

// ---- Helpers ----

function relPath(absolutePath) {
  return path.relative(ROOT_DIR, absolutePath).replace(/\\/g, '/');
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nowISO() {
  return new Date().toISOString();
}

function extractWikiLinks(content) {
  const re = /\[\[(.*?)\]\]/g;
  const links = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    const name = m[1].split('|')[0].trim();
    links.push(name);
  }
  return links;
}

// ---- DATABASE OPERATIONS ----

function indexFile(filePath, content) {
  const db = getDb();
  const rel = relPath(filePath);
  const name = path.basename(filePath);
  const parent = path.dirname(rel).replace(/\\/g, '/');
  const stats = fs.statSync(filePath);
  const isDir = stats.isDirectory();
  const now = nowISO();

  const existing = db.prepare('SELECT * FROM notes_index WHERE path = ?').get(rel);
  if (existing) {
    db.prepare(`
      UPDATE notes_index SET name = ?, is_dir = ?, parent_path = ?, content = ?, last_opened = ?
      WHERE path = ?
    `).run(name, isDir ? 1 : 0, parent, content || '', now, rel);
  } else {
    db.prepare(`
      INSERT INTO notes_index (path, name, is_dir, parent_path, content, date_created, last_opened)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(rel, name, isDir ? 1 : 0, parent, content || '', now, now);
  }

  // Update links
  db.prepare('DELETE FROM note_links WHERE source_path = ?').run(rel);
  if (content && !isDir) {
    const links = extractWikiLinks(content);
    const insertLink = db.prepare('INSERT INTO note_links (source_path, target_name) VALUES (?, ?)');
    const tx = db.transaction((sourcePath, linkNames) => {
      for (const target of linkNames) {
        insertLink.run(sourcePath, target);
      }
    });
    tx(rel, links);
  }
}

function indexAllFiles() {
  const db = getDb();
  db.prepare('DELETE FROM notes_index').run();
  db.prepare('DELETE FROM note_links').run();

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const rel = relPath(fullPath);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
        const parent = path.dirname(rel).replace(/\\/g, '/');
        const now = nowISO();
        db.prepare(`
          INSERT OR REPLACE INTO notes_index (path, name, is_dir, parent_path, content, date_created, last_opened)
          VALUES (?, ?, 1, ?, '', ?, ?)
        `).run(rel, entry.name, parent, now, now);
        walk(fullPath);
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.txt')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        indexFile(fullPath, content);
      }
    }
  }
  walk(NOTES_DIR);
}

function getDirectoryChildren(parentRelPath) {
  const db = getDb();
  return db.prepare('SELECT * FROM notes_index WHERE parent_path = ? ORDER BY is_dir DESC, name COLLATE NOCASE ASC').all(parentRelPath);
}

// ---- API ROUTES ----

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Directory tree
app.get('/api/tree', (req, res) => {
  try {
    const db = getDb();

    function buildNode(relPathStr) {
      const name = relPathStr === 'notes' ? 'notes' : path.basename(relPathStr);
      const isNotesRoot = relPathStr === 'notes';
      const folderCfg = db.prepare('SELECT * FROM folder_config WHERE path = ?').get(relPathStr);
      const children = db.prepare('SELECT * FROM notes_index WHERE parent_path = ? ORDER BY is_dir DESC, name COLLATE NOCASE ASC').all(relPathStr);

      const node = {
        path: relPathStr,
        name: name,
        is_dir: true,
        icon: folderCfg?.icon || null,
        color: folderCfg?.color || null,
        size: 0,
        size_human: '',
        children: [],
        metadata: null,
      };

      for (const child of children) {
        if (child.is_dir) {
          node.children.push(buildNode(child.path));
        } else {
          const childCfg = db.prepare('SELECT * FROM folder_config WHERE path = ?').get(child.path);
          node.children.push({
            path: child.path,
            name: child.name,
            is_dir: false,
            icon: childCfg?.icon || null,
            color: childCfg?.color || null,
            size: 0,
            size_human: '',
            children: [],
            metadata: {
              title: child.title || null,
              date: child.date_created || null,
              category: child.category || null,
              tags: JSON.parse(child.tags || '[]'),
            }
          });
        }
      }

      return node;
    }

    const tree = buildNode('notes');
    res.json(tree);
  } catch (e) {
    console.error('/api/tree error:', e);
    res.status(500).json({ detail: e.message });
  }
});

// Read file
app.get('/api/file', (req, res) => {
  try {
    const { path: filePath } = req.query;
    const fullPath = path.join(ROOT_DIR, filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: 'File not found' });
    if (fs.statSync(fullPath).isDirectory()) return res.status(400).json({ detail: 'Path is a directory' });

    const content = fs.readFileSync(fullPath, 'utf-8');

    // Update last_opened
    const db = getDb();
    db.prepare('UPDATE notes_index SET last_opened = ? WHERE path = ?').run(nowISO(), filePath);

    res.json({ content });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// Write/save file
app.post('/api/file', (req, res) => {
  try {
    const { path: filePath } = req.query;
    const { content } = req.body;
    const fullPath = path.join(ROOT_DIR, filePath);
    fs.writeFileSync(fullPath, content, 'utf-8');
    indexFile(fullPath, content);
    res.json({ message: 'Saved' });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// Delete file
app.delete('/api/file', (req, res) => {
  try {
    const { path: filePath } = req.query;
    const fullPath = path.join(ROOT_DIR, filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: 'File not found' });

    if (fs.statSync(fullPath).isDirectory()) {
      fs.rmSync(fullPath, { recursive: true });
    } else {
      fs.unlinkSync(fullPath);
    }

    const db = getDb();
    db.prepare('DELETE FROM notes_index WHERE path = ? OR path LIKE ? || \'/%\'').run(filePath, filePath);
    db.prepare('DELETE FROM folder_config WHERE path = ? OR path LIKE ? || \'/%\'').run(filePath, filePath);
    db.prepare('DELETE FROM note_links WHERE source_path = ? OR source_path LIKE ? || \'/%\'').run(filePath, filePath);

    res.json({ message: 'Deleted' });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// Rename file
app.post('/api/file/rename', (req, res) => {
  try {
    const { path: filePath } = req.query;
    const { new_name } = req.body;
    const fullPath = path.join(ROOT_DIR, filePath);
    const dir = path.dirname(fullPath);
    const newFullPath = path.join(dir, new_name);
    fs.renameSync(fullPath, newFullPath);

    const db = getDb();
    const newRelPath = relPath(newFullPath);

    // Rename in DB
    db.prepare(`UPDATE notes_index SET path = ?, name = ? WHERE path = ?`).run(newRelPath, new_name, filePath);
    if (fs.statSync(newFullPath).isDirectory()) {
      // Rename children paths
      const children = db.prepare('SELECT path FROM notes_index WHERE path LIKE ? || \'/%\'').all(filePath);
      for (const child of children) {
        const newChildPath = child.path.replace(filePath, newRelPath);
        db.prepare('UPDATE notes_index SET path = ?, parent_path = ? WHERE path = ?').run(
          newChildPath, path.dirname(newChildPath).replace(/\\/g, '/'), child.path
        );
      }
      db.prepare('UPDATE folder_config SET path = ? WHERE path = ?').run(newRelPath, filePath);
    }

    res.json({ path: newRelPath, name: new_name });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// Move file
app.post('/api/file/move', (req, res) => {
  try {
    const { source, target } = req.query;
    const sourceFull = path.resolve(__dirname, '..', '..', source);
    const targetDir = target === 'notes' ? NOTES_DIR : path.resolve(__dirname, '..', '..', target);
    const name = path.basename(sourceFull);
    const destFull = path.join(targetDir, name);

    fs.renameSync(sourceFull, destFull);
    indexAllFiles();
    res.json({ message: 'Moved' });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// File info
app.get('/api/file-info', (req, res) => {
  try {
    const { path: filePath } = req.query;
    const fullPath = path.join(ROOT_DIR, filePath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ detail: 'File not found' });

    const stats = fs.statSync(fullPath);
    const db = getDb();
    const meta = db.prepare('SELECT * FROM notes_index WHERE path = ?').get(filePath);

    res.json({
      path: filePath,
      name: path.basename(filePath),
      is_dir: stats.isDirectory(),
      size: stats.size,
      size_human: humanSize(stats.size),
      modified: stats.mtime.toISOString(),
      created: meta?.date_created || stats.birthtime?.toISOString() || stats.mtime.toISOString(),
      metadata: meta ? {
        title: meta.title || null,
        date: meta.date_created || null,
        category: meta.category || null,
        tags: JSON.parse(meta.tags || '[]'),
      } : null,
    });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// Update metadata
app.put('/api/file/metadata', (req, res) => {
  try {
    const { path: filePath } = req.query;
    const { title, tags } = req.body;
    const db = getDb();
    db.prepare('UPDATE notes_index SET title = ?, tags = ? WHERE path = ?').run(
      title || '', JSON.stringify(tags || []), filePath
    );
    const updated = db.prepare('SELECT * FROM notes_index WHERE path = ?').get(filePath);
    res.json({
      title: updated?.title || '',
    });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// Create note
app.post('/api/notes/create', (req, res) => {
  try {
    const { title, category, tags, content } = req.body;
    const fileName = title.replace(/[/\\?%*:|"<>]/g, '_') + '.md';
    const dirPath = category ? path.join(NOTES_DIR, category) : NOTES_DIR;
    fs.mkdirSync(dirPath, { recursive: true });

    const filePath = path.join(dirPath, fileName);
    const noteContent = `---\ntitle: ${title}\n---\n\n${content || ''}`;
    fs.writeFileSync(filePath, noteContent, 'utf-8');

    const rel = relPath(filePath);
    const db = getDb();
    const now = nowISO();
    db.prepare(`
      INSERT INTO notes_index (path, name, is_dir, parent_path, title, content, tags, category, date_created, last_opened)
      VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
    `).run(rel, fileName, path.dirname(rel).replace(/\\/g, '/'), title, noteContent, JSON.stringify(tags || []), category || '', now, now);

    res.json({ path: rel, name: fileName, isDir: false });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// Recent notes
app.get('/api/notes/recent', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const db = getDb();
    const entries = db.prepare(
      'SELECT * FROM notes_index WHERE is_dir = 0 ORDER BY last_opened DESC LIMIT ?'
    ).all(limit);

    res.json(entries.map(e => ({
      path: e.path,
      name: e.name.replace('.md', ''),
      excerpt: `Last opened: ${e.last_opened?.slice(0, 16) || ''}`
    })));
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// Search
app.post('/api/search', (req, res) => {
  try {
    const { query, search_content } = req.body;
    const db = getDb();
    const q = `%${query}%`;

    let results;
    if (search_content) {
      results = db.prepare(`
        SELECT * FROM notes_index WHERE is_dir = 0 AND (name LIKE ? OR content LIKE ? OR title LIKE ? OR tags LIKE ?)
        ORDER BY last_opened DESC LIMIT 50
      `).all(q, q, q, q);
    } else {
      results = db.prepare(`
        SELECT * FROM notes_index WHERE is_dir = 0 AND (name LIKE ? OR title LIKE ? OR tags LIKE ?)
        ORDER BY last_opened DESC LIMIT 50
      `).all(q, q, q);
    }

    res.json(results.map(e => {
      let excerpt = '';
      if (search_content && e.content) {
        const idx = e.content.toLowerCase().indexOf(query.toLowerCase());
        if (idx >= 0) {
          const start = Math.max(0, idx - 60);
          const end = Math.min(e.content.length, idx + query.length + 60);
          excerpt = (start > 0 ? '...' : '') + e.content.slice(start, end) + (end < e.content.length ? '...' : '');
        }
      }
      return {
        path: e.path,
        name: e.name.replace('.md', ''),
        excerpt,
      };
    }));
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// Backlinks
app.get('/api/notes/backlinks', (req, res) => {
  try {
    const { path: filePath } = req.query;
    const db = getDb();
    const note = db.prepare('SELECT * FROM notes_index WHERE path = ?').get(filePath);
    if (!note) return res.json([]);

    const targetName = path.basename(filePath, '.md');
    const results = db.prepare(`
      SELECT ni.* FROM notes_index ni
      JOIN note_links nl ON nl.source_path = ni.path
      WHERE nl.target_name = ? OR nl.target_name = ?
    `).all(targetName, note.title || targetName);

    res.json(results.map(e => ({
      path: e.path,
      name: e.name.replace('.md', ''),
    })));
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// Resolve wiki-link
app.get('/api/notes/resolve-link', (req, res) => {
  try {
    const { name } = req.query;
    const db = getDb();
    const entry = db.prepare(
      'SELECT * FROM notes_index WHERE is_dir = 0 AND (title = ? OR name = ? OR name = ?) LIMIT 1'
    ).get(name, name, name + '.md');

    if (entry) {
      res.json({ path: entry.path, name: entry.name.replace('.md', ''), isDir: false });
    } else {
      res.json({});
    }
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// Get all tags
app.get('/api/tags', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT tags FROM notes_index WHERE tags IS NOT NULL AND tags != \'[]\' AND tags != \'\'').all();
    const tagSet = new Set();
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.tags);
        for (const t of parsed) tagSet.add(t);
      } catch {}
    }
    res.json([...tagSet].sort());
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// Directory list
app.get('/api/directories', (req, res) => {
  try {
    const dirs = [''];

    function walk(dir, prefix) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.')) {
          const fullPath = path.join(dir, entry.name);
          const rel = relPath(fullPath).replace('notes/', '');
          dirs.push(rel);
          walk(fullPath, rel);
        }
      }
    }
    walk(NOTES_DIR, '');
    res.json(dirs);
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// Create directory
app.post('/api/directory/create', (req, res) => {
  try {
    let { path: dirPath } = req.query;
    if (!dirPath.startsWith('notes/')) dirPath = 'notes/' + dirPath;
    const fullPath = path.resolve(__dirname, '..', '..', dirPath);
    fs.mkdirSync(fullPath, { recursive: true });

    // Add to index
    const db = getDb();
    const now = nowISO();
    db.prepare(`
      INSERT OR REPLACE INTO notes_index (path, name, is_dir, parent_path, content, date_created, last_opened)
      VALUES (?, ?, 1, ?, '', ?, ?)
    `).run(dirPath, path.basename(dirPath), path.dirname(dirPath).replace(/\\/g, '/'), now, now);

    res.json({ message: 'Directory created' });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// Set directory/file icon
app.post('/api/directory/icon', (req, res) => {
  try {
    const { path: itemPath } = req.query;
    const { icon, color } = req.body || {};
    const db = getDb();

    const existing = db.prepare('SELECT * FROM folder_config WHERE path = ?').get(itemPath);

    if (icon === null && color === null || icon === undefined && color === undefined) {
      if (existing) db.prepare('DELETE FROM folder_config WHERE path = ?').run(itemPath);
    } else if (existing) {
      if (icon !== undefined) db.prepare('UPDATE folder_config SET icon = ? WHERE path = ?').run(icon || null, itemPath);
      if (color !== undefined) db.prepare('UPDATE folder_config SET color = ? WHERE path = ?').run(color || null, itemPath);
    } else {
      db.prepare('INSERT INTO folder_config (path, icon, color) VALUES (?, ?, ?)').run(itemPath, icon || null, color || null);
    }

    res.json({ message: 'Icon updated' });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// ---- GIT OPERATIONS ----

function gitExec(cmd, cwd) {
  try {
    return execSync(cmd, { cwd: cwd || NOTES_DIR, encoding: 'utf-8', timeout: 30000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
  } catch (e) {
    if (e.stderr) return e.stderr.trim();
    throw e;
  }
}

function isGitRepo() {
  try {
    const topLevel = execSync('git rev-parse --show-toplevel', { cwd: NOTES_DIR, stdio: 'pipe', encoding: 'utf-8' }).trim();
    const notesDir = path.resolve(NOTES_DIR);
    return topLevel === notesDir;
  } catch { return false; }
}

app.post('/api/git/setup', (req, res) => {
  try {
    const { token, repo, branch, device_name } = req.body;
    if (!token || !repo || !branch) return res.status(400).json({ detail: 'Missing token, repo, or branch' });

    const remoteUrl = `https://${token}@github.com/${repo}.git`;
    const cwd = NOTES_DIR;

    // Init if needed
    if (!isGitRepo()) {
      gitExec('git init', cwd);
      gitExec(`git remote add origin ${remoteUrl}`, cwd);
    } else {
      gitExec(`git remote set-url origin ${remoteUrl}`, cwd);
    }

    gitExec(`git config user.name "${device_name || 'Monos'}"`, cwd);
    gitExec(`git config user.email "${device_name || 'user'}@monos.local"`, cwd);
    gitExec(`git fetch origin ${branch} --depth=1`, cwd);
    gitExec(`git checkout -B ${branch} origin/${branch}`, cwd);

    // Save settings to a JSON file
    const settingsPath = path.join(ROOT_DIR, '.data', 'git_settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify({ repo, branch, device_name }, null, 2));

    gitExec(`git add -A`, cwd);
    try { gitExec(`git commit -m "Init from ${device_name || 'Monos'}"`, cwd); } catch {}
    try { gitExec(`git push origin ${branch}`, cwd); } catch {}

    res.json({ message: `Connected to ${repo}/${branch}` });
  } catch (e) {
    res.status(500).json({ detail: e.message || String(e) });
  }
});

app.get('/api/git/status', (req, res) => {
  try {
    if (!isGitRepo()) return res.json({ initialized: false });

    const settingsPath = path.join(ROOT_DIR, '.data', 'git_settings.json');
    let settings = {};
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch {}

    const currentBranch = gitExec('git rev-parse --abbrev-ref HEAD', NOTES_DIR);
    const statusOut = gitExec('git status --porcelain', NOTES_DIR);
    const hasChanges = statusOut.length > 0;

    let ahead = 0, behind = 0;
    try {
      gitExec('git rev-parse @{u}', NOTES_DIR);
      const counts = gitExec('git rev-list --left-right --count @{u}...HEAD', NOTES_DIR);
      const parts = counts.split('\t');
      behind = parseInt(parts[0]) || 0;
      ahead = parseInt(parts[1]) || 0;
    } catch {}

    const status = hasChanges ? 'dirty' : 'clean';

    res.json({
      initialized: true,
      current_branch: currentBranch,
      branch: currentBranch,
      repo: settings.repo || '',
      hasChanges,
      status,
      ahead,
      behind,
      last_sync: settings.last_sync || null,
    });
  } catch (e) {
    res.status(500).json({ detail: e.message || String(e) });
  }
});

app.get('/api/git/repos', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ detail: 'Token required' });

    // Use GitHub API to list repos
    const https = await import('https');
    const repos = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: '/user/repos?per_page=100&sort=updated',
        headers: {
          'User-Agent': 'Monos',
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        }
      };
      https.get(options, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
          try {
            resolve(JSON.parse(data).map(r => r.full_name));
          } catch { resolve([]); }
        });
      }).on('error', reject);
    });
    res.json(repos);
  } catch (e) {
    res.status(500).json({ detail: e.message || String(e) });
  }
});

app.get('/api/git/branches', async (req, res) => {
  try {
    const { token, repo } = req.query;
    if (!token || !repo) return res.status(400).json({ detail: 'Token and repo required' });

    const https = await import('https');
    const branches = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${repo}/branches?per_page=100`,
        headers: {
          'User-Agent': 'Monos',
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        }
      };
      https.get(options, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
          try {
            resolve(JSON.parse(data).map(b => b.name));
          } catch { resolve([]); }
        });
      }).on('error', reject);
    });
    res.json(branches);
  } catch (e) {
    res.status(500).json({ detail: e.message || String(e) });
  }
});

app.get('/api/git/user', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ detail: 'Token required' });

    const https = await import('https');
    const user = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: '/user',
        headers: {
          'User-Agent': 'Monos',
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        }
      };
      https.get(options, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve({}); }
        });
      }).on('error', reject);
    });
    res.json({ login: user.login || 'unknown' });
  } catch (e) {
    res.status(500).json({ detail: e.message || String(e) });
  }
});

app.post('/api/git/sync', (req, res) => {
  try {
    if (!isGitRepo()) return res.status(400).json({ detail: 'Git not initialized' });

    const cwd = NOTES_DIR;
    let result = 'Synced';

    // Pull
    try { result = gitExec('git pull --no-edit', cwd); } catch (e) {
      const errStr = e.stderr || e.message || '';
      if (errStr.includes('CONFLICT')) {
        return res.json({ message: 'Conflicts detected', conflicts: true });
      }
    }

    // Add and commit
    gitExec('git add -A', cwd);
    try {
      gitExec('git diff --cached --quiet', cwd);
    } catch {
      gitExec('git commit -m "Auto-sync from Monos"', cwd);
    }

    // Push
    try { gitExec('git push', cwd); } catch {}

    indexAllFiles();

    // Save last sync time
    const settingsPath = path.join(ROOT_DIR, '.data', 'git_settings.json');
    let settings = {};
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch {}
    settings.last_sync = new Date().toISOString();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    res.json({ message: result, conflicts: false });
  } catch (e) {
    res.status(500).json({ detail: e.message || String(e) });
  }
});

app.get('/api/git/log', (req, res) => {
  try {
    if (!isGitRepo()) return res.json([]);
    const limit = parseInt(req.query.limit) || 20;
    const raw = gitExec(`git log --oneline -${limit}`, NOTES_DIR);
    const log = raw.split('\n').filter(Boolean).map(line => {
      const [hash, ...rest] = line.split(' ');
      return { hash, message: rest.join(' ') };
    });
    res.json(log);
  } catch (e) {
    res.status(500).json({ detail: e.message || String(e) });
  }
});

app.get('/api/git/conflicts', (req, res) => {
  try {
    if (!isGitRepo()) return res.json([]);
    const status = gitExec('git diff --name-only --diff-filter=U', NOTES_DIR);
    res.json(status.split('\n').filter(Boolean));
  } catch (e) {
    res.status(500).json({ detail: e.message || String(e) });
  }
});

app.post('/api/git/conflicts/resolve', (req, res) => {
  try {
    const { files } = req.body;
    if (!isGitRepo()) return res.status(400).json({ detail: 'Git not initialized' });
    const cwd = NOTES_DIR;
    for (const file of (files || [])) {
      gitExec(`git add "${file}"`, cwd);
    }
    gitExec(`git commit -m "Resolve conflicts"`, cwd);
    res.json({ message: 'Conflicts resolved' });
  } catch (e) {
    res.status(500).json({ detail: e.message || String(e) });
  }
});

// ---- FORMAT ----
app.post('/api/format', (req, res) => {
  try {
    const excluded = new Set(['README.md', 'AGENTS.md']);
    let count = 0;

    function walk(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          walk(fullPath);
        } else if (entry.name.endsWith('.md') && !excluded.has(entry.name)) {
          const original = fs.readFileSync(fullPath, 'utf-8');
          // Basic formatting: normalize newlines, strip trailing whitespace, ensure single trailing newline
          let formatted = original
            .replace(/[ \t]+$/gm, '')  // strip trailing whitespace
            .replace(/\r\n/g, '\n')     // normalize line endings
            .replace(/\n{3,}/g, '\n\n') // max 2 consecutive newlines
            .trim() + '\n';

          if (original !== formatted) {
            fs.writeFileSync(fullPath, formatted, 'utf-8');
            count++;
          }
        }
      }
    }
    walk(NOTES_DIR);

    if (count > 0) indexAllFiles();
    res.json({ success: true, message: `Formatted. Updated: ${count}` });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// ---- SETTINGS ----

app.get('/api/settings', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const row of rows) {
      try { settings[row.key] = JSON.parse(row.value); }
      catch { settings[row.key] = row.value; }
    }
    res.json(settings);
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const db = getDb();
    const tx = db.transaction((data) => {
      const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      for (const [key, value] of Object.entries(data)) {
        upsert.run(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    });
    tx(req.body);
    res.json({ message: 'Saved' });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
});

// ---- INDEX FILES ON STARTUP ----
indexAllFiles();

// ---- SERVER ----
const PORT = 8000;
const server = app.listen(PORT, () => {
  console.log(`Monos backend running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  closeDb();
  server.close();
});
process.on('SIGTERM', () => {
  closeDb();
  server.close();
});

function humanSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}
