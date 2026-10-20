import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { tick } from 'svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { navigate } from 'svelte-routing';
import { locale, uiText } from './lib/strings.js';
import { activeTheme, themeMode, isSearching, noteSaveSignal, noteView, searchQuery, searchResults, editorAction } from './stores.js';
import { homeRecentNotes, homeRecentError, homeRecentLoading } from './lib/dashboard.js';

// The board loads its notes when the app opens. A load already running ignores a second one and its answer
// replaces the board, so a test acts on the board only after that first load has landed.
async function boardLoaded() {
  await waitFor(() => {
    expect(globalThis.fetch.mock.calls.some(([url]) => String(url).includes('/api/notes/recent'))).toBe(true);
    expect(get(homeRecentLoading)).toBe(false);
  });
}

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

vi.mock('./components/TrashView.svelte', async () => ({
  default: (await import('./components/__mocks__/TrashViewStub.svelte')).default,
}));

vi.mock('./components/TemplateManager.svelte', async () => ({
  default: (await import('./components/__mocks__/TemplateManagerStub.svelte')).default,
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
  sessionStorage.clear();
  locale.set('en');
  searchQuery.set('');
  searchResults.set([]);
  isSearching.set(false);
  noteSaveSignal.set(null);
  activeTheme.set('gruvbox');
  themeMode.set('system');
  noteView.set('list');

  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.endsWith('/api/search') && init.method === 'POST') {
      return jsonResponse([
        { path: 'notes/Work/Alpha.md', name: 'Alpha', excerpt: 'alpha body and more text' },
      ]);
    }
    if (url.endsWith('/api/settings')) {
      return jsonResponse({ theme: 'gruvbox' });
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
    if (url.endsWith('/api/notes/recent?limit=36&offset=0&sort=modified')) {
      return jsonResponse([
        { path: 'notes/Work/Recent.md', name: 'Recent Note', excerpt: 'Recent excerpt' },
      ]);
    }
    if (url.endsWith('/api/file?path=notes%2FWork%2FRecent.md')) {
      return jsonResponse({ content: 'Recent body' });
    }
    if (url.endsWith('/api/notes/create') && init.method === 'POST') {
      const body = JSON.parse(init.body || '{}');
      const fileName = (body.title || 'Untitled').replace(/[/\\?%*:|"<>]/g, '_') + '.md';
      const dirPath = body.category ? `${body.category}` : '';
      const fullPath = dirPath ? `${dirPath}/${fileName}` : fileName;
      return jsonResponse({ path: `notes/${fullPath}`, name: fileName, isDir: false });
    }
    return jsonResponse({}, false);
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
});

afterEach(() => {
  cleanup();
  delete window.monosMenu;
});

test('App выполняет команду меню «Сохранить»', async () => {
  let command = null;
  window.monosMenu = { setLocale: vi.fn(), setState: vi.fn(), onCommand: (cb) => { command = cb; return () => {}; } };
  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(typeof command).toBe('function'));
  command('save');
  await waitFor(() => expect(get(editorAction)).toBe('save'));
}, 20000);

test('App закрывает заметку по ⌘W и открывает недавнюю из меню', async () => {
  let command = null;
  window.monosMenu = { setLocale: vi.fn(), setState: vi.fn(), onCommand: (cb) => { command = cb; return () => {}; } };
  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(typeof command).toBe('function'));
  command('open-recent', { path: 'notes/Work/Alpha.md', name: 'Alpha' });
  await waitFor(() => expect(window.location.pathname).toContain('Work/Alpha'));

  command('close-note');
  await waitFor(() => expect(window.location.pathname).toBe('/'));
}, 20000);

test('App сообщает оболочке, что показывает окно: меню рисует по этому состоянию', async () => {
  const setState = vi.fn();
  window.monosMenu = { setLocale: vi.fn(), setState, onCommand: () => () => {} };
  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(setState).toHaveBeenCalled());
  const state = setState.mock.calls.at(-1)[0];
  expect(state).toMatchObject({ hasNote: false, focus: false, outline: false });
  expect(state).toHaveProperty('sidebar');
  expect(state).toHaveProperty('terminal');
}, 20000);

