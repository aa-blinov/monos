import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// The backend runs inside the app's main process: a synchronous git call that waits on GitHub freezes the window,
// the terminal and every request for the whole round trip. Here the "network" takes 1.5 s (a hook on the remote
// that sleeps) and the process must stay responsive while the sync waits for it.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-sync-lag-'));
const notesDir = path.join(tempRoot, 'notes');
const remote = path.join(tempRoot, 'remote.git');
fs.mkdirSync(notesDir, { recursive: true });
process.env.NOTES_ROOT = tempRoot;

const { startServer, stopServer } = await import('./index.js');
const git = (args, cwd = notesDir) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
const NETWORK_SECONDS = 1.5;
let base;

test.before(async () => {
  git(['init', '-q', '--bare', '-b', 'master', remote], tempRoot);
  git(['init', '-q', '-b', 'master']);
  git(['config', 'user.email', 'n@x']); git(['config', 'user.name', 'Ноутбук']);
  git(['remote', 'add', 'origin', remote]);
  fs.writeFileSync(path.join(notesDir, 'Первая.md'), 'текст\n', 'utf-8');
  git(['add', '-A']); git(['commit', '-qm', 'base']); git(['push', '-q', '-u', 'origin', 'master']);
  fs.mkdirSync(path.join(remote, 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(remote, 'hooks', 'pre-receive'), `#!/bin/sh\nsleep ${NETWORK_SECONDS}\nexit 0\n`, { mode: 0o755 });
  fs.mkdirSync(path.join(tempRoot, '.data'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, '.data', 'git_settings.json'), JSON.stringify({ branch: 'master', repo: 'x/y' }));
  const started = await startServer({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${started.port}`;
});
test.after(async () => { await stopServer(); });

test('пока синхронизация ждёт сеть, приложение отвечает', async () => {
  fs.appendFileSync(path.join(notesDir, 'Первая.md'), 'правка\n');
  let last = performance.now();
  let worst = 0;
  const timer = setInterval(() => { const now = performance.now(); worst = Math.max(worst, now - last - 20); last = now; }, 20);
  try {
    const started = performance.now();
    const response = await fetch(`${base}/api/git/sync`, { method: 'POST' });
    const answer = await response.json();
    assert.equal(response.status, 200, JSON.stringify(answer));
    assert.ok(performance.now() - started >= NETWORK_SECONDS * 1000 * 0.9, 'синхронизация действительно ждала сеть');
  } finally {
    clearInterval(timer);
  }
  assert.ok(worst < NETWORK_SECONDS * 1000 * 0.6, `главный поток простоял ${Math.round(worst)} мс из ${NETWORK_SECONDS * 1000}`);
});
