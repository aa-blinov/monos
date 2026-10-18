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
    ? { initialized: true, status: 'conflict' }
    : [{ path: 'План поездки.md' }, { path: 'image.png' }, 'Работа/Встреча.md']));
  assert.deepEqual([...get(conflictedNotes)], ['notes/План поездки.md', 'notes/Работа/Встреча.md']);

  await refreshConflicts(async () => answer({ initialized: true, status: 'clean' }));
  assert.equal(get(conflictedNotes).size, 0);

  conflictedNotes.set(new Set(['notes/x.md']));
  await refreshConflicts(async () => { throw new Error('offline'); });
  assert.equal(get(conflictedNotes).size, 0);
});

test('gitConnected следует за статусом: кнопка синхронизации видна только при подключённом репозитории', async () => {
  await refreshConflicts(async () => answer({ initialized: true, status: 'clean', repo: 'me/notes' }));
  assert.equal(get(gitConnected), true);
  // A repository kept only for history has no remote: nothing to sync.
  await refreshConflicts(async () => answer({ initialized: true, status: 'clean' }));
  assert.equal(get(gitConnected), false);
  await refreshConflicts(async () => answer({ initialized: true, status: 'clean', remote: true }));
  assert.equal(get(gitConnected), true);
  await refreshConflicts(async () => answer({ initialized: false }));
  assert.equal(get(gitConnected), false);
});

test('сбой статуса или офлайн не прячут кнопку синхронизации: ответ без initialized ничего не говорит о подключении', async () => {
  await refreshConflicts(async () => answer({ initialized: true, status: 'clean', repo: 'me/notes' }));
  await refreshConflicts(async () => answer({ detail: 'index.lock exists' }));
  assert.equal(get(gitConnected), true);
  await refreshConflicts(async () => { throw new Error('offline'); });
  assert.equal(get(gitConnected), true);
});

test('noteSyncStatus: четыре состояния заметки против репозитория', async () => {
  const { noteSyncStatus } = await import('./git-conflicts.js');
  const state = (extra) => ({ connected: true, unsent: new Set(), incoming: new Set(), ...extra });
  assert.equal(noteSyncStatus({ connected: false }, 'notes/a.md'), 'none');
  assert.equal(noteSyncStatus(state(), 'notes/a.md'), 'synced');
  assert.equal(noteSyncStatus(state({ unsent: new Set(['a.md']) }), 'notes/a.md'), 'local');
  assert.equal(noteSyncStatus(state({ incoming: new Set(['Папка/б.md']) }), 'notes/Папка/б.md'), 'remote');
  assert.equal(noteSyncStatus(state({ unsent: new Set(['a.md']), incoming: new Set(['a.md']) }), 'notes/a.md'), 'both');
  assert.equal(noteSyncStatus(state({ unsent: new Set(['other.md']) }), 'notes/a.md'), 'synced');
});

test('сохранение сразу помечает заметку неотправленной, чтение статуса это подтверждает', async () => {
  const { markUnsent, syncState, noteSyncStatus, refreshConflicts: refresh } = await import('./git-conflicts.js');
  await refresh(async () => answer({ initialized: true, repo: 'me/notes', unsent: [], incoming: [], last_sync: '2026-10-18T10:00:00Z' }));
  assert.equal(noteSyncStatus(get(syncState), 'notes/x.md'), 'synced');
  markUnsent('notes/x.md');
  assert.equal(noteSyncStatus(get(syncState), 'notes/x.md'), 'local');
  await refresh(async () => answer({ initialized: true, repo: 'me/notes', unsent: ['x.md'], incoming: ['y.md'] }));
  assert.equal(noteSyncStatus(get(syncState), 'notes/x.md'), 'local');
  assert.equal(noteSyncStatus(get(syncState), 'notes/y.md'), 'remote');
});