test('App загружает shell главной страницы', async () => {
  const { default: App } = await import('./App.svelte');
  render(App);

  expect(screen.getByTestId("header-stub")).toBeTruthy();
  expect(document.documentElement.classList.contains('dark')).toBe(false);
}, 20000);

test('App redirects unknown routes to dashboard instead of blank main', async () => {
  window.history.pushState({}, '', '/Users/justcomex/Documents/obsidian/base.zip');
  navigate('/Users/justcomex/Documents/obsidian/base.zip', { replace: true });
  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(window.location.pathname).toBe('/'));
  expect(screen.getByText('search visible')).toBeTruthy();
});

test('App restores settings for unknown file paths when settings was last route', async () => {
  sessionStorage.setItem('lastAppRoute', '/settings');
  window.history.pushState({}, '', '/Users/justcomex/Documents/obsidian/base.zip');
  navigate('/Users/justcomex/Documents/obsidian/base.zip', { replace: true });
  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(window.location.pathname).toBe('/settings'));
  expect(screen.getByTestId('settings-stub')).toBeTruthy();
});

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

  await waitFor(() => expect(screen.getByRole('button', { name: /Alpha/ })).toBeTruthy());
  expect(screen.getByText('Work')).toBeTruthy();
  expect(screen.queryByText('Work/Alpha.md')).toBeNull();

  await fireEvent.click(screen.getByRole('button', { name: /Alpha/ }));
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

test('App показывает поиск только на dashboard и общую стрелку назад вне dashboard', async () => {
  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(screen.getByText('search visible')).toBeTruthy());
  expect(screen.queryByText('back visible')).toBeNull();

  await fireEvent.click(screen.getByText('open trash'));
  await waitFor(() => expect(window.location.pathname).toBe('/trash'));
  expect(screen.getByText('back visible')).toBeTruthy();
  expect(screen.queryByText('search visible')).toBeNull();
  expect(screen.getByText('sidebar open')).toBeTruthy();

  await waitFor(() => expect(screen.getByText('go home')).toBeTruthy());
  await fireEvent.click(screen.getByText('go home'));
  await waitFor(() => expect(window.location.pathname).toBe('/'));
  expect(screen.getByText('sidebar open')).toBeTruthy();
  expect(screen.getByText('search visible')).toBeTruthy();

  await fireEvent.click(screen.getByText('open settings'));
  await waitFor(() => expect(window.location.pathname).toBe('/settings'));
  expect(screen.getByText('back visible')).toBeTruthy();
  expect(screen.queryByText('search visible')).toBeNull();

  await fireEvent.click(screen.getByText('open templates'));
  await waitFor(() => expect(window.location.pathname).toBe('/templates'));
  expect(screen.getByText('back visible')).toBeTruthy();
  expect(screen.queryByText('search visible')).toBeNull();
});

test('App возвращается на главную по клику на логотип', async () => {
  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(screen.getByRole('button', { name: /^(\+ )?New note$/ })).toBeTruthy());
  await tick();
  await fireEvent.click(screen.getByText('sidebar navigate'));
  await waitFor(() => expect(window.location.pathname).toBe('/notes/FromSidebar.md'));

  await waitFor(() => expect(screen.getByText('go home')).toBeTruthy());
  await fireEvent.click(screen.getByText('go home'));
  await waitFor(() => expect(window.location.pathname).toBe('/'));
  expect(screen.getByRole('button', { name: /^(\+ )?New note$/ })).toBeTruthy();
});

