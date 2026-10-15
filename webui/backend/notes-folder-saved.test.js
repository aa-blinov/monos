import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// A folder chosen before the start: the app opens it, and the note paths keep their "notes/" form.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-saved-'));
const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-chosen-'));
fs.mkdirSync(path.join(tempRoot, '.data'), { recursive: true });
fs.writeFileSync(path.join(tempRoot, '.data', 'storage.json'), JSON.stringify({ notesFolder: vault }));
fs.writeFileSync(path.join(vault, 'Plan.md'), '# Plan\n\nВ выбранной папке.\n', 'utf-8');
process.env.NOTES_ROOT = tempRoot;

const { startServer, stopServer } = await import('./index.js');
const { NOTES_DIR } = await import('./config.js');
const { relPath, resolveNotesPath } = await import('./utils.js');
const { notesFolderState } = await import('./notes-folder.js');
const { port } = await startServer({ port: 0 });
after(() => stopServer());

test('заметки открываются из выбранной папки, пути остаются вида notes/…', async () => {
  assert.equal(NOTES_DIR, vault);
  assert.equal(relPath(path.join(vault, 'Plan.md')), 'notes/Plan.md');
  assert.equal(relPath(path.join(tempRoot, '.data', 'storage.json')), '.data/storage.json');
  assert.equal(resolveNotesPath('notes/Plan.md'), path.join(vault, 'Plan.md'));
  assert.throws(() => resolveNotesPath('Plan.md'), /Path must be inside notes/);
  assert.throws(() => resolveNotesPath('notes/../../escape.md'), /Path must be inside notes/);
});

test('сервер читает и индексирует заметку из выбранной папки', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/api/file?path=${encodeURIComponent('notes/Plan.md')}`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /В выбранной папке/);
});

test('состояние: открыта выбранная папка, перезапуск не нужен', () => {
  const state = notesFolderState();
  assert.equal(state.folder, vault);
  assert.equal(state.target, vault);
  assert.equal(state.restartRequired, false);
  assert.equal(state.unavailable, null);
});
