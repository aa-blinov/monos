import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import {
  clampSidebarWidth,
  defaultSidebarWidth,
  getInitialSidebarWidth,
  saveSidebarWidth,
  sidebarOpen,
  sidebarWidth,
  isResizingSidebar,
  toggleSidebar,
  setSidebarOpen,
  setSidebarWidth,
  SIDEBAR_CONSTANTS,
} from './sidebar.js';

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

function withStorage(initial, fn) {
  const prev = globalThis.localStorage;
  globalThis.localStorage = new MemoryStorage(initial);
  try {
    return fn();
  } finally {
    globalThis.localStorage = prev;
  }
}

test('clampSidebarWidth ограничивает min', () => {
  globalThis.window = { innerWidth: 1920 };
  // 0 трактуется как отсутствующее значение → default
  assert.equal(clampSidebarWidth(0), SIDEBAR_CONSTANTS.DEFAULT_WIDTH);
  // 100 ниже min → поднимается до MIN
  assert.equal(clampSidebarWidth(100), SIDEBAR_CONSTANTS.MIN_WIDTH);
  delete globalThis.window;
});

test('defaultSidebarWidth возвращает COMPACT для viewport 1200-1400', () => {
  globalThis.window = { innerWidth: 1300 };
  assert.equal(defaultSidebarWidth(), SIDEBAR_CONSTANTS.COMPACT_WIDTH);
  delete globalThis.window;
});

test('defaultSidebarWidth возвращает LAPTOP для viewport < 1200', () => {
  globalThis.window = { innerWidth: 1024 };
  assert.equal(defaultSidebarWidth(), SIDEBAR_CONSTANTS.LAPTOP_WIDTH);
  delete globalThis.window;
});

test('clampSidebarWidth ограничивает max по viewport', () => {
  globalThis.window = { innerWidth: 1000 };
  const max = clampSidebarWidth(10000);
  assert.ok(max <= SIDEBAR_CONSTANTS.MAX_WIDTH);
  assert.ok(max >= SIDEBAR_CONSTANTS.MIN_WIDTH);
  delete globalThis.window;
});

test('clampSidebarWidth округляет невалидное значение к default', () => {
  globalThis.window = { innerWidth: 1920 };
  const result = clampSidebarWidth('not-a-number');
  assert.ok(result >= SIDEBAR_CONSTANTS.MIN_WIDTH);
  delete globalThis.window;
});

test('getInitialSidebarWidth читает из localStorage', () => {
  withStorage({ sidebarWidth: '300' }, () => {
    globalThis.window = { innerWidth: 1920 };
    const width = getInitialSidebarWidth();
    assert.equal(width, 300);
    delete globalThis.window;
  });
});

test('getInitialSidebarWidth без localStorage использует default', () => {
  globalThis.window = undefined;
  const width = getInitialSidebarWidth();
  assert.equal(width, SIDEBAR_CONSTANTS.DEFAULT_WIDTH);
});

test('saveSidebarWidth пишет округлённое значение', () => {
  withStorage({}, () => {
    saveSidebarWidth(287.6);
    assert.equal(globalThis.localStorage.getItem('sidebarWidth'), '288');
  });
});

test('sidebar stores начинают с дефолтных значений', () => {
  assert.equal(get(sidebarOpen), true);
  assert.equal(get(isResizingSidebar), false);
  assert.ok(get(sidebarWidth) >= SIDEBAR_CONSTANTS.MIN_WIDTH);
});

test('toggleSidebar инвертирует open', () => {
  setSidebarOpen(true);
  assert.equal(get(sidebarOpen), true);
  toggleSidebar();
  assert.equal(get(sidebarOpen), false);
  toggleSidebar();
  assert.equal(get(sidebarOpen), true);
});

test('setSidebarOpen(false) закрывает', () => {
  setSidebarOpen(true);
  setSidebarOpen(false);
  assert.equal(get(sidebarOpen), false);
});

test('setSidebarWidth clamp и пишет', () => {
  setSidebarWidth(200);
  assert.ok(get(sidebarWidth) >= SIDEBAR_CONSTANTS.MIN_WIDTH);
  setSidebarWidth(99999);
  assert.ok(get(sidebarWidth) <= SIDEBAR_CONSTANTS.MAX_WIDTH);
});

test('isResizingSidebar реагирует на изменения', () => {
  isResizingSidebar.set(true);
  assert.equal(get(isResizingSidebar), true);
  isResizingSidebar.set(false);
  assert.equal(get(isResizingSidebar), false);
});