test('App сохраняет scroll дашборда при возврате кнопкой назад из заметки', async () => {
  noteView.set('board');
  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(screen.getByRole('button', { name: /^(\+ )?New note$/ })).toBeTruthy());
  const boardScroll = document.querySelector('[data-board-scroll]');
  boardScroll.scrollTop = 420;
  await fireEvent.scroll(boardScroll);

  await fireEvent.click(screen.getByText('sidebar navigate'));
  await waitFor(() => expect(window.location.pathname).toBe('/notes/FromSidebar.md'));

  await waitFor(() => expect(screen.getByText('go home')).toBeTruthy());
  await fireEvent.click(screen.getByText('go home'));

  await waitFor(() => expect(window.location.pathname).toBe('/'));
  await waitFor(() => expect(document.querySelector('[data-board-scroll]').scrollTop).toBe(420));
});

test('App обновляет дашборд после фонового сохранения заметки', async () => {
  noteView.set('board');
  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(screen.getByRole('button', { name: /^(\+ )?New note$/ })).toBeTruthy());
  const boardScroll = document.querySelector('[data-board-scroll]');
  boardScroll.scrollTop = 420;
  await fireEvent.scroll(boardScroll);
  const recentUrl = '/api/notes/recent?limit=36&offset=0&sort=modified';
  const callsBeforeSave = fetch.mock.calls.filter(([url]) => url === recentUrl).length;

  noteSaveSignal.set({
    path: 'notes/FromSidebar.md',
    modified: '2026-06-14T17:08:00.000Z',
    savedAt: Date.now(),
  });
  await waitFor(() => {
    const callsAfterSave = fetch.mock.calls.filter(([url]) => url === recentUrl).length;
    expect(callsAfterSave).toBeGreaterThan(callsBeforeSave);
  });
  await waitFor(() => expect(document.querySelector('[data-board-scroll]').scrollTop).toBe(420));
});

test('App показывает дашборд на главной даже при list noteView', async () => {
  noteView.set('list');

  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(screen.getByRole('button', { name: /^(\+ )?New note$/ })).toBeTruthy());
  expect(screen.queryByText(uiText.app.emptyMobile)).toBeNull();
  expect(screen.queryByText(uiText.app.welcome.lead)).toBeNull();
  expect(screen.queryByRole('heading', { name: uiText.app.board.title })).toBeNull();
  expect(screen.queryByText(uiText.app.board.hint)).toBeNull();
});

test('App скрывает заголовок dashboard на tablet ширине', async () => {
  window.innerWidth = 900;
  noteView.set('board');

  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(screen.getByRole('button', { name: /^(\+ )?New note$/ })).toBeTruthy());
  expect(screen.queryByRole('heading', { name: uiText.app.board.title })).toBeNull();
  expect(screen.queryByText(uiText.app.board.hint)).toBeNull();
});

