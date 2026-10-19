import { get } from 'svelte/store';
import { trashedNotice } from '../lib/trash-undo.js';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { editorAction, outlineHidden } from '../stores.js';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Editor from './Editor.svelte';
import { locale, uiText } from '../lib/strings.js';

vi.mock('./RichEditor.svelte', async () => ({
  default: (await import('./__mocks__/RichEditorStub.svelte')).default,
}));

function jsonResponse(data, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    async json() {
      return data;
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function createDefaultResponses(path, overrides = {}) {
  const encodedPath = encodeURIComponent(path);
  return {
    [`/api/file?path=${encodedPath}`]: jsonResponse({ content: 'Body with [[Alpha]]' }),
    [`/api/file-info?path=${encodedPath}`]: jsonResponse({
      created: '2026-05-07T10:00:00.000Z',
      modified: '2026-05-07T12:00:00.000Z',
      metadata: { title: 'Inbox', tags: ['alpha'] },
    }),
    [`/api/notes/backlinks?path=${encodedPath}`]: jsonResponse([
      { name: 'Beta', path: 'notes/Beta.md', type: 'backlink' },
      { name: 'Gamma', path: 'notes/Gamma.md', type: 'mention' },
    ]),
    ...overrides,
  };
}

function installFetchMock(responses) {
  const fetchMock = vi.fn(async (url, init = {}) => {
    const key = init.method ? `${init.method} ${url}` : url;
    if (key in responses) return responses[key];
    if (url in responses) return responses[url];
    return jsonResponse({ message: `Unhandled request: ${key}` }, false);
  });

  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
  return fetchMock;
}

beforeEach(() => {
  locale.set('en');
  globalThis.alert = vi.fn();
  globalThis.confirm = vi.fn(() => true);
  Object.defineProperty(globalThis.navigator, 'sendBeacon', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('Editor загружает заметку, показывает теги и связанные заметки', async () => {
  installFetchMock(createDefaultResponses('notes/Work/Alpha.md', {
    '/api/file?path=notes%2FWork%2FAlpha.md': jsonResponse({ content: 'Alpha body' }),
    '/api/file-info?path=notes%2FWork%2FAlpha.md': jsonResponse({
      created: '2026-05-07T10:00:00.000Z',
      modified: '2026-05-07T12:00:00.000Z',
      metadata: { title: 'Alpha Note', tags: ['alpha'] },
    }),
  }));

  const { component } = render(Editor, {
    currentFile: { path: 'notes/Work/Alpha.md', name: 'Alpha.md', isDir: false },
  });
  const fileOpenedHandler = vi.fn();
  const componentNavigateHandler = vi.fn();
  component.$on('fileOpened', fileOpenedHandler);
  component.$on('navigate', componentNavigateHandler);

  await waitFor(() => expect(screen.getByDisplayValue('Alpha Note')).toBeTruthy());
  await waitFor(() => expect(screen.queryByText(uiText.editor.gatheringThoughts)).toBeNull());
  expect(screen.getByTestId('rich-editor-input').value).toBe('Alpha body');
  // Теги видны на кнопке нижней панели, связанные заметки — в окошке по её кнопке.
  expect(within(screen.getByTestId('note-properties')).getByText('#alpha')).toBeTruthy();
  await fireEvent.click(screen.getByTestId('property-related-button'));
  const related = screen.getByTestId('property-panel');
  expect(within(related).getByText(uiText.editor.localNavigation)).toBeTruthy();
  expect(within(related).getByText('Beta')).toBeTruthy();
  expect(within(related).getByText('Gamma')).toBeTruthy();
  await fireEvent.click(within(related).getByRole('button', { name: /Beta/ }));
  expect(componentNavigateHandler).toHaveBeenCalledWith(expect.objectContaining({
    detail: { path: 'notes/Beta.md', name: 'Beta', isDir: false },
  }));
  expect(fileOpenedHandler).toHaveBeenCalledWith(
    expect.objectContaining({ detail: 'notes/Work/Alpha.md' })
  );
});

test('Editor показывает breadcrumb без отдельного reveal/tag toolbar', async () => {
  installFetchMock(createDefaultResponses('notes/Work/Alpha.md', {
    '/api/file?path=notes%2FWork%2FAlpha.md': jsonResponse({ content: 'Alpha body' }),
    '/api/file-info?path=notes%2FWork%2FAlpha.md': jsonResponse({
      created: '2026-05-07T10:00:00.000Z',
      modified: '2026-05-07T12:00:00.000Z',
      metadata: { title: 'Alpha Note', tags: ['release'] },
    }),
  }));

  render(Editor, {
    currentFile: { path: 'notes/Work/Alpha.md', name: 'Alpha.md', isDir: false },
  });

  await waitFor(() => expect(screen.getByDisplayValue('Alpha Note')).toBeTruthy());
  // The folder is in the breadcrumb, and the folder button in the bottom bar names it too.
  expect(screen.getAllByText('Work').length).toBe(2);
  expect(screen.getByTestId('property-category-button').textContent).toContain('Work');
  expect(screen.queryByText(uiText.editorHeader.revealInTree)).toBeNull();
  expect(screen.queryByPlaceholderText(uiText.editorHeader.tagPlaceholder)).toBeNull();
  expect(within(screen.getByTestId('note-properties')).getByText('#release')).toBeTruthy();
});

test('Editor позволяет перекрасить открытую заметку из нижней палитры', async () => {
  const fetchMock = installFetchMock(createDefaultResponses('notes/Inbox.md', {
    '/api/file-info?path=notes%2FInbox.md': jsonResponse({
      created: '2026-05-07T10:00:00.000Z',
      modified: '2026-05-07T12:00:00.000Z',
      color: '#fabd2f',
      metadata: { title: 'Inbox', tags: [] },
    }),
    'POST /api/directory/icon?path=notes%2FInbox.md': jsonResponse({ message: 'Icon updated' }),
  }));
  const { component } = render(Editor, {
    currentFile: { path: 'notes/Inbox.md', name: 'Inbox.md', isDir: false },
  });
  const colorChangedHandler = vi.fn();
  component.$on('noteColorChanged', colorChangedHandler);

  await waitFor(() => expect(screen.getByDisplayValue('Inbox')).toBeTruthy());
  await waitFor(() => expect(screen.queryByText(uiText.editor.gatheringThoughts)).toBeNull());
  expect(screen.getByTestId('editor-shell').getAttribute('style')).toContain('--note-accent: #fabd2f');
  await fireEvent.click(screen.getByRole('button', { name: uiText.editor.moreActions }));
  await fireEvent.click(screen.getByRole('menuitem', { name: uiText.editor.noteColor }));
  await fireEvent.click(screen.getByRole('button', { name: uiText.app.board.applyColor('#8ec07c') }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/directory/icon?path=notes%2FInbox.md', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ color: '#8ec07c' }),
  })));
  expect(colorChangedHandler).toHaveBeenCalledWith(expect.objectContaining({
    detail: { path: 'notes/Inbox.md', color: '#8ec07c' },
  }));
  await waitFor(() => expect(screen.getByTestId('editor-shell').getAttribute('style')).toContain('--note-accent: #8ec07c'));
});

test('Editor сохраняет текущую поверхность при переходе на другую заметку', async () => {
  let resolveBetaContent;
  const fetchMock = vi.fn((url, init = {}) => {
    const method = init.method || 'GET';

    if (url === '/api/file?path=notes%2FAlpha.md' && method === 'GET') {
      return Promise.resolve(jsonResponse({ content: 'Alpha body' }));
    }

    if (url === '/api/file-info?path=notes%2FAlpha.md') {
      return Promise.resolve(jsonResponse({
        created: '2026-05-07T10:00:00.000Z',
        modified: '2026-05-07T12:00:00.000Z',
        metadata: { title: 'Alpha', tags: [] },
      }));
    }

    if (url === '/api/notes/backlinks?path=notes%2FAlpha.md') {
      return Promise.resolve(jsonResponse([]));
    }

    if (url === '/api/file?path=notes%2FBeta.md' && method === 'GET') {
      return new Promise((resolve) => {
        resolveBetaContent = () => resolve(jsonResponse({ content: 'Beta body' }));
      });
    }

    if (url === '/api/file-info?path=notes%2FBeta.md') {
      return Promise.resolve(jsonResponse({
        created: '2026-05-08T10:00:00.000Z',
        modified: '2026-05-08T12:00:00.000Z',
        metadata: { title: 'Beta', tags: [] },
      }));
    }

    if (url === '/api/notes/backlinks?path=notes%2FBeta.md') {
      return Promise.resolve(jsonResponse([]));
    }

    return Promise.resolve(jsonResponse({ message: `Unhandled request: ${method} ${url}` }, false));
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  const { component } = render(Editor, {
    currentFile: { path: 'notes/Alpha.md', name: 'Alpha.md', isDir: false },
  });

  await waitFor(() => expect(screen.getByDisplayValue('Alpha')).toBeTruthy());
  const editorInput = screen.getByTestId('rich-editor-input');
  expect(editorInput.value).toBe('Alpha body');

  component.$set({ currentFile: { path: 'notes/Beta.md', name: 'Beta.md', isDir: false } });
  await tick();
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === '/api/file?path=notes%2FBeta.md')).toBe(true));

  expect(screen.queryByText(uiText.editor.gatheringThoughts)).toBeNull();
  expect(editorInput.value).toBe('Alpha body');
  expect(editorInput.getAttribute('placeholder')).toBe('');

  resolveBetaContent();
  await waitFor(() => expect(editorInput.value).toBe('Beta body'));
  await waitFor(() => expect(screen.getByDisplayValue('Beta')).toBeTruthy());
});

test('Editor не пересоздаёт панели при переходе на другую заметку и блокирует их на время загрузки', async () => {
  let resolveBetaContent;
  const fetchMock = vi.fn((url, init = {}) => {
    const method = init.method || 'GET';

    if (url === '/api/file?path=notes%2FAlpha.md' && method === 'GET') {
      return Promise.resolve(jsonResponse({ content: 'Alpha body' }));
    }
    if (url === '/api/file-info?path=notes%2FAlpha.md') {
      return Promise.resolve(jsonResponse({
        created: '2026-05-07T10:00:00.000Z',
        modified: '2026-05-07T12:00:00.000Z',
        metadata: { title: 'Alpha', tags: [] },
      }));
    }
    if (url === '/api/notes/backlinks?path=notes%2FAlpha.md') {
      return Promise.resolve(jsonResponse([{ name: 'Gamma', path: 'notes/Gamma.md', type: 'backlink' }]));
    }
    if (url === '/api/file?path=notes%2FBeta.md' && method === 'GET') {
      return new Promise((resolve) => {
        resolveBetaContent = () => resolve(jsonResponse({ content: 'Beta body' }));
      });
    }
    if (url === '/api/file-info?path=notes%2FBeta.md') {
      return Promise.resolve(jsonResponse({
        created: '2026-05-08T10:00:00.000Z',
        modified: '2026-05-08T12:00:00.000Z',
        metadata: { title: 'Beta', tags: [] },
      }));
    }
    if (url === '/api/notes/backlinks?path=notes%2FBeta.md') {
      return Promise.resolve(jsonResponse([]));
    }

    return Promise.resolve(jsonResponse({ message: `Unhandled request: ${method} ${url}` }, false));
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  const { component } = render(Editor, {
    currentFile: { path: 'notes/Alpha.md', name: 'Alpha.md', isDir: false },
  });

  await waitFor(() => expect(screen.getByDisplayValue('Alpha')).toBeTruthy());
  const properties = screen.getByTestId('note-properties');
  const footer = screen.getByTestId('editor-footer');

  component.$set({ currentFile: { path: 'notes/Beta.md', name: 'Beta.md', isDir: false } });
  await tick();
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === '/api/file?path=notes%2FBeta.md')).toBe(true));

  // Пока грузится Beta, панели остаются теми же узлами. Моргание было в том,
  // что {#if !isLoading} выбрасывал их из DOM и тут же возвращал на место.
  expect(screen.getByTestId('note-properties')).toBe(properties);
  expect(screen.getByTestId('editor-footer')).toBe(footer);
  // Но свойства и нижняя панель действуют на запрошенную заметку (currentFile),
  // а текст в редакторе ещё от прежней. Без inert правка свойств записала бы
  // старое содержимое в файл, который ещё не открыт.
  expect(properties.inert).toBe(true);
  expect(footer.inert).toBe(true);

  resolveBetaContent();
  await waitFor(() => expect(screen.getByDisplayValue('Beta')).toBeTruthy());
  expect(screen.getByTestId('note-properties')).toBe(properties);
  expect(screen.getByTestId('editor-footer')).toBe(footer);
  expect(properties.inert).toBe(false);
  expect(footer.inert).toBe(false);
});

test('Editor не показывает панели свойств и подвала до загрузки первой заметки', async () => {
  const body = deferred();
  installFetchMock(createDefaultResponses('notes/Alpha.md', {
    '/api/file?path=notes%2FAlpha.md': body.promise,
  }));

  render(Editor, {
    currentFile: { path: 'notes/Alpha.md', name: 'Alpha.md', isDir: false },
  });

  expect(screen.queryByTestId('note-properties')).toBeNull();
  expect(screen.queryByTestId('editor-footer')).toBeNull();

  body.resolve(jsonResponse({ content: 'Alpha body' }));
  await waitFor(() => expect(screen.getByTestId('note-properties')).toBeTruthy());
  expect(screen.getByTestId('editor-footer')).toBeTruthy();
});

test('Editor открывает заметку снова после возврата на текущую, пока та грузилась', async () => {
  let betaRequests = 0;
  let resolveFirstBeta;
  const fileInfo = (title) => jsonResponse({
    created: '2026-05-07T10:00:00.000Z',
    modified: '2026-05-07T12:00:00.000Z',
    metadata: { title, tags: [] },
  });
  const fetchMock = vi.fn((url, init = {}) => {
    const method = init.method || 'GET';

    if (url === '/api/file?path=notes%2FAlpha.md' && method === 'GET') {
      return Promise.resolve(jsonResponse({ content: 'Alpha body' }));
    }
    if (url === '/api/file-info?path=notes%2FAlpha.md') return Promise.resolve(fileInfo('Alpha'));
    if (url === '/api/notes/backlinks?path=notes%2FAlpha.md') return Promise.resolve(jsonResponse([]));

    if (url === '/api/file?path=notes%2FBeta.md' && method === 'GET') {
      betaRequests += 1;
      if (betaRequests === 1) {
        return new Promise((resolve) => {
          resolveFirstBeta = () => resolve(jsonResponse({ content: 'Beta body' }));
        });
      }
      return Promise.resolve(jsonResponse({ content: 'Beta body' }));
    }
    if (url === '/api/file-info?path=notes%2FBeta.md') return Promise.resolve(fileInfo('Beta'));
    if (url === '/api/notes/backlinks?path=notes%2FBeta.md') return Promise.resolve(jsonResponse([]));

    return Promise.resolve(jsonResponse({ message: `Unhandled request: ${method} ${url}` }, false));
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  const { component } = render(Editor, {
    currentFile: { path: 'notes/Alpha.md', name: 'Alpha.md', isDir: false },
  });
  await waitFor(() => expect(screen.getByDisplayValue('Alpha')).toBeTruthy());

  component.$set({ currentFile: { path: 'notes/Beta.md', name: 'Beta.md', isDir: false } });
  await tick();
  await waitFor(() => expect(betaRequests).toBe(1));

  // Вернулись на уже открытую Alpha, пока Beta ещё грузится: новой загрузки нет.
  component.$set({ currentFile: { path: 'notes/Alpha.md', name: 'Alpha.md', isDir: false } });
  await tick();

  // Ответ на Beta приходит после возврата и отбрасывается, но загрузка завершается.
  resolveFirstBeta();
  await waitFor(() => expect(screen.getByTestId('editor-footer').inert).toBe(false));

  // Теперь Beta снова выбрана: она должна загрузиться, а не остаться на Alpha.
  component.$set({ currentFile: { path: 'notes/Beta.md', name: 'Beta.md', isDir: false } });
  await tick();
  await waitFor(() => expect(betaRequests).toBe(2));
  await waitFor(() => expect(screen.getByDisplayValue('Beta')).toBeTruthy());
});

function wideWindowMedia() {
  const original = window.matchMedia;
  const wide = (query) => ({
    matches: query.includes('min-width: 1024px'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: wide });
  return () => Object.defineProperty(window, 'matchMedia', { configurable: true, value: original });
}

function outlineNote(content) {
  installFetchMock(createDefaultResponses('notes/Work/Alpha.md', {
    '/api/file?path=notes%2FWork%2FAlpha.md': jsonResponse({ content }),
    '/api/file-info?path=notes%2FWork%2FAlpha.md': jsonResponse({
      created: '2026-05-07T10:00:00.000Z',
      modified: '2026-05-07T12:00:00.000Z',
      metadata: { title: 'Alpha', tags: [] },
    }),
  }));
  render(Editor, {
    currentFile: { path: 'notes/Work/Alpha.md', name: 'Alpha.md', isDir: false },
  });
}

test('Editor показывает структуру сама от трёх заголовков; один переключатель прячет её и помнит выбор', async () => {
  const restore = wideWindowMedia();
  try {
    outlineNote('# Alpha\n\n## One\n\n## Two\n\nBody');
    await waitFor(() => expect(screen.getByDisplayValue('Alpha')).toBeTruthy());
    const toggle = screen.getByTestId('outline-toggle');
    await waitFor(() => expect(screen.getByTestId('outline-panel').className).toContain('lg:block'));
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await fireEvent.click(toggle);
    expect(screen.getByTestId('outline-panel').className).toContain('lg:hidden');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(localStorage.getItem('outlineHidden')).toBe('true');

    await fireEvent.click(toggle);
    expect(screen.getByTestId('outline-panel').className).toContain('lg:block');
    expect(localStorage.getItem('outlineHidden')).toBe('false');
  } finally {
    restore();
    outlineHidden.set(false);
  }
});

test('Editor не дублирует заголовки короткой заметки колонкой, но открывает её по кнопке', async () => {
  const restore = wideWindowMedia();
  try {
    outlineNote('# Alpha\n\nBody');
    await waitFor(() => expect(screen.getByDisplayValue('Alpha')).toBeTruthy());
    expect(screen.getByTestId('outline-panel').className).toContain('lg:hidden');

    await fireEvent.click(screen.getByTestId('outline-toggle'));
    expect(screen.getByTestId('outline-panel').className).toContain('lg:block');
  } finally {
    restore();
    outlineHidden.set(false);
  }
});

test('Editor переименовывает вложение и обновляет markdown-ссылку', async () => {
  const fetchMock = installFetchMock(createDefaultResponses('notes/Inbox.md', {
    '/api/file?path=notes%2FInbox.md': jsonResponse({ content: '![old](_attachments/old.webp)' }),
    'POST /api/attachments/rename': jsonResponse({
      path: 'notes/_attachments/new.webp',
      relativePath: '_attachments/new.webp',
      name: 'new.webp',
      oldPath: 'notes/_attachments/old.webp',
      oldRelativePath: '_attachments/old.webp',
    }),
    'POST /api/file?path=notes%2FInbox.md': jsonResponse({ message: 'Saved' }),
  }));

  render(Editor, {
    currentFile: { path: 'notes/Inbox.md', name: 'Inbox.md', isDir: false },
  });

  const image = await waitFor(() => {
    const node = document.querySelector('img[data-attachment-path]');
    expect(node).toBeTruthy();
    return node;
  });
  await fireEvent.click(image);
  const input = await waitFor(() => screen.getByDisplayValue('old.webp'));
  await fireEvent.input(input, { target: { value: 'new.webp' } });
  await fireEvent.click(screen.getByText(uiText.editor.renameImage));

  expect(fetchMock).toHaveBeenCalledWith('/api/attachments/rename', expect.objectContaining({
    method: 'POST',
  }));
  const renameCall = fetchMock.mock.calls.find(([url]) => url === '/api/attachments/rename');
  expect(JSON.parse(renameCall[1].body)).toEqual({
    notePath: 'notes/Inbox.md',
    path: 'notes/_attachments/old.webp',
    newName: 'new.webp',
  });
  await waitFor(() => expect(screen.getByTestId('rich-editor-input').value).toContain('![new](_attachments/new.webp)'));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/file?path=notes%2FInbox.md', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ content: '![new](_attachments/new.webp)' }),
  })));
});

