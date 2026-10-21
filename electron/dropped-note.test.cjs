const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveDroppedNote } = require('./dropped-note.cjs');

const notesDir = '/Users/person/MonosData/notes';

test('заметка из папки заметок открывается', () => {
  const result = resolveDroppedNote(notesDir, path.join(notesDir, 'Work', 'Alpha.md'));
  assert.deepEqual(result, { ok: true, path: 'notes/Work/Alpha.md' });
});

test('текстовая заметка открывается', () => {
  const result = resolveDroppedNote(notesDir, path.join(notesDir, 'Notes.txt'));
  assert.deepEqual(result, { ok: true, path: 'notes/Notes.txt' });
});

test('файл вне папки заметок не открывается', () => {
  const result = resolveDroppedNote(notesDir, '/Users/person/Downloads/Alpha.md');
  assert.deepEqual(result, { ok: false, code: 'outside-notes' });
});

test('файл, назвавшийся как заметка, но лежащий выше папки, не открывается', () => {
  const result = resolveDroppedNote(notesDir, '/Users/person/MonosData/Alpha.md');
  assert.deepEqual(result, { ok: false, code: 'outside-notes' });
});

test('не заметка не открывается', () => {
  const result = resolveDroppedNote(notesDir, path.join(notesDir, 'Work', 'photo.png'));
  assert.deepEqual(result, { ok: false, code: 'not-a-note' });
});

test('путь ведущий вверх не проходит проверкой папки', () => {
  const result = resolveDroppedNote(notesDir, path.join(notesDir, '..', '..', 'Escape.md'));
  assert.equal(result.ok, false);
  assert.equal(result.code, 'outside-notes');
});

test('пустой путь не открывается', () => {
  assert.deepEqual(resolveDroppedNote(notesDir, ''), { ok: false, code: 'not-a-note' });
});

test('путь через ссылку на ту же папку открывается', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-drop-'));
  const notes = path.join(folder, 'notes');
  fs.mkdirSync(notes);
  const file = path.join(notes, 'Alpha.md');
  fs.writeFileSync(file, '# Alpha\n');
  // The system gives the file by the path it knows: the link, not the folder behind it.
  const linked = path.join(fs.realpathSync(folder), 'notes', 'Alpha.md');
  assert.deepEqual(resolveDroppedNote(notes, linked), { ok: true, path: 'notes/Alpha.md' });
  fs.rmSync(folder, { recursive: true, force: true });
});
