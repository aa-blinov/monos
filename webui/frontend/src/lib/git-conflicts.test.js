import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { conflictNotePath, conflictedNotes, gitConnected, refreshConflicts } from './git-conflicts.js';

const answer = (data) => ({ ok: true, async json() { return data; } });

test('conflictNotePath приводит путь сервера к пути заметки', () => {
  assert.equal(conflictNotePath('План поездки.md'), 'notes/План поездки.md');
  assert.equal(conflictNotePath('notes/Работа/План.md'), 'notes/Работа/План.md');
  assert.equal(conflictNotePath(''), '');
});

test('refreshConflicts: конфликтные заметки при статусе conflict, пусто без него и без сети', async () => {
  await refreshConflicts(async (url) => answer(url === '/api/git/status'
    ? { status: 'conflict' }
    : [{ path: 'План поездки.md' }, { path: 'image.png' }, 'Работа/Встреча.md']));
  assert.deepEqual([...get(conflictedNotes)], ['notes/План поездки.md', 'notes/Работа/Встреча.md']);

  await refreshConflicts(async () => answer({ status: 'clean' }));
  assert.equal(get(conflictedNotes).size, 0);

  conflictedNotes.set(new Set(['notes/x.md']));
  await refreshConflicts(async () => { throw new Error('offline'); });
  assert.equal(get(conflictedNotes).size, 0);
});

test('gitConnected следует за статусом: кнопка синхронизации видна только при подключённом репозитории', async () => {
  await refreshConflicts(async () => answer({ initialized: true, status: 'clean' }));
  assert.equal(get(gitConnected), true);
  await refreshConflicts(async () => answer({ initialized: false }));
  assert.equal(get(gitConnected), false);
});