test('Editor удаляет заметку', async () => {
  const fetchMock = installFetchMock(createDefaultResponses('notes/Inbox.md', {
    'DELETE /api/file?path=notes%2FInbox.md': jsonResponse({ message: 'Deleted' }),
  }));

  const { component } = render(Editor, {
    currentFile: { path: 'notes/Inbox.md', name: 'Inbox.md', isDir: false },
  });
  const deletedHandler = vi.fn();
  component.$on('fileDeleted', deletedHandler);

  await waitFor(() => expect(screen.getByDisplayValue('Inbox')).toBeTruthy());

  // The trash is reversible, so the note goes at once and the app offers to undo it.
  editorAction.set('delete');
  await tick();

  await waitFor(() => expect(deletedHandler).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledWith('/api/file?path=notes%2FInbox.md', { method: 'DELETE' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(get(trashedNotice).notes).toEqual([{ path: 'notes/Inbox.md', name: 'Inbox', pinned: false }]);
  trashedNotice.set(null);
});

test('Editor не перетирает новые правки после завершения autosave', async () => {
  const path = 'notes/Inbox.md';
  const encodedPath = encodeURIComponent(path);
  let saveResolve;
  let fileLoadCount = 0;
  const fetchMock = vi.fn((url, init = {}) => {
    const method = init.method || 'GET';

    if (url === `/api/file?path=${encodedPath}` && method === 'GET') {
      fileLoadCount += 1;
      return Promise.resolve(jsonResponse({
        content: fileLoadCount === 1 ? 'Initial body' : 'Server copy after save',
      }));
    }

    if (url === `/api/file-info?path=${encodedPath}`) {
      return Promise.resolve(jsonResponse({
        created: '2026-05-07T10:00:00.000Z',
        modified: '2026-05-07T12:00:00.000Z',
        metadata: { title: 'Inbox', tags: [] },
      }));
    }

    if (url === `/api/notes/backlinks?path=${encodedPath}`) {
      return Promise.resolve(jsonResponse([]));
    }

    if (url === `/api/file?path=${encodedPath}` && method === 'POST') {
      return new Promise((resolve) => {
        saveResolve = () => resolve(jsonResponse({ message: 'Saved' }));
      });
    }

    return Promise.resolve(jsonResponse({ message: `Unhandled request: ${method} ${url}` }, false));
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Editor, {
    currentFile: { path, name: 'Inbox.md', isDir: false },
  });

  await waitFor(() => expect(screen.getByDisplayValue('Inbox')).toBeTruthy());
  await waitFor(() => expect(screen.queryByText(uiText.editor.gatheringThoughts)).toBeNull());
  const editorInput = screen.getByTestId('rich-editor-input');
  expect(editorInput.value).toBe('Initial body');

  vi.useFakeTimers();
  await fireEvent.input(editorInput, { target: { value: 'First edit' } });
  await vi.advanceTimersByTimeAsync(1500);

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/file?path=${encodedPath}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: 'First edit' }),
      })
    );
  });

  await fireEvent.input(editorInput, { target: { value: 'Second edit' } });
  saveResolve();
  await tick();
  await Promise.resolve();
  await tick();

  expect(editorInput.value).toBe('Second edit');
  expect(fileLoadCount).toBe(1);
});

