import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { editorAction } from '../stores.js';
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

test('Editor загружает заметку и показывает local navigation', async () => {
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
  expect(screen.queryByText('#alpha')).toBeNull();
  expect(screen.getAllByText('Beta').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Gamma').length).toBeGreaterThan(0);
  const localNavigation = screen.getByTestId('local-navigation');
  expect(within(localNavigation).getByText(uiText.editor.localNavigation)).toBeTruthy();
  await fireEvent.click(within(localNavigation).getByRole('button', { name: /Beta/ }));
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
  expect(screen.getByText('Work')).toBeTruthy();
  expect(screen.queryByText(uiText.editorHeader.revealInTree)).toBeNull();
  expect(screen.queryByPlaceholderText(uiText.editorHeader.tagPlaceholder)).toBeNull();
  expect(screen.queryByText('#release')).toBeNull();
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
  await fireEvent.click(screen.getByRole('button', { name: uiText.editor.noteColor }));
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

  editorAction.set('delete');
  await tick();
  await waitFor(() => expect(screen.getByText(uiText.editor.deletePermanently)).toBeTruthy());
  await fireEvent.click(screen.getByText(uiText.editor.deletePermanently));

  await waitFor(() => expect(deletedHandler).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledWith('/api/file?path=notes%2FInbox.md', { method: 'DELETE' });
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

  await fireEvent.click(screen.getByRole('button', { name: uiText.editor.noteColor }));
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
