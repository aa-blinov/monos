import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { navigate } from 'svelte-routing';
import { locale, uiText } from './lib/strings.js';
import { activeTheme, editMode, isSearching, noteView, searchQuery, searchResults } from './stores.js';

vi.mock('./components/Header.svelte', async () => ({
  default: (await import('./components/__mocks__/HeaderStub.svelte')).default,
}));

vi.mock('./components/Sidebar.svelte', async () => ({
  default: (await import('./components/__mocks__/SidebarStub.svelte')).default,
}));

vi.mock('./components/NotePage.svelte', async () => ({
  default: (await import('./components/__mocks__/NotePageStub.svelte')).default,
}));

vi.mock('./components/Settings.svelte', async () => ({
  default: (await import('./components/__mocks__/SettingsStub.svelte')).default,
}));

function jsonResponse(data, ok = true) {
  return {
    ok,
    async json() {
      return data;
    },
  };
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
  window.history.pushState({}, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
  navigate('/', { replace: true });
  localStorage.clear();
  locale.set('en');
  searchQuery.set('');
  searchResults.set([]);
  isSearching.set(false);
  activeTheme.set('gruvbox');
  editMode.set('source');
  noteView.set('list');

  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.endsWith('/api/search') && init.method === 'POST') {
      return jsonResponse([
        { path: 'notes/Work/Alpha.md', name: 'Alpha', excerpt: 'alpha body and more text' },
      ]);
    }
    if (url.endsWith('/api/settings')) {
      return jsonResponse({ theme: 'gruvbox', editMode: 'source' });
    }
    if (url.endsWith('/api/tree')) {
      return jsonResponse({
        path: 'notes',
        name: 'notes',
        is_dir: true,
        children: [
          {
            path: 'notes/Work/Alpha.md',
            name: 'Alpha.md',
            is_dir: false,
            children: [],
            metadata: { title: 'Alpha Note' },
          },
        ],
      });
    }
    if (url.endsWith('/api/notes/recent?limit=36&offset=0')) {
      return jsonResponse([
        { path: 'notes/Work/Recent.md', name: 'Recent Note' },
      ]);
    }
    if (url.endsWith('/api/notes/create') && init.method === 'POST') {
      const body = JSON.parse(init.body || '{}');
      const fileName = (body.title || 'Untitled').replace(/[/\\?%*:|"<>]/g, '_') + '.md';
      const dirPath = body.category ? `${body.category}` : '';
      const fullPath = dirPath ? `${dirPath}/${fileName}` : fileName;
      return jsonResponse({ path: fullPath, name: fileName, isDir: false });
    }
    return jsonResponse({}, false);
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
});

afterEach(() => {
  cleanup();
});

test('App загружает shell главной страницы', async () => {
  const { default: App } = await import('./App.svelte');
  render(App);

  expect(screen.getByTestId('header-stub')).toBeTruthy();
  expect(document.documentElement.classList.contains('dark')).toBe(false);
}, 20000);

test('App показывает результаты поиска и открывает заметку по клику', async () => {
  const { default: App } = await import('./App.svelte');
  searchQuery.set('alpha body');
  searchResults.set([
    {
      path: 'notes/Work/Alpha.md',
      name: 'Alpha',
      excerpt: 'alpha body and more text',
    },
  ]);

  render(App);

  await waitFor(() => expect(screen.getAllByText('Work/Alpha.md').length).toBeGreaterThan(0));

  await fireEvent.click(screen.getAllByText('Work/Alpha.md').at(-1).closest('button'));
  await waitFor(() => expect(screen.getByRole('button', { name: uiText.app.board.openFull })).toBeTruthy());
  await fireEvent.click(screen.getByRole('button', { name: uiText.app.board.openFull }));

  await waitFor(() => expect(window.location.pathname).toBe('/notes/Work/Alpha.md'));
  expect(window.location.pathname).toBe('/notes/Work/Alpha.md');
  expect(screen.queryAllByText('Alpha')).toHaveLength(0);
});

test('App восстанавливает глобальный поиск из URL после обновления страницы', async () => {
  window.history.pushState({}, '', '/?q=alpha%20body');
  window.dispatchEvent(new PopStateEvent('popstate'));

  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy());
  expect(get(searchQuery)).toBe('alpha body');
  expect(fetch).toHaveBeenCalledWith('/api/search', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ query: 'alpha body', search_content: true }),
  }));
  expect(new URLSearchParams(window.location.search).get('q')).toBe('alpha body');
});

