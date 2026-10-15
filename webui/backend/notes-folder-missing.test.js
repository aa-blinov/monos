import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// A chosen folder that is gone (an unplugged drive): the app opens the default folder and says why.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-missing-'));
const gone = path.join(os.tmpdir(), `monos-gone-${process.pid}-${Date.now()}`);
fs.mkdirSync(path.join(tempRoot, '.data'), { recursive: true });
fs.writeFileSync(path.join(tempRoot, '.data', 'storage.json'), JSON.stringify({ notesFolder: gone }));
process.env.NOTES_ROOT = tempRoot;

const { startServer, stopServer } = await import('./index.js');
const { NOTES_DIR, DEFAULT_NOTES_DIR, UNAVAILABLE_NOTES_FOLDER } = await import('./config.js');
const { notesFolderState } = await import('./notes-folder.js');
const { port } = await startServer({ port: 0 });
after(() => stopServer());

test('недоступная папка: открыта папка по умолчанию, и состояние называет недоступную', async () => {
  assert.equal(NOTES_DIR, DEFAULT_NOTES_DIR);
  assert.equal(UNAVAILABLE_NOTES_FOLDER, gone);
  const state = notesFolderState();
  assert.equal(state.unavailable, gone);
  assert.equal(state.target, gone);
  assert.equal(state.restartRequired, true);
  const response = await fetch(`http://127.0.0.1:${port}/api/storage`);
  assert.equal((await response.json()).unavailable, gone);
});

test('сброс выбора убирает предупреждение о недоступной папке', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/api/storage/folder`, { method: 'DELETE' });
  const state = await response.json();
  assert.equal(state.unavailable, null);
  assert.equal(state.target, DEFAULT_NOTES_DIR);
  assert.equal(state.restartRequired, false);
});