test('Editor сохраняет последнюю правку по интервалу даже при непрерывном вводе', async () => {
  const path = 'notes/Inbox.md';
  const encodedPath = encodeURIComponent(path);
  const fetchMock = installFetchMock(createDefaultResponses(path, {
    [`/api/file?path=${encodedPath}`]: jsonResponse({ content: 'Initial body' }),
    [`POST /api/file?path=${encodedPath}`]: jsonResponse({
      message: 'Saved',
      modified: '2026-05-07T12:01:30.000Z',
    }),
  }));

  render(Editor, {
    currentFile: { path, name: 'Inbox.md', isDir: false },
  });

  await waitFor(() => expect(screen.getByDisplayValue('Inbox')).toBeTruthy());
  await waitFor(() => expect(screen.queryByText(uiText.editor.gatheringThoughts)).toBeNull());
  const editorInput = screen.getByTestId('rich-editor-input');

  vi.useFakeTimers();
  await fireEvent.input(editorInput, { target: { value: 'First edit' } });
  await vi.advanceTimersByTimeAsync(800);
  await fireEvent.input(editorInput, { target: { value: 'Second edit' } });
  await vi.advanceTimersByTimeAsync(700);

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/file?path=${encodedPath}`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: 'Second edit' }),
      })
    );
  });
});

test('Editor сохраняет старую заметку при быстром переключении во время autosave', async () => {
  const alphaPath = 'notes/Alpha.md';
  const betaPath = 'notes/Beta.md';
  const saveAlpha = deferred();
  const fetchMock = vi.fn((url, init = {}) => {
    const method = init.method || 'GET';

    if (url === `/api/file?path=${encodeURIComponent(alphaPath)}` && method === 'GET') {
      return Promise.resolve(jsonResponse({ content: 'Alpha initial' }));
    }
    if (url === `/api/file-info?path=${encodeURIComponent(alphaPath)}`) {
      return Promise.resolve(jsonResponse({
        created: '2026-05-07T10:00:00.000Z',
        modified: '2026-05-07T12:00:00.000Z',
        metadata: { title: 'Alpha', tags: [] },
      }));
    }
    if (url === `/api/notes/backlinks?path=${encodeURIComponent(alphaPath)}`) {
      return Promise.resolve(jsonResponse([]));
    }
    if (url === `/api/file?path=${encodeURIComponent(alphaPath)}` && method === 'POST') {
      return saveAlpha.promise;
    }

    if (url === `/api/file?path=${encodeURIComponent(betaPath)}` && method === 'GET') {
      return Promise.resolve(jsonResponse({ content: 'Beta body' }));
    }
    if (url === `/api/file-info?path=${encodeURIComponent(betaPath)}`) {
      return Promise.resolve(jsonResponse({
        created: '2026-05-08T10:00:00.000Z',
        modified: '2026-05-08T12:00:00.000Z',
        metadata: { title: 'Beta', tags: [] },
      }));
    }
    if (url === `/api/notes/backlinks?path=${encodeURIComponent(betaPath)}`) {
      return Promise.resolve(jsonResponse([]));
    }

    return Promise.resolve(jsonResponse({ message: `Unhandled request: ${method} ${url}` }, false));
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  const { component } = render(Editor, {
    currentFile: { path: alphaPath, name: 'Alpha.md', isDir: false },
  });

  await waitFor(() => expect(screen.getByDisplayValue('Alpha')).toBeTruthy());
  const editorInput = screen.getByTestId('rich-editor-input');

  vi.useFakeTimers();
  await fireEvent.input(editorInput, { target: { value: 'Alpha edit before switch' } });
  await vi.advanceTimersByTimeAsync(1500);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    `/api/file?path=${encodeURIComponent(alphaPath)}`,
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ content: 'Alpha edit before switch' }),
    })
  ));

  component.$set({ currentFile: { path: betaPath, name: 'Beta.md', isDir: false } });
  await tick();
  await waitFor(() => expect(editorInput.value).toBe('Beta body'));

  saveAlpha.resolve(jsonResponse({ message: 'Saved' }));
  await tick();
  await Promise.resolve();

  expect(editorInput.value).toBe('Beta body');
  expect(fetchMock.mock.calls.some(([url, init]) =>
    url === `/api/file?path=${encodeURIComponent(betaPath)}` && init?.method === 'POST'
  )).toBe(false);
});

test('Editor не применяет результат смены цвета к новой заметке после переключения', async () => {
  const alphaPath = 'notes/Alpha.md';
  const betaPath = 'notes/Beta.md';
  const saveAlpha = deferred();
  const colorSave = deferred();
  const fetchMock = vi.fn((url, init = {}) => {
    const method = init.method || 'GET';

    if (url === `/api/file?path=${encodeURIComponent(alphaPath)}` && method === 'GET') {
      return Promise.resolve(jsonResponse({ content: 'Alpha body' }));
    }
    if (url === `/api/file-info?path=${encodeURIComponent(alphaPath)}`) {
      return Promise.resolve(jsonResponse({
        created: '2026-05-07T10:00:00.000Z',
        modified: '2026-05-07T12:00:00.000Z',
        color: '#fabd2f',
        metadata: { title: 'Alpha', tags: [] },
      }));
    }
    if (url === `/api/notes/backlinks?path=${encodeURIComponent(alphaPath)}`) {
      return Promise.resolve(jsonResponse([]));
    }
    if (url === `/api/file?path=${encodeURIComponent(alphaPath)}` && method === 'POST') {
      return saveAlpha.promise;
    }
    if (url === `/api/directory/icon?path=${encodeURIComponent(alphaPath)}` && method === 'POST') {
      return colorSave.promise;
    }

    if (url === `/api/file?path=${encodeURIComponent(betaPath)}` && method === 'GET') {
      return Promise.resolve(jsonResponse({ content: 'Beta body' }));
    }
    if (url === `/api/file-info?path=${encodeURIComponent(betaPath)}`) {
      return Promise.resolve(jsonResponse({
        created: '2026-05-08T10:00:00.000Z',
        modified: '2026-05-08T12:00:00.000Z',
        color: '#8ec07c',
        metadata: { title: 'Beta', tags: [] },
      }));
    }
    if (url === `/api/notes/backlinks?path=${encodeURIComponent(betaPath)}`) {
      return Promise.resolve(jsonResponse([]));
    }

    return Promise.resolve(jsonResponse({ message: `Unhandled request: ${method} ${url}` }, false));
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  const { component } = render(Editor, {
    currentFile: { path: alphaPath, name: 'Alpha.md', isDir: false },
  });
  const colorChangedHandler = vi.fn();
  component.$on('noteColorChanged', colorChangedHandler);

  await waitFor(() => expect(screen.getByDisplayValue('Alpha')).toBeTruthy());
  const editorInput = screen.getByTestId('rich-editor-input');

  vi.useFakeTimers();
  await fireEvent.input(editorInput, { target: { value: 'Alpha edit while recoloring' } });
  await vi.advanceTimersByTimeAsync(1500);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    `/api/file?path=${encodeURIComponent(alphaPath)}`,
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ content: 'Alpha edit while recoloring' }),
    })
  ));
  vi.useRealTimers();

  await fireEvent.click(screen.getByRole('button', { name: uiText.editor.moreActions }));
  await fireEvent.click(screen.getByRole('menuitem', { name: uiText.editor.noteColor }));
  await fireEvent.click(screen.getByRole('button', { name: uiText.app.board.applyColor('#83a598') }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    `/api/directory/icon?path=${encodeURIComponent(alphaPath)}`,
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ color: '#83a598' }),
    })
  ));

  component.$set({ currentFile: { path: betaPath, name: 'Beta.md', isDir: false } });
  await tick();
  await waitFor(() => expect(screen.getByDisplayValue('Beta')).toBeTruthy());
  saveAlpha.resolve(jsonResponse({ message: 'Saved' }));
  colorSave.resolve(jsonResponse({ message: 'Icon updated' }));
  await tick();
  await Promise.resolve();

  expect(colorChangedHandler).not.toHaveBeenCalled();
  expect(screen.getByTestId('editor-shell').getAttribute('style')).toContain('--note-accent: #8ec07c');
});

test('Editor не очищает текущую поверхность, если следующая заметка удалена во время загрузки', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const alphaPath = 'notes/Alpha.md';
  const betaPath = 'notes/Beta.md';
  const fetchMock = vi.fn((url, init = {}) => {
    const method = init.method || 'GET';

    if (url === `/api/file?path=${encodeURIComponent(alphaPath)}` && method === 'GET') {
      return Promise.resolve(jsonResponse({ content: 'Alpha body' }));
    }
    if (url === `/api/file-info?path=${encodeURIComponent(alphaPath)}`) {
      return Promise.resolve(jsonResponse({
        created: '2026-05-07T10:00:00.000Z',
        modified: '2026-05-07T12:00:00.000Z',
        metadata: { title: 'Alpha', tags: [] },
      }));
    }
    if (url === `/api/notes/backlinks?path=${encodeURIComponent(alphaPath)}`) {
      return Promise.resolve(jsonResponse([]));
    }

    if (url === `/api/file?path=${encodeURIComponent(betaPath)}` && method === 'GET') {
      return Promise.resolve(jsonResponse({ detail: 'Not found' }, false));
    }

    return Promise.resolve(jsonResponse({ message: `Unhandled request: ${method} ${url}` }, false));
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  const { component } = render(Editor, {
    currentFile: { path: alphaPath, name: 'Alpha.md', isDir: false },
  });
  const deletedHandler = vi.fn();
  component.$on('fileDeleted', deletedHandler);

  await waitFor(() => expect(screen.getByDisplayValue('Alpha')).toBeTruthy());
  const editorInput = screen.getByTestId('rich-editor-input');
  expect(editorInput.value).toBe('Alpha body');

  component.$set({ currentFile: { path: betaPath, name: 'Beta.md', isDir: false } });
  await tick();

  await waitFor(() => expect(deletedHandler).toHaveBeenCalledTimes(1));
  expect(editorInput.value).toBe('Alpha body');
  expect(screen.queryByText(uiText.editor.gatheringThoughts)).toBeNull();
  expect(fetchMock.mock.calls.filter(([url]) => url === `/api/file?path=${encodeURIComponent(betaPath)}`).length).toBe(1);
});

test('переключатель показывает исходный Markdown и возвращает визуальный редактор', async () => {
  const notePath = 'notes/Work/Alpha.md';
  const encodedPath = encodeURIComponent(notePath);
  const saved = [];
  const fetchMock = vi.fn((url, options = {}) => {
    const method = options.method || 'GET';
    if (url === `/api/file?path=${encodedPath}` && method === 'GET') {
      return Promise.resolve(jsonResponse({ content: 'Строка один\n\n- [x] Сделано\n- [ ] Ждёт\n' }));
    }
    if (url === `/api/file?path=${encodedPath}` && method === 'POST') {
      saved.push(options);
      return Promise.resolve(jsonResponse({ message: 'ok' }));
    }
    if (url === `/api/file-info?path=${encodedPath}`) {
      return Promise.resolve(jsonResponse({ created: '', modified: '', metadata: { title: 'Alpha', tags: [] } }));
    }
    if (url === `/api/notes/backlinks?path=${encodedPath}`) return Promise.resolve(jsonResponse([]));
    if (url === '/api/settings' || url.includes('/api/settings')) return Promise.resolve(jsonResponse({}));
    return Promise.resolve(jsonResponse({}));
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  vi.useFakeTimers();
  render(Editor, { currentFile: { path: notePath, name: 'Alpha.md', isDir: false } });
  await waitFor(() => expect(screen.getByTestId('rich-editor-input')).toBeTruthy());

  await fireEvent.click(screen.getByRole('button', { name: uiText.editor.moreActions }));
  const toggle = screen.getByTestId('toggle-raw-mode');
  expect(screen.queryByTestId('raw-source')).toBeNull();

  await fireEvent.click(toggle);
  const raw = await screen.findByTestId('raw-source');
  expect(raw.value).toContain('- [x] Сделано');
  expect(screen.queryByTestId('rich-editor-input')).toBeNull();

  await fireEvent.input(raw, { target: { value: 'Правка из исходника\n' } });
  await waitFor(() => expect(screen.getByTestId('raw-source').value).toBe('Правка из исходника\n'));

  await fireEvent.click(screen.getByRole('button', { name: uiText.editor.moreActions }));
  await fireEvent.click(screen.getByTestId('toggle-raw-mode'));
  await waitFor(() => expect(screen.getByTestId('rich-editor-input')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('rich-editor-input').value).toBe('Правка из исходника\n'));

  // Автосейв срабатывает через 1.5 секунды после последнего изменения.
  await vi.advanceTimersByTimeAsync(1600);
  await waitFor(() => expect(saved.length).toBeGreaterThan(0));
  const payload = JSON.parse(String(saved.at(-1).body));
  expect(payload.content).toContain('Правка из исходника');
  vi.useRealTimers();
});

test('окошко свойств открывается по кнопке нижней панели и закрывается по Escape', async () => {
  installFetchMock(createDefaultResponses('notes/Work/Alpha.md', {
    '/api/file?path=notes%2FWork%2FAlpha.md': jsonResponse({ content: 'Alpha body' }),
    '/api/file-info?path=notes%2FWork%2FAlpha.md': jsonResponse({
      created: '2026-05-07T10:00:00.000Z',
      modified: '2026-05-07T12:00:00.000Z',
      metadata: { title: 'Alpha', tags: ['alpha'] },
    }),
  }));

  render(Editor, {
    currentFile: { path: 'notes/Work/Alpha.md', name: 'Alpha.md', isDir: false },
  });
  await waitFor(() => expect(screen.getByDisplayValue('Alpha')).toBeTruthy());

  const tagsButton = screen.getByTestId('property-tags-button');
  expect(screen.queryByTestId('property-panel')).toBeNull();
  await fireEvent.click(tagsButton);
  expect(screen.getByTestId('property-panel').getAttribute('data-panel')).toBe('tags');
  expect(tagsButton.getAttribute('aria-expanded')).toBe('true');

  // Одно окошко за раз: открытие другого свойства заменяет текущее.
  await fireEvent.click(screen.getByTestId('property-due-button'));
  expect(screen.getByTestId('property-panel').getAttribute('data-panel')).toBe('due');

  await fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByTestId('property-panel')).toBeNull();
  expect(screen.getByTestId('property-due-button').getAttribute('aria-expanded')).toBe('false');
});

test('экспорт открывается окошком и предлагает Markdown, HTML, текст и PDF', async () => {
  installFetchMock(createDefaultResponses('notes/Work/Alpha.md', {
    '/api/file?path=notes%2FWork%2FAlpha.md': jsonResponse({ content: 'Alpha body' }),
    '/api/file-info?path=notes%2FWork%2FAlpha.md': jsonResponse({
      created: '2026-05-07T10:00:00.000Z',
      modified: '2026-05-07T12:00:00.000Z',
      metadata: { title: 'Alpha', tags: [] },
    }),
  }));

  render(Editor, {
    currentFile: { path: 'notes/Work/Alpha.md', name: 'Alpha.md', isDir: false },
  });
  await waitFor(() => expect(screen.getByDisplayValue('Alpha')).toBeTruthy());

  await fireEvent.click(screen.getByTestId('export-button'));
  const panel = screen.getByTestId('property-panel');
  expect(panel.getAttribute('data-panel')).toBe('export');
  for (const id of ['md', 'html', 'txt', 'pdf']) {
    expect(within(panel).getByTestId(`export-${id}`)).toBeTruthy();
  }
  await fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByTestId('property-panel')).toBeNull();
});

test('конфликт без git: ответ 400 «Git not initialized» сохраняет разобранный текст и снимает «только чтение»', async () => {
  const path = 'notes/Inbox.md';
  const encodedPath = encodeURIComponent(path);
  const conflicted = 'Начало.\n\n<<<<<<< HEAD\nМоя версия.\n=======\nВерсия с телефона.\n>>>>>>> origin/master\n\nКонец.';
  const resolved = 'Начало.\n\nМоя версия.\n\nКонец.';
  // A vault without git: resolve-note refuses before it touches the file, so the editor saves the text itself.
  const noGitRepo = { ok: false, status: 400, async json() { return { detail: 'Git not initialized' }; } };
  const fetchMock = installFetchMock(createDefaultResponses(path, {
    [`/api/file?path=${encodedPath}`]: jsonResponse({ content: conflicted, version: 'v-conflicted' }),
    '/api/git/status': jsonResponse({ initialized: false }),
    '/api/git/conflicts': jsonResponse([]),
    'POST /api/git/resolve-note': noGitRepo,
    [`POST /api/file?path=${encodedPath}`]: jsonResponse({ message: 'Saved', version: 'v-resolved' }),
  }));
  // The bodies of the note's saves, in the order the server received them.
  const saves = () => fetchMock.mock.calls
    .filter(([url, init]) => url === `/api/file?path=${encodedPath}` && init?.method === 'POST')
    .map(([, init]) => JSON.parse(init.body));

  render(Editor, { currentFile: { path, name: 'Inbox.md', isDir: false } });
  await waitFor(() => expect(screen.getByTestId('conflict-surface')).toBeTruthy());

  await fireEvent.click(screen.getByTestId('conflict-whole-ours'));
  await waitFor(() => expect(saves()).toEqual([{ content: resolved }]));
  await waitFor(() => expect(screen.queryByTestId('conflict-surface')).toBeNull());
  expect(screen.getByTestId('rich-editor-input').value).toBe(resolved);

  // Editable again: the next edit is saved to disk too.
  vi.useFakeTimers();
  await fireEvent.input(screen.getByTestId('rich-editor-input'), { target: { value: 'Правка после разбора.' } });
  await vi.advanceTimersByTimeAsync(1500);
  expect(saves().at(-1).content).toBe('Правка после разбора.');
});
