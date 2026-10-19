import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// A note the app cannot read must not stop the start. The notes are indexed once; then one of them loses its read
// permission and the app starts again. The start goes on: the readable notes are indexed again, the unreadable one
// keeps its old row and is named in the notes folder state and in a console warning.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-unreadable-'));
const notesDir = path.join(tempRoot, 'notes');
const blocked = path.join(notesDir, 'Blocked.md');
fs.mkdirSync(notesDir, { recursive: true });
fs.writeFileSync(path.join(notesDir, 'Первая.md'), '# Первая\n\nпро яблоки\n', 'utf-8');
fs.writeFileSync(path.join(notesDir, 'Вторая.md'), '# Вторая\n\nпро груши\n', 'utf-8');
fs.writeFileSync(blocked, '---\ntitle: "Blocked Title"\n---\n\nпро рыбалку\n', 'utf-8');
process.env.NOTES_ROOT = tempRoot;

const { startServer, stopServer } = await import('./index.js');
const { getDb } = await import('./database.js');

after(async () => {
  await stopServer();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

const canRead = (file) => {
  try {
    fs.readFileSync(file);
    return true;
  } catch {
    return false;
  }
};
const indexedRow = (relative) => getDb().prepare('SELECT * FROM notes_index WHERE path = ?').get(`notes/${relative}`);

test('нечитаемая заметка не останавливает старт: остальные обновлены, а её называет состояние папки', async (t) => {
  await startServer({ port: 0 });
  assert.equal(indexedRow('Blocked.md').title, 'Blocked Title');
  await stopServer();

  fs.writeFileSync(path.join(notesDir, 'Первая.md'), '# Первая\n\nпро бананы\n', 'utf-8');
  fs.chmodSync(blocked, 0o000);
  try {
    if (canRead(blocked)) {
      t.skip('права не закрывают чтение: root или Windows');
      return;
    }
    const warn = t.mock.method(console, 'warn', () => {});
    const { port } = await startServer({ port: 0 });

    assert.match(indexedRow('Первая.md').content, /бананы/);
    assert.match(indexedRow('Вторая.md').content, /груши/);
    assert.equal(indexedRow('Blocked.md').title, 'Blocked Title', 'прежняя строка остаётся');
    const state = await (await fetch(`http://127.0.0.1:${port}/api/storage`)).json();
    assert.deepEqual(state.unreadable, ['Blocked.md']);
    assert.ok(warn.mock.calls.some((call) => String(call.arguments[0]).includes('Blocked.md')));
  } finally {
    fs.chmodSync(blocked, 0o644);
  }
});