test('App после удаления открытой заметки возвращается в dashboard-состояние', async () => {
  window.history.pushState({}, '', '/notes/FromSidebar.md');
  window.dispatchEvent(new PopStateEvent('popstate'));
  navigate('/notes/FromSidebar.md', { replace: true });
  noteView.set('list');

  const { default: App } = await import('./App.svelte');
  render(App);

  const sidebar = await waitFor(() => screen.getByTestId('sidebar-stub'));
  const sidebarShell = sidebar.parentElement;
  expect(sidebarShell.className).not.toContain('w-0');
  await waitFor(() => expect(screen.getByTestId('note-page-stub')).toBeTruthy());
  await fireEvent.click(screen.getByText('delete current note'));

  await waitFor(() => expect(window.location.pathname).toBe('/'));
  expect(get(noteView)).toBe('board');
  expect(sidebarShell.className).not.toContain('w-0');
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

test('App не открывает закрытый sidebar при открытии заметки', async () => {
  const { default: App } = await import('./App.svelte');
  render(App);

  const sidebar = await waitFor(() => screen.getByTestId('sidebar-stub'));
  const sidebarShell = sidebar.parentElement;
  await fireEvent.click(screen.getByText('toggle sidebar'));
  await waitFor(() => expect(sidebarShell.className).toContain('w-0'));

  await fireEvent.keyDown(window, { key: 'o', metaKey: true });
  await waitFor(() => expect(screen.getByPlaceholderText(uiText.commandPalette.quickSwitcherPlaceholder)).toBeTruthy());
  await waitFor(() => expect(screen.getByText('Alpha Note')).toBeTruthy());
  await fireEvent.click(screen.getByText('Alpha Note'));

  await waitFor(() => expect(window.location.pathname).toBe('/notes/Work/Alpha.md'));
  expect(sidebarShell.className).toContain('w-0');
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

test('App открывает создание заметки из карточки на главной', async () => {
  noteView.set('board');
  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(screen.getByRole('button', { name: /^(\+ )?New note$/ })).toBeTruthy());
  expect(screen.queryByText(uiText.app.homeActions.today)).toBeNull();

  await fireEvent.click(screen.getByRole('button', { name: /^(\+ )?New note$/ }));
  await waitFor(() => expect(screen.getByLabelText(uiText.sidebar.modals.title)).toBeTruthy());
});

test('App запускает quick note из navbar', async () => {
  noteView.set('board');
  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(screen.getByText('quick note')).toBeTruthy());
  await fireEvent.click(screen.getByText('quick note'));

  await waitFor(() => expect(screen.getByText(uiText.sidebar.modals.quickNoteSaved)).toBeTruthy());
  // Quick note появляется и в модалке, и на доске — проверим именно модалку
  expect(screen.getByText(uiText.sidebar.modals.openNote)).toBeTruthy();
});

test('App добавляет quick note в homeRecentNotes, чтобы дашборд сразу её видел', async () => {
  homeRecentNotes.set([]);
  noteView.set('board');
  const { default: App } = await import('./App.svelte');
  render(App);
  await boardLoaded();

  await waitFor(() => expect(screen.getByText('quick note')).toBeTruthy());
  await fireEvent.click(screen.getByText('quick note'));

  // Сразу после создания quick note новая заметка должна оказаться
  // в homeRecentNotes — дашборд подхватывает её без отдельного refresh.
  await waitFor(() => {
    const notes = get(homeRecentNotes);
    const hasQuick = notes.some((note) => note.path === 'notes/Quick Notes/Quick.md');
    expect(hasQuick).toBe(true);
  });
});

test('App создаёт today note из центрального действия', async () => {
  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(screen.getByRole('button', { name: /^(\+ )?New note$/ })).toBeTruthy());
  await fireEvent.click(screen.getByRole('button', { name: /^(\+ )?New note$/ }));
  await waitFor(() => expect(screen.getByText(uiText.sidebar.modals.todayNote)).toBeTruthy());
  await fireEvent.click(screen.getByText(uiText.sidebar.modals.todayNote));

  await waitFor(() => expect(window.location.pathname).toMatch(/^\/notes\/Daily\/\d{4}-\d{2}-\d{2}\.md$/));
});

test('App создает заметку в папке из дерева и сразу открывает ее', async () => {
  const { default: App } = await import('./App.svelte');
  render(App);

  await fireEvent.click(screen.getByText('create in nested folder'));
  const titleInput = await waitFor(() => screen.getByLabelText(uiText.sidebar.modals.title));
  await fireEvent.input(titleInput, { target: { value: 'Nested Note' } });
  await fireEvent.click(screen.getByRole('button', { name: uiText.sidebar.modals.create }));

  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/notes/create', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ title: 'Nested Note', category: 'Work/Nested', tags: [], content: '' }),
  })));
  await waitFor(() => expect(decodeURIComponent(window.location.pathname)).toBe('/notes/Work/Nested/Nested Note.md'));
  expect(decodeURIComponent(window.location.pathname)).not.toContain('/notes/notes/');
  expect(get(noteView)).toBe('list');
  expect(screen.getByText('selected:notes/Work/Nested/Nested Note.md')).toBeTruthy();
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

test('App открывает заметку по прямой ссылке, даже если запомнена доска', async () => {
  noteView.set('board');
  window.history.pushState({}, '', '/notes/Alpha.md');
  const { default: App } = await import('./App.svelte');
  render(App);

  await waitFor(() => expect(get(noteView)).toBe('list'));
  expect(window.location.pathname).toBe('/notes/Alpha.md');
}, 20000);

