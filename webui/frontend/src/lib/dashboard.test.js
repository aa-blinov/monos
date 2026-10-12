import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { homeRecentNotes, homeRecentHasMore, homeRecentLoading, homeRecentError, loadHomeRecentNotes } from './dashboard.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test.beforeEach(() => {
  homeRecentNotes.set([]);
  homeRecentHasMore.set(true);
  homeRecentLoading.set(false);
  homeRecentError.set(null);
});

test('loadHomeRecentNotes загружает заметки и обновляет store', async () => {
  globalThis.fetch = async () => jsonResponse(200, [
    { path: 'a.md', name: 'A' },
    { path: 'b.md', name: 'B' },
  ]);

  await loadHomeRecentNotes();

  assert.equal(get(homeRecentNotes).length, 2);
  assert.equal(get(homeRecentHasMore), false);
  assert.equal(get(homeRecentLoading), false);
});

test('loadHomeRecentNotes ставит hasMore=true если вернулась полная страница', async () => {
  const fullPage = Array.from({ length: 36 }, (_, i) => ({ path: `n${i}.md`, name: `N${i}` }));
  globalThis.fetch = async () => jsonResponse(200, fullPage);

  await loadHomeRecentNotes();

  assert.equal(get(homeRecentHasMore), true);
});

test('loadHomeRecentNotes с append дописывает новые заметки', async () => {
  homeRecentNotes.set([{ path: 'a.md', name: 'A' }]);
  globalThis.fetch = async () => jsonResponse(200, [
    { path: 'a.md', name: 'A' },
    { path: 'b.md', name: 'B' },
  ]);

  await loadHomeRecentNotes({ append: true });

  const notes = get(homeRecentNotes);
  assert.equal(notes.length, 2);
  assert.equal(notes[0].path, 'a.md');
  assert.equal(notes[1].path, 'b.md');
});

test('loadHomeRecentNotes дедуплицирует при append', async () => {
  homeRecentNotes.set([
    { path: 'a.md', name: 'A' },
    { path: 'b.md', name: 'B' },
  ]);
  globalThis.fetch = async () => jsonResponse(200, [
    { path: 'a.md', name: 'A' },
    { path: 'b.md', name: 'B' },
    { path: 'c.md', name: 'C' },
  ]);

  await loadHomeRecentNotes({ append: true });

  const notes = get(homeRecentNotes);
  assert.equal(notes.length, 3);
  assert.equal(notes[2].path, 'c.md');
});

test('loadHomeRecentNotes защищён от параллельных вызовов', async () => {
  let calls = 0;
  homeRecentLoading.set(true);
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse(200, []);
  };

  await loadHomeRecentNotes();
  assert.equal(calls, 0, 'fetch не должен вызываться, если loading=true');
  homeRecentLoading.set(false);
});

test('loadHomeRecentNotes обрабатывает HTTP ошибку без crash', async () => {
  globalThis.fetch = async () => jsonResponse(500, { error: 'internal' });

  await loadHomeRecentNotes();

  assert.equal(get(homeRecentNotes).length, 0);
  assert.equal(get(homeRecentLoading), false);
});

test('loadHomeRecentNotes сохраняет ошибку для показа в UI', async () => {
  globalThis.fetch = async () => jsonResponse(500, { error: 'internal' });

  await loadHomeRecentNotes();

  assert.ok(get(homeRecentError), 'ошибка загрузки должна попасть в homeRecentError');
});

test('loadHomeRecentNotes очищает ошибку после успешной загрузки', async () => {
  globalThis.fetch = async () => jsonResponse(500, { error: 'internal' });
  await loadHomeRecentNotes();
  assert.ok(get(homeRecentError));

  globalThis.fetch = async () => jsonResponse(200, [{ path: 'a.md', name: 'A' }]);
  await loadHomeRecentNotes();

  assert.equal(get(homeRecentError), null);
  assert.equal(get(homeRecentNotes).length, 1);
});

test('loadHomeRecentNotes обрабатывает не-массив ответ', async () => {
  globalThis.fetch = async () => jsonResponse(200, { unexpected: 'shape' });

  await loadHomeRecentNotes();

  assert.deepEqual(get(homeRecentNotes), []);
});
