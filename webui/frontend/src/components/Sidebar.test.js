import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, test, expect, vi } from 'vitest';
import Sidebar from './Sidebar.svelte';
import { locale, translations, uiText } from '../lib/strings.js';
import { editorState } from '../stores.js';

function jsonResponse(data, ok = true) {
  return {
    ok,
    async json() {
      return data;
    },
  };
}

function createTree() {
  return {
    path: 'notes',
    name: 'notes',
    is_dir: true,
    children: [
      {
        path: 'notes/Work',
        name: 'Work',
        is_dir: true,
        children: [
          {
            path: 'notes/Work/Alpha.md',
            name: 'Alpha.md',
            is_dir: false,
            children: [],
            metadata: { title: 'Alpha Note', category: 'Work', tags: ['alpha'] },
          },
        ],
      },
    ],
  };
}

function createFetchMock() {
  let treeVersion = 0;
  let alphaPath = 'notes/Work/Alpha.md';
  let alphaName = 'Alpha.md';
  let deletedAlpha = false;

  return vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = init.method || 'GET';

    if (url === '/api/tree') {
      const tree = createTree();
      tree.children[0].children[0].path = alphaPath;
      tree.children[0].children[0].name = alphaName;
      if (deletedAlpha) tree.children[0].children = [];
      if (treeVersion > 0) {
        tree.children[0].children.push({
          path: 'notes/Inbox.md',
          name: 'Inbox.md',
          is_dir: false,
          children: [],
          metadata: { title: 'Inbox', category: '', tags: [] },
        });
      }
      treeVersion += 1;
      return jsonResponse(tree);
    }

    if (url === '/api/notes/recent?limit=5') {
      return jsonResponse([
        { path: 'notes/Work/Alpha.md', name: 'Alpha Note' },
      ]);
    }

    if (url === '/api/tags') {
      return jsonResponse(['alpha', 'beta']);
    }

    if (url === '/api/directories') {
      return jsonResponse(['', 'Work']);
    }

    if (url === '/api/notes/create' && method === 'POST') {
      const body = JSON.parse(init.body);
      return jsonResponse({
        path: body.category ? `notes/${body.category}/${body.title}.md` : `notes/${body.title}.md`,
        name: `${body.title}.md`,
      });
    }

    if (url.startsWith('/api/attachments?notePath=') && method === 'POST') {
      return jsonResponse({
        path: 'notes/Quick Notes/_attachments/image.webp',
        relativePath: '_attachments/image.webp',
        name: 'image.webp',
        mime: 'image/webp',
      });
    }

    if (url.startsWith('/api/file?path=notes%2FQuick%20Notes%2F') && method === 'GET') {
      return jsonResponse({ content: '---\ntitle: "Quick"\ntags: []\n---\n' });
    }

    if (url.startsWith('/api/file?path=notes%2FQuick%20Notes%2F') && method === 'POST') {
      return jsonResponse({ message: 'Saved' });
    }

    if (url === '/api/git/sync' && method === 'POST') {
      return jsonResponse({ message: 'Synced', conflicts: false });
    }

    if (url === '/api/file/rename?path=notes%2FWork%2FAlpha.md' && method === 'POST') {
      const body = JSON.parse(init.body);
      alphaName = body.new_name;
      alphaPath = `notes/Work/${alphaName}`;
      return jsonResponse({ path: alphaPath, name: alphaName });
    }

    if (url === '/api/file/move?source=notes%2FWork%2FAlpha.md&target=notes' && method === 'POST') {
      alphaPath = 'notes/Alpha.md';
      return jsonResponse({ message: 'Moved' });
    }

    if (url === '/api/file?path=notes%2FWork%2FAlpha.md' && method === 'DELETE') {
      deletedAlpha = true;
      return jsonResponse({ message: 'Deleted' });
    }

    return jsonResponse({}, false);
  });
}