test('App открывает экран настроек и заметку из сайдбара', async () => {
  const { default: App } = await import('./App.svelte');
  render(App);

  await fireEvent.click(screen.getByText('open settings'));
  await waitFor(() => expect(window.location.pathname).toBe('/settings'));

  await fireEvent.click(screen.getByText('sidebar navigate'));
  await waitFor(() => expect(window.location.pathname).toBe('/notes/FromSidebar.md'));
});

test('App возвращается на главную по клику на логотип', async () => {
  const { default: App } = await import('./App.svelte');
  render(App);

  await fireEvent.click(screen.getByText('sidebar navigate'));
  await waitFor(() => expect(window.location.pathname).toBe('/notes/FromSidebar.md'));

  await fireEvent.click(screen.getByText('go home'));
  await waitFor(() => expect(window.location.pathname).toBe('/'));
  expect(screen.getByText(uiText.app.homeActions.newNote)).toBeTruthy();
});

test('App раскрывает сайдбар и подсвечивает заметку по revealInTree', async () => {
  window.history.pushState({}, '', '/notes/FromSidebar.md');
  window.dispatchEvent(new PopStateEvent('popstate'));
  navigate('/notes/FromSidebar.md', { replace: true });

  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(screen.getByTestId('note-page-stub')).toBeTruthy());
  await fireEvent.click(screen.getByText('close sidebar'));

  await fireEvent.click(screen.getByText('reveal in tree'));

  await waitFor(() => expect(screen.getByText('selected:notes/FromSidebar.md')).toBeTruthy());
});

test('App позволяет открыть сайдбар в board view через кнопку Header', async () => {
  noteView.set('board');

  const { default: App } = await import('./App.svelte');
  render(App);

  const sidebar = await waitFor(() => screen.getByTestId('sidebar-stub'));
  const sidebarShell = sidebar.parentElement;
  expect(sidebarShell.style.width).toBe('304px');

  await fireEvent.click(screen.getByText('toggle sidebar'));
  await waitFor(() => expect(sidebarShell.className).toContain('w-0'));

  await fireEvent.click(screen.getByText('toggle sidebar'));
  await waitFor(() => expect(sidebarShell.style.width).toBe('304px'));
});

test('App открывает command palette и quick switcher по типовым shortcuts', async () => {
  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(screen.getByTestId('header-stub')).toBeTruthy());
  await fireEvent.keyDown(window, { key: 'k', metaKey: true });
  await waitFor(() => expect(screen.getByPlaceholderText(uiText.commandPalette.placeholder)).toBeTruthy());
  await fireEvent.click(screen.getByText(uiText.commandPalette.commands.openSettings));
  await waitFor(() => expect(window.location.pathname).toBe('/settings'));

  await fireEvent.keyDown(window, { key: 'o', metaKey: true });
  await waitFor(() => expect(screen.getByPlaceholderText(uiText.commandPalette.quickSwitcherPlaceholder)).toBeTruthy());
  await waitFor(() => expect(screen.getByText('Alpha Note')).toBeTruthy());
  await fireEvent.click(screen.getByText('Alpha Note'));

  await waitFor(() => expect(window.location.pathname).toBe('/notes/Work/Alpha.md'));
});

test('App показывает центральные действия на главной', async () => {
  noteView.set('board');
  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(screen.getByRole('heading', { name: uiText.app.board.title })).toBeTruthy());
  expect(screen.getByText(uiText.app.homeActions.newNote)).toBeTruthy();
  expect(screen.queryByText(uiText.app.homeActions.today)).toBeNull();

  await fireEvent.click(screen.getByRole('button', { name: /\+ New note/ }));
  await waitFor(() => expect(screen.getByLabelText(uiText.sidebar.modals.title)).toBeTruthy());
});

test('App создаёт today note из центрального действия', async () => {
  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(screen.getByText(uiText.app.homeActions.today)).toBeTruthy());
  await fireEvent.click(screen.getByText(uiText.app.homeActions.today));

  await waitFor(() => expect(window.location.pathname).toMatch(/^\/notes\/Daily\/\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.md$/));
});

test('App позволяет менять ширину сайдбара на desktop', async () => {
  const { default: App } = await import('./App.svelte');
  render(App);

  const resizer = await waitFor(() => screen.getByRole('button', {
    name: uiText.app.resizeSidebar,
  }));

  expect(localStorage.getItem('sidebarWidth')).toBeNull();

  await fireEvent.keyDown(resizer, { key: 'ArrowRight' });
  expect(localStorage.getItem('sidebarWidth')).toBe('320');

  await fireEvent.keyDown(resizer, { key: 'Enter' });
  expect(localStorage.getItem('sidebarWidth')).toBe('304');
});
