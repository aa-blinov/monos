import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

// A repository without a remote, or with a remote and no tracking, is an ordinary state: sync must not answer 500.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-tracking-'));
const notesDir = path.join(tempRoot, 'notes');
const remoteDir = path.join(tempRoot, 'remote.git');
fs.mkdirSync(notesDir, { recursive: true });
process.env.NOTES_ROOT = tempRoot;

const { startServer, stopServer } = await import('./index.js');
let base;
const git = (args, cwd = notesDir) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
const post = (url) => fetch(`${base}${url}`, { method: 'POST' });

test.before(async () => {
  const started = await startServer({ port: 0 });
  base = `http://127.0.0.1:${started.port}`;
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'test@monos.local']);
  git(['config', 'user.name', 'Monos Test']);
  fs.writeFileSync(path.join(notesDir, 'A.md'), 'one\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'first']);
});

test.after(async () => {
  await stopServer();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('статус сообщает, есть ли remote: только с ним кнопка синхронизации имеет смысл', async () => {
  const before = await (await fetch(`${base}/api/git/status`)).json();
  assert.equal(before.initialized, true);
  assert.equal(before.remote, false);
});

test('без remote автосинхронизация и синхронизация отвечают 200 и ничего не ломают', async () => {
  const auto = await post('/api/git/sync?auto=1');
  assert.equal(auto.status, 200);
  assert.equal((await auto.json()).skipped, 'no-remote');
  fs.writeFileSync(path.join(notesDir, 'B.md'), 'two\n');
  const manual = await post('/api/git/sync');
  assert.equal(manual.status, 200);
  assert.match(git(['log', '--oneline']), /Auto-sync/);
  const pull = await post('/api/git/pull?auto=1');
  assert.equal(pull.status, 200);
});

test('remote есть, ветки на нём ещё нет: первая синхронизация отправляет её и включает отслеживание', async () => {
  git(['init', '-q', '--bare', '-b', 'main', remoteDir], tempRoot);
  git(['remote', 'add', 'origin', remoteDir]);
  fs.writeFileSync(path.join(notesDir, 'C.md'), 'three\n');
  const res = await post('/api/git/sync');
  assert.equal(res.status, 200);
  assert.equal(git(['rev-parse', '--abbrev-ref', '@{u}']), 'origin/main');
  assert.equal(git(['rev-parse', 'main'], remoteDir), git(['rev-parse', 'HEAD']));
});

test('remote есть, отслеживание потеряно: следующий круг восстанавливает его, а не отвечает 500', async () => {
  git(['branch', '--unset-upstream']);
  fs.writeFileSync(path.join(notesDir, 'D.md'), 'four\n');
  const pull = await post('/api/git/pull?auto=1');
  assert.equal(pull.status, 200);
  assert.equal(git(['rev-parse', '--abbrev-ref', '@{u}']), 'origin/main');
  git(['branch', '--unset-upstream']);
  const sync = await post('/api/git/sync');
  assert.equal(sync.status, 200);
  assert.equal(git(['rev-parse', 'main'], remoteDir), git(['rev-parse', 'HEAD']));
});

test('после подключения remote статус это показывает', async () => {
  const status = await (await fetch(`${base}/api/git/status`)).json();
  assert.equal(status.remote, true);
});

test('статус говорит, какие файлы ещё не отправлены и какие ждут на remote', async () => {
  // Everything is pushed after the last test.
  git(['push', '-u', 'origin', 'main']);
  let status = await (await fetch(`${base}/api/git/status`)).json();
  assert.deepEqual(status.unsent, []);
  assert.deepEqual(status.incoming, []);

  // Edited, new and committed-but-not-pushed files all wait to be sent.
  fs.writeFileSync(path.join(notesDir, 'A.md'), 'changed\n');
  fs.writeFileSync(path.join(notesDir, 'Ж и я.md'), 'new\n');
  fs.writeFileSync(path.join(notesDir, 'C.md'), 'committed only\n');
  git(['add', 'C.md']);
  git(['commit', '-qm', 'local commit']);
  status = await (await fetch(`${base}/api/git/status`)).json();
  assert.deepEqual([...status.unsent].sort(), ['A.md', 'C.md', 'Ж и я.md']);

  // A change that reached the remote from elsewhere is listed as incoming (after a fetch).
  const other = path.join(tempRoot, 'other');
  git(['clone', '-q', remoteDir, other], tempRoot);
  git(['config', 'user.email', 't@m.local'], other);
  git(['config', 'user.name', 'Other'], other);
  fs.writeFileSync(path.join(other, 'D.md'), 'from the other device\n');
  git(['add', '-A'], other);
  git(['commit', '-qm', 'other device'], other);
  git(['push', '-q', 'origin', 'main'], other);
  git(['fetch', '-q', 'origin']);
  status = await (await fetch(`${base}/api/git/status`)).json();
  assert.deepEqual(status.incoming, ['D.md']);
});
