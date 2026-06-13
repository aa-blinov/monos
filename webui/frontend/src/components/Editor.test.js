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
    async json() {
      return data;
    },
  };
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

test('Editor форматирует заметки и диспатчит formatComplete', async () => {
  const fetchMock = installFetchMock(createDefaultResponses('notes/Inbox.md', {
    'POST /api/format': jsonResponse({ message: 'Formatted. Updated: 3' }),
  }));

  const { component } = render(Editor, {
    currentFile: { path: 'notes/Inbox.md', name: 'Inbox.md', isDir: false },
  });
  const formatHandler = vi.fn();
  component.$on('formatComplete', formatHandler);

  await waitFor(() => expect(screen.getByDisplayValue('Inbox')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('rich-editor-input')).toBeTruthy());

  editorAction.set('format');
  await tick();

  await waitFor(() => expect(screen.getByText('Formatted. Updated: 3')).toBeTruthy());
  expect(formatHandler).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith('/api/format', { method: 'POST' });
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
  await fireEvent.click(screen.getByRole('button', { name: uiText.editor.noteColor }));
  await fireEvent.click(screen.getByRole('button', { name: uiText.app.board.applyColor('#8ec07c') }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/directory/icon?path=notes%2FInbox.md', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ color: '#8ec07c' }),
  })));
  expect(colorChangedHandler).toHaveBeenCalledWith(expect.objectContaining({
    detail: { path: 'notes/Inbox.md', color: '#8ec07c' },
  }));
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
