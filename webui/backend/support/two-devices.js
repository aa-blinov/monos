import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Two devices of one person: each a backend process with its own data and notes folder, talking to one remote.
// The scenario is the same against a folder on this machine (always run) and against a real GitHub repository
// (github-live.test.js, when a token is given): only how a device is connected differs.
const DEVICE_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'device.mjs');

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startDevice(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `monos-device-${name}-`));
  const notesDir = path.join(root, 'notes');
  fs.mkdirSync(notesDir, { recursive: true });
  const child = spawn(process.execPath, [DEVICE_SCRIPT], { env: { ...process.env, NOTES_ROOT: root }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`device ${name} did not start: ${output}`)), 20000);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /PORT (\d+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('exit', (code) => reject(new Error(`device ${name} exited (${code}): ${output}`)));
  });
  const base = `http://127.0.0.1:${port}`;
  const call = async (method, url, body) => {
    const response = await fetch(`${base}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, ok: response.ok, data };
  };
  return {
    name, root, notesDir, base,
    get: (url) => call('GET', url),
    post: (url, body) => call('POST', url, body ?? {}),
    file: (relative) => path.join(notesDir, relative),
    read: (relative) => fs.readFileSync(path.join(notesDir, relative), 'utf-8'),
    exists: (relative) => fs.existsSync(path.join(notesDir, relative)),
    async stop() {
      child.removeAllListeners('exit');
      child.kill('SIGTERM');
      await sleep(200);
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();

/** Connects a device to a bare repository on this machine: what setup does, without GitHub's API. */
export async function connectLocal(device, remote, { branch = 'master', first = false } = {}) {
  await device.post('/api/device', { name: device.name });
  const cwd = device.notesDir;
  git(cwd, ['init', '-q', '-b', branch]);
  git(cwd, ['config', 'user.email', `${device.name}@example.test`]);
  git(cwd, ['config', 'user.name', device.name]);
  git(cwd, ['config', 'merge.conflictStyle', 'zdiff3']);
  git(cwd, ['remote', 'add', 'origin', remote]);
  fs.mkdirSync(path.join(device.root, '.data'), { recursive: true });
  fs.writeFileSync(path.join(device.root, '.data', 'git_settings.json'), JSON.stringify({ branch, repo: 'local/test', device_name: device.name }));
  if (first) {
    fs.writeFileSync(path.join(cwd, 'Начало.md'), '# Начало\n\nпервая заметка\n');
    git(cwd, ['add', '-A']);
    git(cwd, ['commit', '-q', '-m', 'Init']);
    git(cwd, ['push', '-q', '-u', 'origin', branch]);
  } else {
    git(cwd, ['fetch', '-q', 'origin', branch]);
    git(cwd, ['checkout', '-q', '-B', branch, `origin/${branch}`]);
    git(cwd, ['branch', '-q', `--set-upstream-to=origin/${branch}`, branch]);
  }
  // The backend read the folder when it started; what is on disk now must reach its index.
  await device.post('/api/git/pull');
}

export function makeBareRemote() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-remote-'));
  const remote = path.join(root, 'remote.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'master', remote]);
  return { remote, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/**
 * The same story whatever the remote is: a note travels from one device to the other, an edit comes back, two
 * devices edit one line and the person picks a side, a note with a Russian name keeps its name, and both
 * devices end level with the remote.
 */
export async function runTwoDeviceScenario(a, b, assert) {
  const create = (device, title, content) => device.post('/api/notes/create', { title, category: '', tags: [], content });
  const sync = async (device) => {
    const result = await device.post('/api/git/sync');
    assert.equal(result.status, 200, `${device.name} sync: ${JSON.stringify(result.data)}`);
    return result.data;
  };

  // A writes a note; B receives it.
  assert.equal((await create(a, 'Общая заметка', 'строка один\nстрока два\nстрока три\n')).status, 200);
  await sync(a);
  const received = await sync(b);
  assert.equal(received.conflicts, false);
  assert.ok(b.exists('Общая заметка.md'), 'B received the note');
  assert.match(b.read('Общая заметка.md'), /строка два/);

  // B opens it (the pull indexed it) and edits it; A receives the edit.
  const edit = await b.post('/api/file?path=' + encodeURIComponent('notes/Общая заметка.md'), { content: 'строка один\nстрока два, правка B\nстрока три\n' });
  assert.equal(edit.status, 200, JSON.stringify(edit.data));
  await sync(b);
  await sync(a);
  assert.match(a.read('Общая заметка.md'), /правка B/, 'A received B\'s edit');

  // A note with a Russian name keeps its name on the other device.
  await create(a, 'Кириллица и пробелы в названии', 'текст\n');
  await sync(a);
  await sync(b);
  assert.ok(b.exists('Кириллица и пробелы в названии.md'), 'a name outside ASCII arrives intact');

  // Both edit the same line; whoever syncs second gets a conflict and settles it.
  await a.post('/api/file?path=' + encodeURIComponent('notes/Общая заметка.md'), { content: 'строка один\nстрока два, правка A\nстрока три\n' });
  await b.post('/api/file?path=' + encodeURIComponent('notes/Общая заметка.md'), { content: 'строка один\nстрока два, другая правка B\nстрока три\n' });
  await sync(a);
  const clash = await sync(b);
  assert.equal(clash.conflicts, true, 'the same line on two devices is a conflict');
  const listed = await b.get('/api/git/conflicts');
  assert.ok(listed.data.some((item) => item.path === 'Общая заметка.md'), 'the conflict names the note');
  const settled = await b.post('/api/git/conflicts/resolve', { resolutions: { 'Общая заметка.md': 'theirs' } });
  assert.equal(settled.status, 200, JSON.stringify(settled.data));
  await sync(b);
  await sync(a);
  assert.equal(a.read('Общая заметка.md'), b.read('Общая заметка.md'), 'the devices agree after the conflict');

  // Level with the remote, nothing left over.
  for (const device of [a, b]) {
    const status = (await device.get('/api/git/status')).data;
    assert.equal(status.status, 'clean', `${device.name}: ${JSON.stringify(status)}`);
    assert.equal(status.ahead, 0);
    assert.equal(status.behind, 0);
  }
}
