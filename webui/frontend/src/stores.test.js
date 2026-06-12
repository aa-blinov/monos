import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

class MemoryStorage {
  constructor(initial = {}) {
    this.store = new Map(Object.entries(initial));
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }
}

global.localStorage = new MemoryStorage({
  editMode: 'source',
  theme: 'nord',
  fontFamily: 'Fira Code',
  fontSize: 'large',
  lineHeight: 'relaxed',
  contentWidth: 'wide',
  editorFontSize: 'small',
  noteView: 'board',
  boardColumns: '4',
});

const stores = await import('./stores.js');

function storesTest(name, fn) {
  test(name, { concurrency: false }, fn);
}

storesTest('stores читают стартовые значения из localStorage', () => {
  assert.equal(get(stores.editMode), 'source');
  assert.equal(get(stores.activeTheme), 'nord');
  assert.equal(get(stores.fontFamily), 'Fira Code');
  assert.equal(get(stores.fontSize), 'large');
  assert.equal(get(stores.lineHeight), 'relaxed');
  assert.equal(get(stores.contentWidth), 'wide');
  assert.equal(get(stores.editorFontSize), 'small');
  assert.equal(get(stores.noteView), 'board');
  assert.equal(get(stores.boardColumns), '4');
  assert.equal(get(stores.searchQuery), '');
  assert.deepEqual(get(stores.searchResults), []);
  assert.equal(get(stores.isSearching), false);
  assert.deepEqual(get(stores.editorState), { path: null, dirty: false, saving: false });
});

storesTest('stores сохраняют изменения обратно в localStorage', () => {
  stores.editMode.set('rich');
  stores.activeTheme.set('gruvbox');
  stores.fontFamily.set('JetBrains Mono');
  stores.fontSize.set('medium');
  stores.lineHeight.set('normal');
  stores.contentWidth.set('medium');
  stores.editorFontSize.set('large');
  stores.noteView.set('list');
  stores.boardColumns.set('2');

  assert.equal(global.localStorage.getItem('editMode'), 'rich');
  assert.equal(global.localStorage.getItem('theme'), 'gruvbox');
  assert.equal(global.localStorage.getItem('fontFamily'), 'JetBrains Mono');
  assert.equal(global.localStorage.getItem('fontSize'), 'medium');
  assert.equal(global.localStorage.getItem('lineHeight'), 'normal');
  assert.equal(global.localStorage.getItem('contentWidth'), 'medium');
  assert.equal(global.localStorage.getItem('editorFontSize'), 'large');
  assert.equal(global.localStorage.getItem('noteView'), 'list');
  assert.equal(global.localStorage.getItem('boardColumns'), '2');
});