beforeEach(() => {
  localStorage.clear();
  locale.set('en');
  globalThis.confirm = vi.fn(() => true);
  editorState.set({ path: null, dirty: false, saving: false });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

test('Sidebar загружает дерево и открывает заметку из дерева', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  const { component } = render(Sidebar);
  const navigateHandler = vi.fn();
  component.$on('navigate', navigateHandler);
  await component.loadTree();

  await waitFor(() => expect(screen.getByText(uiText.sidebar.knowledgeTree)).toBeTruthy());
  expect(screen.getByText(uiText.sidebar.knowledgeTree)).toBeTruthy();
  expect(screen.getByText((_, node) => node?.textContent === uiText.sidebar.notes(1))).toBeTruthy();
  expect(screen.queryByText(uiText.sidebar.recentThoughts)).toBeNull();

  await fireEvent.click(screen.getByText('Work'));
  const noteButton = await waitFor(() => screen.getByText('Alpha').closest('button'));
  await fireEvent.click(noteButton);

  expect(navigateHandler).toHaveBeenCalled();
  expect(navigateHandler.mock.calls[0][0].detail).toEqual({
    path: 'notes/Work/Alpha.md',
    name: 'Alpha.md',
    isDir: false,
  });
});

test('Sidebar создаёт заметку и отправляет navigate с правильным именем', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  const { component } = render(Sidebar);
  const navigateHandler = vi.fn();
  component.$on('navigate', navigateHandler);
  await component.loadTree();

  await waitFor(() => expect(screen.getByText(uiText.sidebar.knowledgeTree)).toBeTruthy());
  await fireEvent.click(screen.getByRole('button', { name: uiText.sidebar.new }));
  await fireEvent.input(screen.getByLabelText(uiText.sidebar.modals.title), { target: { value: 'Inbox' } });
  await fireEvent.click(screen.getByRole('button', { name: uiText.sidebar.modals.create }));

  await waitFor(() => expect(navigateHandler).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledWith('/api/notes/create', expect.objectContaining({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }));

  const createCall = fetchMock.mock.calls.find(([url]) => url === '/api/notes/create');
  expect(JSON.parse(createCall[1].body)).toEqual({
    title: 'Inbox',
    category: '',
    tags: [],
    content: '',
  });
  expect(navigateHandler.mock.calls.at(-1)[0].detail).toEqual({
    path: 'notes/Inbox.md',
    name: 'Inbox',
    isDir: false,
  });
});

test('Sidebar создаёт заметку из встроенного шаблона', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  const { component } = render(Sidebar);
  const navigateHandler = vi.fn();
  component.$on('navigate', navigateHandler);
  await component.loadTree();

  await fireEvent.click(screen.getByRole('button', { name: uiText.sidebar.new }));
  await fireEvent.click(screen.getByText(uiText.sidebar.modals.fromTemplate));
  await waitFor(() => expect(screen.getByText(uiText.sidebar.templateLibrary)).toBeTruthy());
  await fireEvent.click(screen.getByText('Meeting Notes'));
  await fireEvent.input(screen.getByLabelText(uiText.sidebar.modals.title), { target: { value: 'Client Sync' } });
  await fireEvent.click(screen.getByRole('button', { name: uiText.sidebar.useTemplate }));

  await waitFor(() => expect(navigateHandler).toHaveBeenCalled());
  const createCall = fetchMock.mock.calls.find(([url, init]) => url === '/api/notes/create' && init.method === 'POST');
  const body = JSON.parse(createCall[1].body);

  expect(body.title).toBe('Client Sync');
  expect(body.category).toBe('Meetings');
  expect(body.tags).toEqual(['meeting']);
  expect(body.content).toContain('# Client Sync');
  expect(body.content).toContain('## Agenda');
  expect(navigateHandler.mock.calls.at(-1)[0].detail).toEqual({
    path: 'notes/Meetings/Client Sync.md',
    name: 'Client Sync',
    isDir: false,
  });
});

