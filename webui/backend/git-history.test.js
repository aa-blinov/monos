import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

// A temp root keeps every git side effect away from the real notes folder.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-gitpaths-'));
const notesDir = path.join(tempRoot, 'notes');
fs.mkdirSync(notesDir, { recursive: true });

process.env.NOTES_ROOT = tempRoot;

const { startServer, stopServer } = await import('./index.js');

let base;

// Two path conventions meet in these routes, and the frontend owns the split:
//   * Editor.svelte passes currentFile.path straight to resolve-note — the app
//     addresses notes from ROOT_DIR, so the path starts with "notes/".
//   * Editor.svelte strips that prefix before opening NoteHistoryModal, so the
//     history routes receive a NOTES_DIR-relative path.
// A route that guesses the wrong one looks for notes/notes/… and 404s.
const APP_PATH = 'notes/Папка/Заметка.md';
const UI_HISTORY_PATH = 'Папка/Заметка.md';
const V1 = 'Первая редакция абзаца.\n';
const V2 = 'Вторая редакция абзаца.\n';

function git(args) {
  return execFileSync('git', args, { cwd: notesDir, encoding: 'utf-8' }).trim();
}

function commit(message, content) {
  fs.writeFileSync(path.join(tempRoot, APP_PATH), content, 'utf-8');
  git(['add', '-A']);
  git(['commit', '-m', message]);
}

const history = () => fetch(`${base}/api/git/history?path=${encodeURIComponent(UI_HISTORY_PATH)}`);

test.before(async () => {
  const started = await startServer({ port: 0 });
  base = `http://127.0.0.1:${started.port}`;

  fs.mkdirSync(path.dirname(path.join(tempRoot, APP_PATH)), { recursive: true });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'test@monos.local']);
  git(['config', 'user.name', 'Monos Test']);
  commit('Первая версия', V1);
  commit('Вторая версия', V2);
});

test.after(async () => {
  await stopServer();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('history принимает путь без префикса notes — как его шлёт модалка', async () => {
  const res = await history();
  const body = await res.json();

  assert.equal(res.status, 200, `ожидали 200, получили ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.tracked, true);
  assert.equal(body.revisions.length, 2, 'обе ревизии должны быть видны');
  assert.equal(body.revisions[0].message, 'Вторая версия', 'новейшая ревизия первой');
});

test('history/content показывает дифф по тому же пути', async () => {
  const { revisions } = await (await history()).json();
  const oldest = revisions[revisions.length - 1].sha;

  const res = await fetch(
    `${base}/api/git/history/content?path=${encodeURIComponent(UI_HISTORY_PATH)}&sha=${oldest}`,
  );
  const body = await res.json();

  assert.equal(res.status, 200, `ожидали 200, получили ${res.status}: ${JSON.stringify(body)}`);
  assert.equal(body.changed, true);
  assert.match(body.diff, /^-Первая редакция абзаца\./m);
  assert.match(body.diff, /^\+Вторая редакция абзаца\./m);
});

test('restore возвращает заметку к выбранной версии', async () => {
  const { revisions } = await (await history()).json();
  const oldest = revisions[revisions.length - 1].sha;

  const res = await fetch(`${base}/api/git/history/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: UI_HISTORY_PATH, sha: oldest }),
  });
  assert.equal(res.status, 200, `ожидали 200, получили ${res.status}: ${await res.text()}`);

  const restored = fs.readFileSync(path.join(tempRoot, APP_PATH), 'utf-8');
  assert.equal(restored, V1, 'откат должен вернуть текст выбранной ревизии');
});

test('resolve-note принимает путь с префиксом notes — как его шлёт редактор', async () => {
  const res = await fetch(`${base}/api/git/resolve-note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: APP_PATH, content: V2 }),
  });
  const body = await res.json();

  // 409 means the route found the note and correctly reported that there is no
  // unresolved merge. A 404 "Note not found" is the bug this test guards.
  assert.equal(res.status, 409, `ожидали 409, получили ${res.status}: ${JSON.stringify(body)}`);
});

test('маршруты отклоняют выход за пределы notes', async () => {
  // `notes/../x` нормализуется в путь без `..` и уходит в NOTES_DIR — там
  // файла нет, и 404 «Note not found» здесь и есть отказ. `notes/../../x`
  // сохраняет `..` и отсекается фильтром до 400.
  for (const escape of ['notes/../секрет.md', 'notes/../../etc/passwd']) {
    const res = await fetch(`${base}/api/git/history?path=${encodeURIComponent(escape)}`);
    assert.ok(
      [400, 403, 404].includes(res.status),
      `${escape} должен быть отклонён, получен ${res.status}: ${await res.text()}`,
    );
  }

  // Здесь база — ROOT_DIR, поэтому `..` может увести за пределы notes.
  for (const escape of ['notes/../секрет.md', 'notes/../../etc/passwd']) {
    const res = await fetch(`${base}/api/git/resolve-note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: escape, content: 'x' }),
    });
    assert.ok(
      [400, 403].includes(res.status),
      `${escape} должен быть отклонён, получен ${res.status}: ${await res.text()}`,
    );
    assert.notEqual(res.status, 404, 'отказ должен быть отказом, а не «файл не найден»');
  }
});