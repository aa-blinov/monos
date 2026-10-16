import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-conflict-'));
const notesDir = path.join(tempRoot, 'notes');
fs.mkdirSync(notesDir, { recursive: true });
process.env.NOTES_ROOT = tempRoot;

const { startServer, stopServer } = await import('./index.js');

const NOTE = 'План поездки.md';
const git = (args) => execFileSync('git', args, { cwd: notesDir, encoding: 'utf-8' }).trim();
const write = (text) => fs.writeFileSync(path.join(notesDir, NOTE), text, 'utf-8');
let base;

test.before(async () => {
  git(['init', '-q', '-b', 'master']);
  git(['config', 'user.email', 't@example.com']);
  git(['config', 'user.name', 'Test']);
  write('Выезд: пятница.\n\n- зарядку\n- аптечка\n- документы\n');
  git(['add', '-A']); git(['commit', '-qm', 'base']);
  git(['checkout', '-qb', 'other']);
  write('Выезд: пятница, 7:00.\n\n- зарядку\n- термос\n- документы\n');
  git(['-c', 'user.name=Телефон', 'commit', '-qam', 'other']);
  git(['checkout', '-q', 'master']);
  write('Выезд: суббота.\n\n- зарядку\n- плед\n- документы\n');
  git(['-c', 'user.name=Ноутбук', 'commit', '-qam', 'mine']);
  try { git(['merge', 'other']); } catch { /* conflict expected */ }
  const started = await startServer({ port: 0 });
  base = `http://127.0.0.1:${started.port}`;
});

test.after(async () => { await stopServer(); });

const resolve = (content) => fetch(`${base}/api/git/resolve-note`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: `notes/${NOTE}`, content }),
}).then((r) => r.json());

test('список конфликтов называет заметку по-русски и отдаёт обе версии', async () => {
  const list = await (await fetch(`${base}/api/git/conflicts`)).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].path, NOTE);
  assert.match(list[0].ours, /суббота/);
  assert.match(list[0].theirs, /7:00/);
});

test('у каждой версии есть устройство и время', async () => {
  const [item] = await (await fetch(`${base}/api/git/conflicts`)).json();
  assert.equal(item.sides.ours.device, 'Ноутбук');
  assert.equal(item.sides.theirs.device, 'Телефон');
  assert.ok(!Number.isNaN(Date.parse(item.sides.theirs.date)));
});

test('частичный разбор сохраняет выбор, но заметка остаётся в конфликте', async () => {
  const conflicted = fs.readFileSync(path.join(notesDir, NOTE), 'utf-8');
  // A text that still carries markers, as when only some parts were decided.
  const partial = conflicted.replace('Выезд: суббота.', 'Выезд: суббота, поездом.');
  assert.match(partial, /<{7} HEAD/);
  const body = await resolve(partial);
  assert.equal(body.resolved, false);
  const status = await (await fetch(`${base}/api/git/status`)).json();
  assert.equal(status.status, 'conflict', 'с маркерами в тексте заметка не может считаться разобранной');
});

test('полный разбор закрывает конфликт', async () => {
  const body = await resolve('Выезд: суббота.\n\n- зарядку\n- плед\n- термос\n- документы\n');
  assert.equal(body.resolved, true);
  const status = await (await fetch(`${base}/api/git/status`)).json();
  assert.notEqual(status.status, 'conflict');
});

test('маркеры, оставшиеся в тексте без конфликта в git, снимаются обычным сохранением', async () => {
  write('<<<<<<< HEAD\nА\n=======\nБ\n>>>>>>> other\n');
  git(['add', '-A']); git(['commit', '-qm', 'markers committed by an older version']);
  const body = await resolve('А\n\nБ\n');
  assert.equal(body.resolved, true);
  assert.equal(fs.readFileSync(path.join(notesDir, NOTE), 'utf-8'), 'А\n\nБ\n');
});
