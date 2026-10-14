import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import {
  addSavedSearch,
  loadSavedSearches,
  removeSavedSearch,
  renameSavedSearch,
  savedSearches,
} from './saved-searches.js';

const realFetch = globalThis.fetch;

// What the backend holds in the saved-searches file.
let saved;
let failWrites;
let writes;

beforeEach(() => {
  saved = [];
  failWrites = false;
  writes = [];
  savedSearches.set([]);
  globalThis.fetch = async (_url, options = {}) => {
    const body = (data, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
    if (options.method === 'PUT') {
      writes.push(JSON.parse(options.body));
      if (failWrites) return body({ detail: 'disk full' }, 500);
      saved = JSON.parse(options.body).searches;
      return body({ message: 'Saved' });
    }
    return body(saved);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test('добавленный запрос попадает в стор и на диск', async () => {
  const created = await addSavedSearch('Срочные', 'tag:urgent');
  assert.equal(created.name, 'Срочные');
  assert.equal(created.query, 'tag:urgent');
  assert.deepEqual(saved, [created]);
  assert.deepEqual(get(savedSearches), [created]);
});

test('повторное сохранение того же запроса переименовывает, а не дублирует', async () => {
  await addSavedSearch('Первое имя', 'path:Work');
  await addSavedSearch('Другое имя', 'path:Work');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'Другое имя');
});

test('пустой запрос не сохраняется и не пишет на диск', async () => {
  assert.equal(await addSavedSearch('Пусто', '   '), null);
  assert.equal(writes.length, 0);
});

test('если диск не принял запись, список возвращается к прежнему состоянию', async () => {
  await addSavedSearch('Первый', 'tag:a');
  failWrites = true;
  await assert.rejects(addSavedSearch('Второй', 'tag:b'));
  assert.deepEqual(get(savedSearches).map((item) => item.query), ['tag:a']);
});

test('переименование и удаление записывают новый список', async () => {
  const first = await addSavedSearch('A', 'tag:a');
  await renameSavedSearch(first.id, 'Renamed');
  assert.equal(saved[0].name, 'Renamed');
  await removeSavedSearch(first.id);
  assert.deepEqual(saved, []);
});

test('загрузка берёт список с диска', async () => {
  saved = [{ id: 'saved-1', name: 'Из файла', query: 'tag:file' }];
  await loadSavedSearches();
  assert.deepEqual(get(savedSearches), saved);
});
