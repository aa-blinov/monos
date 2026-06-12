import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, test, expect, vi } from 'vitest';
import Settings from './Settings.svelte';
import { locale, uiText } from '../lib/strings.js';
import { editorState } from '../stores.js';

function jsonResponse(data, ok = true) {
  return {
    ok,
    async json() {
      return data;
    },
  };
}

function createFetchMock(overrides = {}) {
  const statusQueue = overrides.statusQueue ? [...overrides.statusQueue] : [
    { initialized: true, current_branch: 'main', status: 'dirty', ahead: 1, behind: 0, last_sync: null },
    { initialized: true, current_branch: 'main', status: 'dirty', ahead: 1, behind: 0, last_sync: null },
    { initialized: true, current_branch: 'main', status: 'clean', ahead: 0, behind: 0, last_sync: '2026-05-07T10:00:00.000Z' },
  ];

  return vi.fn(async (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input.url;
    const url = rawUrl.startsWith('http') ? new URL(rawUrl).pathname + new URL(rawUrl).search : rawUrl;
    const method = init.method || 'GET';

    if (url === '/api/settings' && method === 'POST') {
      return jsonResponse({ message: 'Saved' });
    }

    if (url === '/api/settings') {
      return jsonResponse(overrides.settings ?? {
        theme: 'nord',
        editMode: 'source',
        git_token: 'ghp_test',
        git_owner: 'alice',
        git_repo: 'alice/notes',
      });
    }

    if (url === '/api/git/status') {
      return jsonResponse(statusQueue.shift() || statusQueue.at(-1) || {
        initialized: true,
        current_branch: 'main',
        status: 'clean',
        ahead: 0,
        behind: 0,
        last_sync: '2026-05-07T10:00:00.000Z',
      });
    }

    if (url === '/api/git/repos?token=ghp_test') {
      return jsonResponse(['alice/notes', 'alice/wiki']);
    }

    if (url === '/api/git/branches?token=ghp_test&repo=alice%2Fnotes') {
      return jsonResponse(['main', 'dev']);
    }

    if (url === '/api/git/setup' && method === 'POST') {
      return jsonResponse({ message: 'Connected' });
    }

    if (url === '/api/git/sync' && method === 'POST') {
      return jsonResponse({ message: 'Synced', conflicts: false });
    }

    if (url === '/api/git/conflicts') {
      return jsonResponse(['Conflict.md', 'Topic/Alpha.md']);
    }

    if (url === '/api/git/conflicts/resolve' && method === 'POST') {
      return jsonResponse({ message: 'Conflicts resolved' });
    }

    if (url === '/api/git/user?token=ghp_test') {
      return jsonResponse({ login: 'alice' });
    }

    return overrides.fallback ? overrides.fallback(url, init) : jsonResponse({}, false);
  });
}

beforeEach(() => {
  localStorage.clear();
  locale.set('en');
  editorState.set({ path: null, dirty: false, saving: false });
});

test('Settings загружает настройки и принимает массивы из git API', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  const tokenInput = screen.getByLabelText(uiText.settings.personalAccessToken);
  await fireEvent.input(tokenInput, { target: { value: 'ghp_test' } });
  await fireEvent.click(screen.getByRole('button', { name: uiText.settings.authenticate }));

  await waitFor(() => expect(screen.getByRole('button', { name: uiText.settings.reset })).toBeTruthy());
  expect(screen.getByRole('option', { name: 'alice/wiki' })).toBeTruthy();
  expect(screen.getByLabelText(uiText.settings.owner).value).toBe('alice');

  const repository = screen.getByLabelText(uiText.settings.repository);
  await fireEvent.change(repository, { target: { value: 'alice/notes' } });

  await waitFor(() => expect(screen.getByRole('option', { name: 'dev' })).toBeTruthy());
  expect(fetchMock).toHaveBeenCalledWith('/api/git/branches?token=ghp_test&repo=alice%2Fnotes');
});

test('Settings не запускает git setup без явного действия пользователя', async () => {
  const fetchMock = createFetchMock({ settings: {} });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  const tokenInput = screen.getByLabelText(uiText.settings.personalAccessToken);
  await fireEvent.input(tokenInput, { target: { value: 'ghp_test' } });
  await fireEvent.click(screen.getByRole('button', { name: uiText.settings.authenticate }));

  await waitFor(() => expect(screen.getByRole('option', { name: 'alice/wiki' })).toBeTruthy());
  expect(fetchMock).not.toHaveBeenCalledWith('/api/git/setup', expect.anything());

  const repository = screen.getByLabelText(uiText.settings.repository);
  await fireEvent.change(repository, { target: { value: 'alice/notes' } });

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/settings', expect.anything()));
  await waitFor(() => expect(screen.getByRole('button', { name: uiText.settings.connectRepository }).disabled).toBe(false));
  expect(fetchMock).not.toHaveBeenCalledWith('/api/git/setup', expect.anything());

  await fireEvent.click(screen.getByRole('button', { name: uiText.settings.connectRepository }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/git/setup', expect.anything()));
});

test('Settings переключает язык интерфейса и сохраняет locale', async () => {
  const fetchMock = createFetchMock({ settings: {} });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  const languageSelect = await waitFor(() => screen.getByLabelText(uiText.settings.interfaceLanguage));
  await fireEvent.change(languageSelect, { target: { value: 'ru' } });

  await waitFor(() => expect(screen.getByText('Настройки')).toBeTruthy());
  expect(localStorage.getItem('locale')).toBe('ru');
  expect(fetchMock).toHaveBeenCalledWith('/api/settings', expect.objectContaining({
    method: 'POST',
    body: expect.stringContaining('"locale":"ru"'),
  }));
});

test('Settings показывает список конфликтов из массива путей', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  await waitFor(() => expect(screen.getByText('main')).toBeTruthy());
  await fireEvent.click(screen.getByRole('button', { name: uiText.settings.viewConflicts }));

  await waitFor(() => expect(screen.getByText('Conflict.md')).toBeTruthy());
  expect(screen.getByText('Topic/Alpha.md')).toBeTruthy();
});

test('Settings после sync обновляет статус через /api/git/status', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  await fireEvent.click(screen.getByRole('button', { name: uiText.settings.refreshStatus }));
  await waitFor(() => expect(screen.getByRole('button', { name: uiText.settings.syncNow })).toBeTruthy());

  const statusCallsBeforeSync = fetchMock.mock.calls.filter(([url]) => url === '/api/git/status').length;
  await fireEvent.click(screen.getByRole('button', { name: uiText.settings.syncNow }));

  await waitFor(() => {
    const statusCallsAfterSync = fetchMock.mock.calls.filter(([url]) => url === '/api/git/status').length;
    expect(statusCallsAfterSync).toBeGreaterThan(statusCallsBeforeSync);
  });
  expect(fetchMock).toHaveBeenCalledWith('/api/git/sync', { method: 'POST' });
});

test('Settings блокирует sync при несохранённой текущей заметке', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  await fireEvent.click(screen.getByRole('button', { name: uiText.settings.refreshStatus }));
  const syncButton = await waitFor(() => screen.getByRole('button', { name: uiText.settings.syncNow }));
  editorState.set({ path: 'notes/Inbox.md', dirty: true, saving: false });
  await waitFor(() => expect(syncButton.disabled).toBe(true));
  expect(syncButton.disabled).toBe(true);
  await fireEvent.click(syncButton);

  expect(fetchMock).not.toHaveBeenCalledWith('/api/git/sync', { method: 'POST' });
});
