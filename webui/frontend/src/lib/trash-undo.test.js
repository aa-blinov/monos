import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { announceTrashed, dismissTrashedNotice, trashedNote, trashedNotice, undoTrash } from './trash-undo.js';
import { pinnedNotes } from './sidebar-pinned.js';

test('trashedNote запоминает имя без .md и закрепление', () => {
  pinnedNotes.set([{ path: 'notes/A.md', name: 'A' }]);
  assert.deepEqual(trashedNote('notes/A.md'), { path: 'notes/A.md', name: 'A', pinned: true });
  assert.deepEqual(trashedNote('notes/B.md', 'Бэ'), { path: 'notes/B.md', name: 'Бэ', pinned: false });
  assert.equal(trashedNote('notes/C.md', 'C.md').name, 'C');
  pinnedNotes.set([]);
});

test('уведомление: новое заменяет старое, закрытие по id не трогает более новое', () => {
  announceTrashed([{ path: 'notes/A.md', name: 'A', pinned: false }]);
  const first = get(trashedNotice);
  announceTrashed([{ path: 'notes/B.md', name: 'B', pinned: false }]);
  dismissTrashedNotice(first.id);
  assert.equal(get(trashedNotice).notes[0].path, 'notes/B.md');
  dismissTrashedNotice();
  assert.equal(get(trashedNotice), null);
  announceTrashed([]);
  assert.equal(get(trashedNotice), null);
});

test('undoTrash возвращает заметки и закрепляет снова только закреплённые', async () => {
  const calls = [];
  announceTrashed([{ path: 'notes/A.md', name: 'A', pinned: true }, { path: 'notes/B.md', name: 'B', pinned: false }]);
  const restored = await undoTrash(get(trashedNotice), {
    restore: async (path) => calls.push(['restore', path]),
    pin: async (path) => calls.push(['pin', path]),
  });
  assert.deepEqual(calls, [['restore', 'notes/A.md'], ['pin', 'notes/A.md'], ['restore', 'notes/B.md']]);
  assert.deepEqual(restored.map((note) => note.path), ['notes/A.md', 'notes/B.md']);
  assert.equal(get(trashedNotice), null);
});
