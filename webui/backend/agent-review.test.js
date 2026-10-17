import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// What an agent changed waits for review against a checkpoint: kept edits go to the other devices in a commit
// of their own, reverted ones come back as they were, and the ones still waiting stay out of the sync.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-review-'));
const notesDir = path.join(tempRoot, 'notes');
const remote = path.join(tempRoot, 'remote.git');
fs.mkdirSync(notesDir, { recursive: true });
process.env.NOTES_ROOT = tempRoot;
const { startServer, stopServer } = await import('./index.js');
const git = (args, cwd = notesDir) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
const note = (name) => path.join(notesDir, name);
let base;

test.before(async () => {
  fs.writeFileSync(note('План.md'), 'Было.\n', 'utf-8');
  fs.writeFileSync(note('Список.md'), 'Молоко.\n', 'utf-8');
  git(['init', '-q', '--bare', remote], tempRoot);
  git(['init', '-q', '-b', 'master']);
  git(['config', 'user.email', 'n@x']); git(['config', 'user.name', 'Ноутбук']);
  git(['remote', 'add', 'origin', remote]);
  git(['add', '-A']); git(['commit', '-qm', 'base']); git(['push', '-q', '-u', 'origin', 'master']);
  const started = await startServer({ port: 0 });
  base = `http://127.0.0.1:${started.port}`;
  await fetch(`${base}/api/device`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ноутбук' }) });
});
test.after(async () => { await stopServer(); });

const post = (url, body) => fetch(`${base}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then((r) => r.json());
const review = () => fetch(`${base}/api/agent/review`).then((r) => r.json());
const waitFor = async (check, ms = 3000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await check()) return true; await new Promise((r) => setTimeout(r, 80)); }
  return false;
};

test('правки в обход Monos после точки отката ждут ревью, с разницей', async () => {
  const { checkpoint } = await post('/api/agent/checkpoint');
  assert.match(checkpoint, /^[0-9a-f]{40}$/);
  fs.writeFileSync(note('План.md'), 'Стало.\n', 'utf-8');
  fs.writeFileSync(note('Новая.md'), 'Создано агентом.\n', 'utf-8');
  fs.writeFileSync(note('Список.md'), 'Молоко.\nХлеб.\n', 'utf-8');
  assert.ok(await waitFor(async () => (await review()).changes.length === 3), 'три изменения');
  const { changes } = await review();
  const status = Object.fromEntries(changes.map((c) => [c.path, c.status]));
  assert.deepEqual(status, { 'notes/План.md': 'modified', 'notes/Новая.md': 'added', 'notes/Список.md': 'modified' });
  const { diff } = await (await fetch(`${base}/api/agent/review/diff?path=${encodeURIComponent('notes/План.md')}`)).json();
  assert.match(diff, /^-Было\.$/m);
  assert.match(diff, /^\+Стало\.$/m);
});

test('«Откатить» возвращает как было, созданное агентом убирает', async () => {
  const after = await post('/api/agent/review/revert', { paths: ['notes/Новая.md', 'notes/Список.md'] });
  assert.equal(fs.existsSync(note('Новая.md')), false);
  assert.equal(fs.readFileSync(note('Список.md'), 'utf-8'), 'Молоко.\n');
  assert.deepEqual(after.changes.map((c) => c.path), ['notes/План.md']);
});

test('принятое уходит отдельным коммитом, ждущее ревью остаётся', async () => {
  await post('/api/agent/review/keep', { paths: ['notes/План.md'] });
  // A new outside change after the kept one: it waits.
  fs.writeFileSync(note('Список.md'), 'Молоко.\nСыр.\n', 'utf-8');
  assert.ok(await waitFor(async () => (await review()).changes.some((c) => c.path === 'notes/Список.md')));
  const sync = await post('/api/git/sync');
  assert.deepEqual(sync.heldForReview, ['Список.md']);
  assert.equal(git(['log', '-1', '--format=%s', '--', 'План.md']), 'Agent edits on Ноутбук');
  assert.equal(git(['show', 'origin/master:План.md']), 'Стало.');
  assert.equal(git(['show', 'origin/master:Список.md']), 'Молоко.', 'правка, ждущая ревью, не уходит');
  assert.match(git(['-c', 'core.quotepath=false', 'status', '--porcelain']), /Список\.md/);
});
