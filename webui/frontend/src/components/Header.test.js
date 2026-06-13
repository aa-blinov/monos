import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Header from './Header.svelte';
import { locale, uiText } from '../lib/strings.js';
import { isSearching, searchQuery, searchResults } from '../stores.js';

function jsonResponse(data, ok = true) {
  return {
    ok,
    async json() {
      return data;
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  locale.set('en');
  searchQuery.set('');
  searchResults.set([]);
  isSearching.set(false);
});

afterEach(() => {
  vi.useRealTimers();
});

test('Header показывает поиск, грузит теги и запускает поиск по таймеру', async () => {
  const fetchMock = vi.fn(async (url, init = {}) => {
    if (url === '/api/tags') {
      return jsonResponse(['alpha', 'beta']);
    }

    if (url === '/api/search' && init.method === 'POST') {
      return jsonResponse([
        { path: 'notes/Alpha.md', name: 'Alpha', excerpt: 'alpha result' },
      ]);
    }

    return jsonResponse({}, false);
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Header);

  const input = screen.getByPlaceholderText(uiText.header.search);
  await fireEvent.input(input, { target: { value: '#alp' } });
  await fireEvent.focus(input);
  await waitFor(() => expect(screen.getByText('#alpha')).toBeTruthy());

  await fireEvent.click(screen.getByText('#alpha'));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/search', expect.objectContaining({
    method: 'POST',
  })));

  const searchCall = fetchMock.mock.calls.find(([url]) => url === '/api/search');
  expect(JSON.parse(searchCall[1].body)).toEqual({
    query: '#alpha ',
    search_content: true,
  });
  expect(get(searchResults)).toEqual([
    { path: 'notes/Alpha.md', name: 'Alpha', excerpt: 'alpha result' },
  ]);
  expect(get(isSearching)).toBe(false);
});

test('Header выполняет обычный поиск по вводу и очищает состояние по Escape', async () => {
  const fetchMock = vi.fn(async (url, init = {}) => {
    if (url === '/api/tags') {
      return jsonResponse(['alpha']);
    }

    if (url === '/api/search' && init.method === 'POST') {
      return jsonResponse([
        { path: 'notes/Beta.md', name: 'Beta', excerpt: 'beta result' },
      ]);
    }

    return jsonResponse({}, false);
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Header);

  const input = screen.getByPlaceholderText(uiText.header.search);
  await fireEvent.input(input, { target: { value: 'beta' } });

  await vi.advanceTimersByTimeAsync(300);
  await waitFor(() => expect(get(searchResults)).toEqual([
    { path: 'notes/Beta.md', name: 'Beta', excerpt: 'beta result' },
  ]));
  expect(get(searchQuery)).toBe('beta');

  await fireEvent.keyDown(input, { key: 'Escape' });
  expect(input.value).toBe('');
  expect(get(searchQuery)).toBe('');
  expect(get(searchResults)).toEqual([]);
});

test('Header показывает восстановленный запрос', () => {
  searchQuery.set('alpha body');

  render(Header);

  const input = screen.getByPlaceholderText(uiText.header.search);
  expect(input.value).toBe('alpha body');
});

test('Header растягивает поиск и показывает quick note справа', async () => {
  const { component } = render(Header);
  const quickNoteHandler = vi.fn();
  component.$on('createQuickNote', quickNoteHandler);

  const header = screen.getByRole('banner');
  expect(header.className).toContain('lg:px-4');
  expect(header.className).not.toContain('lg:pr-8');
  const input = screen.getByPlaceholderText(uiText.header.search);
  expect(input.parentElement.className).toContain('flex-1');
  expect(input.parentElement.className).not.toContain('max-w-xl');
  expect(screen.queryByText('Quick')).toBeNull();

  await fireEvent.click(screen.getByRole('button', { name: uiText.sidebar.quickNoteFromClipboard }));
  expect(quickNoteHandler).toHaveBeenCalledTimes(1);
});

test('Header не даёт старому поисковому ответу перезаписать новый', async () => {
  const alpha = deferred();
  const beta = deferred();

  const fetchMock = vi.fn((url, init = {}) => {
    if (url === '/api/tags') {
      return Promise.resolve(jsonResponse([]));
    }

    if (url === '/api/search' && init.method === 'POST') {
      const { query } = JSON.parse(init.body);
      if (query === 'alpha') return alpha.promise;
      if (query === 'beta') return beta.promise;
    }

    return Promise.resolve(jsonResponse({}, false));
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Header);

  const input = screen.getByPlaceholderText(uiText.header.search);

  await fireEvent.input(input, { target: { value: 'alpha' } });
  await vi.advanceTimersByTimeAsync(300);
  await flushPromises();
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/search')).toHaveLength(1);

  await fireEvent.input(input, { target: { value: 'beta' } });
  await vi.advanceTimersByTimeAsync(300);
  await flushPromises();
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/search')).toHaveLength(2);

  beta.resolve(jsonResponse([
    { path: 'notes/Beta.md', name: 'Beta', excerpt: 'new result' },
  ]));
  await flushPromises();
  expect(get(searchResults)).toEqual([
    { path: 'notes/Beta.md', name: 'Beta', excerpt: 'new result' },
  ]);

  alpha.resolve(jsonResponse([
    { path: 'notes/Alpha.md', name: 'Alpha', excerpt: 'old result' },
  ]));
  await flushPromises();

  expect(get(searchQuery)).toBe('beta');
  expect(get(searchResults)).toEqual([
    { path: 'notes/Beta.md', name: 'Beta', excerpt: 'new result' },
  ]);
  expect(get(isSearching)).toBe(false);
});

test('Header диспатчит toggleSidebar', async () => {
  const { component } = render(Header);
  const sidebarHandler = vi.fn();
  component.$on('toggleSidebar', sidebarHandler);

  await fireEvent.click(screen.getByRole('button', { name: uiText.header.openSidebar }));
  expect(sidebarHandler).toHaveBeenCalledTimes(1);
});

test('Header показывает стрелку назад из открытой заметки на desktop', async () => {
  const { component } = render(Header, { noteOpen: true, showBack: true, showSearch: false });
  const homeHandler = vi.fn();
  const sidebarHandler = vi.fn();
  component.$on('goHome', homeHandler);
  component.$on('toggleSidebar', sidebarHandler);

  await fireEvent.click(screen.getByRole('button', { name: uiText.header.back }));
  expect(homeHandler).toHaveBeenCalledTimes(1);
  await fireEvent.click(screen.getByRole('button', { name: uiText.header.openSidebar }));
  expect(sidebarHandler).toHaveBeenCalledTimes(1);
});

test('Header показывает действие закрытия панели, когда сайдбар открыт', async () => {
  const { component } = render(Header, { showBack: true, showSearch: false, sidebarOpen: true });
  const sidebarHandler = vi.fn();
  component.$on('toggleSidebar', sidebarHandler);

  await fireEvent.click(screen.getByRole('button', { name: uiText.header.closeSidebar }));
  expect(sidebarHandler).toHaveBeenCalledTimes(1);
});
