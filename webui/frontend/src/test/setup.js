import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/svelte';

class MemoryStorage {
  constructor() {
    this.store = new Map();
  }

  clear() {
    this.store.clear();
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

const storage = new MemoryStorage();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: storage,
});

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: storage,
});

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
});

beforeEach(async () => {
  storage.clear();
  storage.setItem('theme', 'gruvbox');
  storage.setItem('fontFamily', 'JetBrains Mono');
  storage.setItem('fontSize', 'medium');
  storage.setItem('lineHeight', 'normal');
  storage.setItem('contentWidth', 'wide');
  storage.setItem('contentWidthDefaultWide', 'true');
  storage.setItem('editorFontSize', 'md');

  const fetchMock = vi.fn();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
  document.body.innerHTML = '';
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  window.history.pushState({}, '', '/');

  const stores = await import('../stores.js');
  stores.activeTheme.set('gruvbox');
  stores.fontFamily.set('JetBrains Mono');
  stores.fontSize.set('medium');
  stores.lineHeight.set('normal');
  stores.contentWidth.set('wide');
  stores.editorFontSize.set('md');
  stores.searchQuery.set('');
  stores.searchResults.set([]);
  stores.isSearching.set(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
