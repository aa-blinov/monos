import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// A locked note changed on two devices. Its text is one sealed envelope, so git must never merge it line
// by line: the file stays this device's sealed version, both sides stay in git, and the merge of the
// plain texts happens with the passphrase, in memory, sealed again on the way to disk.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-locked-conflict-'));
const notesDir = path.join(tempRoot, 'notes');
const remote = path.join(tempRoot, 'remote.git');
fs.mkdirSync(notesDir, { recursive: true });
process.env.NOTES_ROOT = tempRoot;

const { startServer, stopServer } = await import('./index.js');
const { lockContent, unlockContent, isLockedNote } = await import('./note-lock.js');

const NOTE = 'Пароли.md';
const PASS = 'верная фраза';
const git = (args, cwd = notesDir) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
const notePath = path.join(notesDir, NOTE);
let base;

const sealedText = (plain) => lockContent(plain, PASS).text;

test.before(async () => {
  git(['init', '-q', '--bare', remote], tempRoot);
  git(['init', '-q', '-b', 'master']);
  git(['config', 'user.email', 'n@x']); git(['config', 'user.name', 'Ноутбук']);
  git(['remote', 'add', 'origin', remote]);
  fs.writeFileSync(notePath, sealedText('Почта: старый пароль.\n\nБанк: 1234.\n'), 'utf-8');
  git(['add', '-A']); git(['commit', '-qm', 'base']); git(['push', '-q', '-u', 'origin', 'master']);

  // The other device: a clone that changes the bank line.
  const other = path.join(tempRoot, 'other');
  git(['clone', '-q', remote, other], tempRoot);
  fs.writeFileSync(path.join(other, NOTE), sealedText('Почта: старый пароль.\n\nБанк: 5678.\n'), 'utf-8');
  git(['-c', 'user.name=Телефон', '-c', 'user.email=t@x', 'commit', '-qam', 'there'], other);
  git(['push', '-q'], other);

  // This device changes the mail line.
  fs.writeFileSync(notePath, sealedText('Почта: новый пароль.\n\nБанк: 1234.\n'), 'utf-8');
  git(['commit', '-qam', 'here']);

  const started = await startServer({ port: 0 });
  base = `http://127.0.0.1:${started.port}`;
});
test.after(async () => { await stopServer(); });

const post = (url, body) => fetch(`${base}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('после синхронизации заметка остаётся целым шифром, конфликт отмечен как защищённый', async () => {
  const sync = await (await post('/api/git/pull', {})).json();
  assert.equal(sync.conflicts, true);
  const text = fs.readFileSync(notePath, 'utf-8');
  assert.equal(isLockedNote(text), true, 'файл должен остаться читаемым шифром');
  assert.doesNotMatch(text, /^<{7}/m, 'в шифре не должно быть меток');
  assert.match(unlockContent(text, PASS).plaintext, /новый пароль/);
  const [item] = await (await fetch(`${base}/api/git/conflicts`)).json();
  assert.equal(item.locked, true);
});

test('неверная фраза не открывает версии', async () => {
  const response = await post('/api/git/locked-conflict', { path: `notes/${NOTE}`, passphrase: 'не та' });
  assert.equal(response.status, 403);
});

test('с фразой обе версии открываются в памяти, итог записывается снова зашифрованным', async () => {
  const opened = await (await post('/api/git/locked-conflict', { path: `notes/${NOTE}`, passphrase: PASS })).json();
  assert.match(opened.ours, /новый пароль/);
  assert.match(opened.theirs, /5678/);
  assert.match(opened.base, /1234/);
  assert.deepEqual(opened.unreadable, []);

  const partial = await post('/api/git/resolve-note', { path: `notes/${NOTE}`, content: '<<<<<<< a\nx\n=======\ny\n>>>>>>> b\n' });
  assert.equal(partial.status, 409, 'частичный разбор защищённой заметки не принимается');

  const done = await (await post('/api/git/resolve-note', { path: `notes/${NOTE}`, content: 'Почта: новый пароль.\n\nБанк: 5678.\n' })).json();
  assert.equal(done.resolved, true);
  const text = fs.readFileSync(notePath, 'utf-8');
  assert.equal(isLockedNote(text), true);
  assert.doesNotMatch(text, /новый пароль|5678/, 'открытый текст не должен попасть на диск');
  assert.equal(unlockContent(text, PASS).plaintext, 'Почта: новый пароль.\n\nБанк: 5678.\n');
  const status = await (await fetch(`${base}/api/git/status`)).json();
  assert.notEqual(status.status, 'conflict');
});
