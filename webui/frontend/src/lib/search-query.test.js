import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { urlSearchQuery, searchUrlReady, restoredInitialUrlSearch, searchParamFromUrl, syncSearchUrl } from './search-query.js';

function withWindow(href, fn) {
  const prev = globalThis.window;
  globalThis.window = { location: { href, pathname: '/', search: '', hash: '' } };
  if (typeof window !== 'undefined') {
    window.history = { state: {}, replaceState: () => {} };
  }
  try {
    return fn();
  } finally {
    globalThis.window = prev;
  }
}

test('urlSearchQuery starts empty', () => {
  assert.equal(get(urlSearchQuery), '');
});

test('searchParamFromUrl читает q из текущего URL', () => {
  withWindow('https://example.com/?q=hello%20world', () => {
    assert.equal(searchParamFromUrl(), 'hello world');
  });
});

test('searchParamFromUrl возвращает пустую строку если q нет', () => {
  withWindow('https://example.com/', () => {
    assert.equal(searchParamFromUrl(), '');
  });
});

test('searchParamFromUrl возвращает пустую строку без window', () => {
  const prev = globalThis.window;
  delete globalThis.window;
  assert.equal(searchParamFromUrl(), '');
  globalThis.window = prev;
});

test('syncSearchUrl устанавливает q и обновляет store', () => {
  withWindow('https://example.com/', () => {
    syncSearchUrl('foo bar');
    assert.equal(get(urlSearchQuery), 'foo bar');
  });
});

test('syncSearchUrl удаляет q для пустой строки', () => {
  withWindow('https://example.com/?q=stale', () => {
    syncSearchUrl('');
    assert.equal(get(urlSearchQuery), '');
  });
});

test('syncSearchUrl тримит пробелы', () => {
  withWindow('https://example.com/', () => {
    syncSearchUrl('  spaced  ');
    assert.equal(get(urlSearchQuery), 'spaced');
  });
});
