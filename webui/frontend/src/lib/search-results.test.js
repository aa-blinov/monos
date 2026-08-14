import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

class MemoryStorage {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
}

global.localStorage = new MemoryStorage();

const { runSearch } = await import('./search-results.js');
const { searchQuery, searchResults, isSearching } = await import('../stores.js');

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
  searchQuery.set('');
  searchResults.set([]);
  isSearching.set(false);
});

test('runSearch не делает fetch для пустого запроса', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return jsonResponse(200, []); };

  await runSearch('');

  assert.equal(called, false);
  assert.equal(get(isSearching), false);
});

test('runSearch записывает результаты в store', async () => {
  globalThis.fetch = async () => jsonResponse(200, [{ path: 'a.md' }, { path: 'b.md' }]);
  searchQuery.set('test');

  await runSearch('test');

  assert.equal(get(searchResults).length, 2);
  assert.equal(get(isSearching), false);
});

test('runSearch тримит пробелы', async () => {
  globalThis.fetch = async () => jsonResponse(200, []);
  searchQuery.set('hello');

  await runSearch('  hello  ');

  assert.equal(get(isSearching), false);
});

test('runSearch отбрасывает результаты, если запрос изменился', async () => {
  globalThis.fetch = async () => jsonResponse(200, [{ path: 'old.md' }]);

  const promise = runSearch('first');
  searchQuery.set('second');
  await promise;

  assert.deepEqual(get(searchResults), []);
});

test('runSearch обрабатывает HTTP error без crash', async () => {
  globalThis.fetch = async () => jsonResponse(500, { error: 'oops' });
  searchQuery.set('test');

  await runSearch('test');

  assert.deepEqual(get(searchResults), []);
  assert.equal(get(isSearching), false);
});

test('runSearch обрабатывает network error без crash', async () => {
  globalThis.fetch = async () => { throw new TypeError('NetworkError'); };
  searchQuery.set('test');

  await runSearch('test');

  assert.deepEqual(get(searchResults), []);
});