test('Sidebar показывает и создаёт шаблоны на русском языке', async () => {
  locale.set('ru');
  const ruText = translations.ru;
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  const { component } = render(Sidebar);
  const navigateHandler = vi.fn();
  component.$on('navigate', navigateHandler);
  await component.loadTree();

  await fireEvent.click(screen.getByRole('button', { name: ruText.sidebar.new }));
  await fireEvent.click(screen.getByText(ruText.sidebar.modals.fromTemplate));
  await waitFor(() => expect(screen.getByText(ruText.sidebar.templateLibrary)).toBeTruthy());
  expect(screen.getByText('Быт')).toBeTruthy();
  expect(screen.getByText('Повседневные домашние заметки: еда, покупки, поездки, обслуживание и дела.')).toBeTruthy();
  expect(screen.getByText('План питания + покупки')).toBeTruthy();
  expect(screen.getAllByText('Дневная заметка').length).toBeGreaterThan(0);
  expect(screen.queryByText('Daily Note')).toBeNull();

  await fireEvent.click(screen.getByText('Заметка встречи'));
  await fireEvent.input(screen.getByLabelText(ruText.sidebar.modals.title), { target: { value: 'Синк с клиентом' } });
  await fireEvent.click(screen.getByRole('button', { name: ruText.sidebar.useTemplate }));

  await waitFor(() => expect(navigateHandler).toHaveBeenCalled());
  const createCall = fetchMock.mock.calls.find(([url, init]) => url === '/api/notes/create' && init.method === 'POST');
  const body = JSON.parse(createCall[1].body);
  expect(body.category).toBe('Встречи');
  expect(body.content).toContain('# Синк с клиентом');
  expect(body.content).toContain('## Повестка');
});

test('Sidebar закрепляет заметку в Pinned через контекстное меню', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  const { component } = render(Sidebar);
  const navigateHandler = vi.fn();
  component.$on('navigate', navigateHandler);
  await component.loadTree();

  await fireEvent.click(screen.getByText('Work'));
  await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy());
  await fireEvent.contextMenu(screen.getByText('Alpha').closest('button'));
  await fireEvent.click(screen.getByText(uiText.sidebar.context.pin));

  expect(screen.getByText(uiText.sidebar.pinned)).toBeTruthy();
  expect(localStorage.getItem('pinnedNotes')).toContain('notes/Work/Alpha.md');

  const pinnedButton = screen.getAllByText('Alpha')[0].closest('button');
  await fireEvent.click(pinnedButton);
  expect(navigateHandler).toHaveBeenCalledWith(expect.objectContaining({
    detail: { path: 'notes/Work/Alpha.md', name: 'Alpha', isDir: false },
  }));

  await fireEvent.contextMenu(screen.getAllByText('Alpha').at(-1).closest('button'));
  await fireEvent.click(screen.getByText(uiText.sidebar.context.unpin));
  expect(screen.queryByText(uiText.sidebar.pinned)).toBeNull();
});

test('Sidebar создаёт today note с timestamp DD-MM-YY-HH-MM-SS', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 2, 5, 4, 3));
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  const { component } = render(Sidebar);
  const navigateHandler = vi.fn();
  component.$on('navigate', navigateHandler);
  await component.loadTree();

  await component.createTodayNote();
  vi.useRealTimers();

  await waitFor(() => expect(navigateHandler).toHaveBeenCalled());
  const createCall = fetchMock.mock.calls.find(([url]) => url === '/api/notes/create');
  expect(JSON.parse(createCall[1].body)).toEqual({
    title: '02-06-26-05-04-03',
    category: 'Daily',
    tags: [],
    content: '',
  });
  expect(navigateHandler.mock.calls.at(-1)[0].detail).toEqual({
    path: 'notes/Daily/02-06-26-05-04-03.md',
    name: '02-06-26-05-04-03',
    isDir: false,
  });
});