test('App на широком окне возвращает сайдбар, если приложение открылось на узком', async () => {
  let width = 800;
  Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => width });
  try {
    const { default: App } = await import('./App.svelte');
    render(App);
    await waitFor(() => expect(screen.getByText('toggle sidebar')).toBeTruthy());
    expect(screen.queryByText('sidebar open')).toBeNull();

    width = 1300;
    window.dispatchEvent(new Event('resize'));
    await waitFor(() => expect(screen.getByText('sidebar open')).toBeTruthy());

    // A sidebar the person closed on the wide window stays closed after a narrow spell.
    await fireEvent.click(screen.getByText('toggle sidebar'));
    await waitFor(() => expect(screen.queryByText('sidebar open')).toBeNull());
    width = 800;
    window.dispatchEvent(new Event('resize'));
    width = 1300;
    window.dispatchEvent(new Event('resize'));
    await tick();
    expect(screen.queryByText('sidebar open')).toBeNull();
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => 1300 });
  }
}, 20000);

test('App показывает пустое состояние доски, когда заметок ещё нет', async () => {
  const emptyFetch = vi.fn(async (url) => {
    if (url.endsWith('/api/notes/recent?limit=36&offset=0&sort=modified')) return jsonResponse([]);
    return jsonResponse({}, false);
  });
  globalThis.fetch = emptyFetch;
  window.fetch = emptyFetch;
  homeRecentNotes.set([]);
  homeRecentError.set(null);
  noteView.set('board');

  const { default: App } = await import('./App.svelte');
  render(App);

  // First launch: three ways in — write, bring the notes you have, sync — not a blank page.
  await waitFor(() => expect(screen.getByRole('heading', { name: uiText.app.welcome.title })).toBeTruthy());
  expect(screen.getByText(uiText.app.welcome.lead)).toBeTruthy();
  expect(screen.getByRole('button', { name: uiText.app.welcome.writeAction })).toBeTruthy();
  expect(screen.getByRole('button', { name: uiText.app.welcome.folderAction })).toBeTruthy();
  expect(screen.getByRole('button', { name: uiText.app.welcome.syncAction })).toBeTruthy();
  // "Continue" is deliberately absent here: this state only renders when there
  // are no notes at all, so there is nothing to continue into.
  expect(screen.queryByRole('button', { name: uiText.app.homeActions.continueWork })).toBeNull();
  expect(screen.getByRole('button', { name: uiText.app.welcome.importAction })).toBeTruthy();
}, 20000);

test('App показывает ошибку загрузки доски с повтором вместо пустого состояния', async () => {
  const failingFetch = vi.fn(async (url) => {
    if (url.endsWith('/api/notes/recent?limit=36&offset=0&sort=modified')) {
      return { ok: false, status: 500, async json() { return { error: 'boom' }; } };
    }
    return jsonResponse({}, false);
  });
  globalThis.fetch = failingFetch;
  window.fetch = failingFetch;
  homeRecentNotes.set([]);
  homeRecentError.set('HTTP 500');
  noteView.set('board');

  const { default: App } = await import('./App.svelte');
  render(App);

  await boardLoaded();
  await waitFor(() => expect(screen.getByText(uiText.app.board.loadFailed)).toBeTruthy());
  expect(screen.getByText(uiText.app.board.loadFailedHint)).toBeTruthy();
  expect(screen.queryByText(uiText.app.welcome.lead)).toBeNull();

  const retry = screen.getByRole('button', { name: uiText.app.board.retry });
  const callsBefore = failingFetch.mock.calls.filter(([u]) => u.includes('/api/notes/recent')).length;
  await fireEvent.click(retry);
  await waitFor(() => {
    const callsAfter = failingFetch.mock.calls.filter(([u]) => u.includes('/api/notes/recent')).length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
  });
}, 20000);