test('Sidebar создаёт quick note из буфера обмена в Quick Notes', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 2, 19, 36, 39));
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      readText: vi.fn(async () => 'Captured from clipboard'),
    },
  });

  const { component } = render(Sidebar);
  const navigateHandler = vi.fn();
  component.$on('navigate', navigateHandler);
  await component.loadTree();

  await component.createQuickNoteFromClipboard();
  vi.useRealTimers();

  const createCall = fetchMock.mock.calls.find(([url, init]) => url === '/api/notes/create' && init.method === 'POST');
  expect(JSON.parse(createCall[1].body)).toEqual({
    title: '02-06-26-19-36-39',
    category: 'Quick Notes',
    tags: [],
    content: 'Captured from clipboard',
  });
  expect(navigateHandler).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByText(uiText.sidebar.modals.quickNoteSaved)).toBeTruthy());
  await fireEvent.click(screen.getByText(uiText.sidebar.modals.openNote));

  expect(navigateHandler).toHaveBeenCalledTimes(1);
  expect(navigateHandler.mock.calls.at(-1)[0].detail).toEqual({
    path: 'notes/Quick Notes/02-06-26-19-36-39.md',
    name: '02-06-26-19-36-39',
    isDir: false,
  });
});

test('Sidebar создаёт quick note из изображения в буфере обмена', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 2, 19, 36, 39));
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      read: vi.fn(async () => [{
        types: ['image/png'],
        getType: vi.fn(async () => new Blob(['image'], { type: 'image/png' })),
      }]),
      readText: vi.fn(async () => ''),
    },
  });

  const { component } = render(Sidebar);
  await component.loadTree();

  await component.createQuickNoteFromClipboard();
  vi.useRealTimers();

  const createCall = fetchMock.mock.calls.find(([url, init]) => url === '/api/notes/create' && init.method === 'POST');
  expect(JSON.parse(createCall[1].body)).toEqual({
    title: '02-06-26-19-36-39',
    category: 'Quick Notes',
    tags: [],
    content: '',
  });
  expect(fetchMock.mock.calls.some(([url]) => url.startsWith('/api/attachments?notePath=notes%2FQuick%20Notes%2F02-06-26-19-36-39.md'))).toBe(true);

  const saveCall = fetchMock.mock.calls.find(([url, init]) => url === '/api/file?path=notes%2FQuick%20Notes%2F02-06-26-19-36-39.md' && init?.method === 'POST');
  expect(JSON.parse(saveCall[1].body).content).toContain('![image](_attachments/image.webp)');
  await waitFor(() => expect(screen.getByText(uiText.sidebar.modals.quickNoteSaved)).toBeTruthy());
});

test('Sidebar создаёт quick note из base64 image data URL в тексте буфера обмена', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 2, 19, 36, 39));
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      readText: vi.fn(async () => 'data:image/png;base64,aW1hZ2U='),
    },
  });

  const { component } = render(Sidebar);
  await component.loadTree();

  await component.createQuickNoteFromClipboard();
  vi.useRealTimers();

  expect(fetchMock.mock.calls.some(([url]) => url.startsWith('/api/attachments?notePath=notes%2FQuick%20Notes%2F02-06-26-19-36-39.md'))).toBe(true);
  const saveCall = fetchMock.mock.calls.find(([url, init]) => url === '/api/file?path=notes%2FQuick%20Notes%2F02-06-26-19-36-39.md' && init?.method === 'POST');
  expect(JSON.parse(saveCall[1].body).content).toContain('![image](_attachments/image.webp)');
  await waitFor(() => expect(screen.getByText(uiText.sidebar.modals.quickNoteSaved)).toBeTruthy());
});

test('Sidebar показывает подсказку, если quick note нельзя создать из пустого буфера', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      readText: vi.fn(async () => '   '),
    },
  });

  const { component } = render(Sidebar);
  const navigateHandler = vi.fn();
  component.$on('navigate', navigateHandler);
  await component.loadTree();

  await component.createQuickNoteFromClipboard();

  expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/notes/create' && init?.method === 'POST')).toBe(false);
  expect(navigateHandler).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByText(uiText.sidebar.modals.quickNoteNotCreated)).toBeTruthy());
  expect(screen.getByText(uiText.sidebar.modals.quickNoteClipboardEmptyHint)).toBeTruthy();
});

test('Sidebar mobile sheet не показывает крупный quick switcher CTA', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Sidebar);

  expect(screen.queryByText(uiText.commandPalette.quickSwitcher)).toBeNull();
});

test('Sidebar после sync заново загружает дерево и директории', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  const { component } = render(Sidebar);
  await component.loadTree();

  await waitFor(() => expect(screen.getByText((_, node) => node?.textContent === uiText.sidebar.notes(1))).toBeTruthy());
  const treeCallsBeforeSync = fetchMock.mock.calls.filter(([url]) => url === '/api/tree').length;

  await fireEvent.click(screen.getByRole('button', { name: uiText.sidebar.syncWithGit }));

  await waitFor(() => expect(screen.getByText((_, node) => node?.textContent === uiText.sidebar.notes(2))).toBeTruthy());

  const treeCallsAfterSync = fetchMock.mock.calls.filter(([url]) => url === '/api/tree').length;

  expect(fetchMock).toHaveBeenCalledWith('/api/git/sync', { method: 'POST' });
  expect(treeCallsAfterSync).toBeGreaterThan(treeCallsBeforeSync);
});

test('Sidebar блокирует sync при несохранённой текущей заметке', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
  editorState.set({ path: 'notes/Work/Alpha.md', dirty: true, saving: false });

  const { component } = render(Sidebar);
  await component.loadTree();

  const syncButton = screen.getByRole('button', { name: uiText.sidebar.saveBeforeSync });
  expect(syncButton.disabled).toBe(true);
  await fireEvent.click(syncButton);

  expect(fetchMock).not.toHaveBeenCalledWith('/api/git/sync', { method: 'POST' });
});

test('Sidebar после rename открытой заметки навигирует на новый путь', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  const { component } = render(Sidebar);
  const navigateHandler = vi.fn();
  component.$on('navigate', navigateHandler);
  await component.loadTree();
  component.setSelected('notes/Work/Alpha.md');

  await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy());
  await fireEvent.contextMenu(screen.getByText('Alpha').closest('button'));
  await fireEvent.click(screen.getByText(uiText.sidebar.context.rename));
  await fireEvent.input(screen.getByLabelText(uiText.sidebar.modals.newName), { target: { value: 'Alpha Renamed.md' } });
  await fireEvent.click(screen.getByRole('button', { name: uiText.sidebar.modals.rename }));

  await waitFor(() => expect(navigateHandler).toHaveBeenCalledWith(expect.objectContaining({
    detail: { path: 'notes/Work/Alpha Renamed.md', name: 'Alpha Renamed.md', isDir: false },
  })));
});

test('Sidebar после удаления открытой заметки сбрасывает активный файл', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  const { component } = render(Sidebar);
  const deletedHandler = vi.fn();
  component.$on('fileDeleted', deletedHandler);
  await component.loadTree();
  component.setSelected('notes/Work/Alpha.md');

  await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy());
  await fireEvent.contextMenu(screen.getByText('Alpha').closest('button'));
  await fireEvent.click(screen.getByText(uiText.sidebar.context.delete));

  await waitFor(() => expect(deletedHandler).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledWith('/api/file?path=notes%2FWork%2FAlpha.md', { method: 'DELETE' });
});

test('Sidebar после перемещения открытой заметки навигирует на новый путь', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  const { component } = render(Sidebar);
  const navigateHandler = vi.fn();
  component.$on('navigate', navigateHandler);
  await component.loadTree();
  component.setSelected('notes/Work/Alpha.md');

  const alphaButton = await waitFor(() => screen.getByText('Alpha').closest('button'));
  const rootDrop = screen.getByTestId('tree-drop-zone');
  const dataTransfer = {
    getData: vi.fn(() => 'notes/Work/Alpha.md'),
    setData: vi.fn(),
    effectAllowed: '',
    dropEffect: '',
  };

  await fireEvent.dragStart(alphaButton, { dataTransfer });
  await fireEvent.dragOver(rootDrop, { dataTransfer });
  await fireEvent.drop(rootDrop, { dataTransfer });

  await waitFor(() => expect(navigateHandler).toHaveBeenCalledWith(expect.objectContaining({
    detail: { path: 'notes/Alpha.md', name: 'Alpha.md', isDir: false },
  })));
});
