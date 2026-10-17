import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { beforeEach, test, expect, vi } from 'vitest';
import Settings from './Settings.svelte';
import { locale, uiText } from '../lib/strings.js';
import { editorState, themeMode } from '../stores.js';
import appPackage from '../../../../package.json';

function jsonResponse(data, ok = true) {
  return {
    ok,
    async json() {
      return data;
    },
  };
}

// The page loads the saved settings when it opens. A token typed before that load finishes would be taken
// for a saved one, so a test types only after the load.
async function settingsLoaded(fetchMock) {
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/settings'));
  await new Promise((resolve) => setTimeout(resolve, 0));
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
      return overrides.setup ? overrides.setup() : jsonResponse({ message: 'Connected' });
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
  themeMode.set('system');
  editorState.set({ path: null, dirty: false, saving: false });
});

test('Settings загружает настройки и принимает массивы из git API', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  // A saved token means the page opens already signed in, with the repositories loaded.
  await waitFor(() => expect(screen.getByRole('button', { name: uiText.settings.reset })).toBeTruthy());
  expect(screen.queryByRole('button', { name: uiText.settings.authenticate })).toBeNull();
  await waitFor(() => expect(screen.getByRole('option', { name: 'alice/wiki' })).toBeTruthy());
  expect(screen.getByLabelText(uiText.settings.owner).value).toBe('alice');

  const repository = screen.getByLabelText(uiText.settings.repository);
  await fireEvent.change(repository, { target: { value: 'alice/notes' } });

  await waitFor(() => expect(screen.getByRole('option', { name: 'dev' })).toBeTruthy());
  expect(fetchMock).toHaveBeenCalledWith('/api/git/branches?token=ghp_test&repo=alice%2Fnotes');
});

test('Settings не подставляет чужого владельца: поле пустое до авторизации', async () => {
  const fetchMock = createFetchMock({ settings: {} });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  await waitFor(() => expect(screen.getByLabelText(uiText.settings.owner).value).toBe(''));
});

test('Settings показывает версию приложения в футере', async () => {
  const fetchMock = createFetchMock({ settings: {} });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  await waitFor(() => expect(screen.getByText(`${uiText.settings.version} ${appPackage.version}`)).toBeTruthy());
});

test('Settings не запускает git setup без явного действия пользователя', async () => {
  const fetchMock = createFetchMock({ settings: {} });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);
  await settingsLoaded(fetchMock);

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

test('Settings переносит режим темы над выбором цветовой темы', async () => {
  const fetchMock = createFetchMock({ settings: {} });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  await waitFor(() => expect(screen.getByText(uiText.settings.themeMode)).toBeTruthy());
  expect(screen.getByText(uiText.settings.colorTheme)).toBeTruthy();
  expect(screen.getByText(uiText.settings.themeMode).compareDocumentPosition(screen.getByText(uiText.settings.colorTheme)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  await fireEvent.click(screen.getByRole('button', { name: uiText.settings.themeModeDark }));

  await waitFor(() => expect(localStorage.getItem('themeMode')).toBe('dark'));
  expect(fetchMock).toHaveBeenCalledWith('/api/settings', expect.objectContaining({
    method: 'POST',
    body: expect.stringContaining('"themeMode":"dark"'),
  }));
});

test('Settings загружает конфликты только при конфликтном git status', async () => {
  const fetchMock = createFetchMock({
    statusQueue: [
      { initialized: true, current_branch: 'main', status: 'conflict', ahead: 0, behind: 0, last_sync: null },
      { initialized: true, current_branch: 'main', status: 'conflict', ahead: 0, behind: 0, last_sync: null },
      { initialized: true, current_branch: 'main', status: 'conflict', ahead: 0, behind: 0, last_sync: null },
    ],
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  await fireEvent.click(await screen.findByRole('button', { name: uiText.settings.refreshStatus }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/git/conflicts'));
});

test('Settings скрывает кнопку конфликтов, если конфликтов нет', async () => {
  const fetchMock = createFetchMock({
    settings: {},
    statusQueue: [
      { initialized: false, current_branch: '', status: 'clean', ahead: 0, behind: 0, last_sync: null },
      { initialized: false, current_branch: '', status: 'clean', ahead: 0, behind: 0, last_sync: null },
      { initialized: false, current_branch: '', status: 'clean', ahead: 0, behind: 0, last_sync: null },
    ],
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  // Without a connected repository the status section is not shown at all.
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/git/status'));
  expect(screen.queryByRole('button', { name: uiText.settings.refreshStatus })).toBeNull();
  expect(screen.queryByRole('button', { name: uiText.settings.viewConflicts })).toBeNull();
  expect(fetchMock).not.toHaveBeenCalledWith('/api/git/conflicts');
});

test('Settings после sync обновляет статус через /api/git/status', async () => {
  const fetchMock = createFetchMock();
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  await fireEvent.click(await screen.findByRole('button', { name: uiText.settings.refreshStatus }));
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

  await fireEvent.click(await screen.findByRole('button', { name: uiText.settings.refreshStatus }));
  const syncButton = await waitFor(() => screen.getByRole('button', { name: uiText.settings.syncNow }));
  editorState.set({ path: 'notes/Inbox.md', dirty: true, saving: false });
  await waitFor(() => expect(syncButton.disabled).toBe(true));
  expect(syncButton.disabled).toBe(true);
  await fireEvent.click(syncButton);

  expect(fetchMock).not.toHaveBeenCalledWith('/api/git/sync', { method: 'POST' });
});

test('Settings экспортирует заметки ZIP-архивом', async () => {
  const createObjectURL = vi.fn(() => 'blob:monos-export');
  const revokeObjectURL = vi.fn();
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

  const fetchMock = createFetchMock({
    settings: {},
    fallback(url) {
      if (url === '/api/backup/export') {
        return {
          ok: true,
          headers: {
            get(name) {
              return name === 'Content-Disposition' ? 'attachment; filename="monos-notes-test.zip"' : '';
            },
          },
          async blob() {
            return new Blob(['zip'], { type: 'application/zip' });
          },
        };
      }
      return jsonResponse({}, false);
    },
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  await fireEvent.click(await screen.findByRole('button', { name: uiText.settings.exportNotes }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/backup/export'));
  expect(createObjectURL).toHaveBeenCalled();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:monos-export');
  expect(screen.getByText(uiText.settings.exportComplete)).toBeTruthy();
  clickSpy.mockRestore();
});

test('Settings импортирует выбранный ZIP и показывает summary', async () => {
  const fetchMock = createFetchMock({
    settings: {},
    fallback(url, init) {
      if (url === '/api/backup/import' && init.method === 'POST') {
        expect(init.body).toBeInstanceOf(FormData);
        expect(init.body.get('archive').name).toBe('notes.zip');
        return jsonResponse({ importedNotes: 2, importedFiles: 3, renamed: 1 });
      }
      return jsonResponse({}, false);
    },
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  const input = await screen.findByLabelText(uiText.settings.importTitle);
  const file = new File(['zip'], 'notes.zip', { type: 'application/zip' });
  await fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/backup/import', expect.objectContaining({
    method: 'POST',
  })));
  expect(screen.getByText(/Imported 2 notes/)).toBeTruthy();
});

test('Settings открывает выбор ZIP без пустого экрана и не импортирует без файла', async () => {
  const inputClickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
  const fetchMock = createFetchMock({ settings: {} });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  await fireEvent.click(await screen.findByRole('button', { name: uiText.settings.chooseArchive }));

  expect(inputClickSpy).toHaveBeenCalled();
  expect(screen.getByText(uiText.settings.title)).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalledWith('/api/backup/import', expect.anything());
  inputClickSpy.mockRestore();
});

test('Settings показывает QR-код адреса для телефона и переключает его между адресами', async () => {
  const urls = ['http://192.168.1.5:8000/?token=abc', 'http://10.0.0.7:8000/?token=abc'];
  const fetchMock = createFetchMock({
    settings: {},
    fallback: (url) => (url === '/api/lan'
      ? jsonResponse({ enabled: true, token: 'abc', urls, restartRequired: false })
      : jsonResponse({}, false)),
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;

  render(Settings);

  const qr = await screen.findByTestId('lan-qr');
  expect(qr.getAttribute('aria-label')).toBe(uiText.settings.lanQrLabel(urls[0]));
  expect(qr.querySelector('path').getAttribute('d')).toMatch(/^M4 4h1v1h-1z/);

  const [, second] = screen.getAllByRole('button', { name: uiText.settings.lanShowQr });
  await fireEvent.click(second);
  await waitFor(() => expect(screen.getByTestId('lan-qr').getAttribute('aria-label')).toBe(uiText.settings.lanQrLabel(urls[1])));
  expect(second.getAttribute('aria-pressed')).toBe('true');
});

// The connection shows where it stands beside the button: working, done, done with conflicts, or why it failed.
async function openConnectForm(overrides) {
  const fetchMock = createFetchMock(overrides);
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
  render(Settings);
  await waitFor(() => expect(screen.getByRole('option', { name: 'alice/wiki' })).toBeTruthy());
  await fireEvent.change(screen.getByLabelText(uiText.settings.repository), { target: { value: 'alice/notes' } });
  await waitFor(() => expect(screen.getByRole('button', { name: uiText.settings.connectRepository }).disabled).toBe(false));
  return fetchMock;
}
const connectStatus = () => screen.getByTestId('connect-status');

test('Settings: подключение показывает ход, потом результат рядом с кнопкой', async () => {
  let finish;
  await openConnectForm({ setup: () => new Promise((resolve) => { finish = () => resolve(jsonResponse({ message: 'Connected', conflicts: false })); }) });
  expect(connectStatus().dataset.phase).toBe('idle');

  await fireEvent.click(screen.getByRole('button', { name: uiText.settings.connectRepository }));
  await waitFor(() => expect(connectStatus().dataset.phase).toBe('connecting'));
  expect(connectStatus().textContent).toContain(uiText.settings.connectingTo('alice/notes'));
  expect(connectStatus().textContent).toContain(uiText.settings.connectingHint);

  finish();
  await waitFor(() => expect(connectStatus().dataset.phase).toBe('done'));
  expect(connectStatus().textContent).toContain(uiText.settings.connectedTo('alice/notes', 'main'));
  expect(connectStatus().textContent).toContain(uiText.settings.connectedDone);
});

test('Settings: отказ сервера объясняется рядом с кнопкой', async () => {
  await openConnectForm({ setup: () => jsonResponse({ detail: 'Token rejected by GitHub' }, false) });
  await fireEvent.click(screen.getByRole('button', { name: uiText.settings.connectRepository }));
  await waitFor(() => expect(connectStatus().dataset.phase).toBe('error'));
  expect(within(connectStatus()).getByRole('alert').textContent).toBe('Token rejected by GitHub');
});

test('Settings: сбой сети при подключении не молчит', async () => {
  await openConnectForm({ setup: () => { throw new Error('network down'); } });
  await fireEvent.click(screen.getByRole('button', { name: uiText.settings.connectRepository }));
  await waitFor(() => expect(connectStatus().dataset.phase).toBe('error'));
  expect(connectStatus().textContent).toContain(uiText.settings.connectFailed);
});

test('Settings: подключение с конфликтами говорит об этом, а не об успехе', async () => {
  await openConnectForm({ setup: () => jsonResponse({ message: 'Conflicts detected during setup', conflicts: true }) });
  await fireEvent.click(screen.getByRole('button', { name: uiText.settings.connectRepository }));
  await waitFor(() => expect(connectStatus().dataset.phase).toBe('conflicts'));
  expect(connectStatus().textContent).toContain(uiText.settings.connectedConflicts);
});

test('Settings: у подключённой папки в покое видно, к чему она подключена', async () => {
  const fetchMock = createFetchMock({
    statusQueue: [{ initialized: true, current_branch: 'main', branch: 'main', repo: 'alice/notes', status: 'clean', ahead: 0, behind: 0, last_sync: null }],
  });
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
  render(Settings);
  await waitFor(() => expect(connectStatus().textContent).toContain(uiText.settings.connectedTo('alice/notes', 'main')));
  expect(connectStatus().dataset.phase).toBe('idle');
});

// A token left at Contents "Read-only" connects and then fails at the first push: the form warns before that,
// and when GitHub refuses anyway the reason is said in the interface's language.
test('Settings: токен «только чтение» предупреждается ещё до подключения', async () => {
  await openConnectForm({
    fallback: (url) => (url.startsWith('/api/git/repo-check')
      ? jsonResponse({ repo: 'alice/notes', private: true, safe: true, canPush: false, scopeWarnings: [] })
      : jsonResponse({}, false)),
  });
  const warning = await screen.findByTestId('read-only-token');
  expect(warning.textContent).toContain(uiText.settings.readOnlyTokenTitle);
  expect(warning.textContent).toContain('Read-only');
});

test('Settings: у токена с записью предупреждения нет', async () => {
  await openConnectForm({
    fallback: (url) => (url.startsWith('/api/git/repo-check')
      ? jsonResponse({ repo: 'alice/notes', private: true, safe: true, canPush: true, scopeWarnings: [] })
      : jsonResponse({}, false)),
  });
  await waitFor(() => expect(screen.getByRole('button', { name: uiText.settings.connectRepository }).disabled).toBe(false));
  expect(screen.queryByTestId('read-only-token')).toBeNull();
});

test('Settings: отказ GitHub в записи объясняется словами интерфейса', async () => {
  await openConnectForm({ setup: () => jsonResponse({ detail: 'raw git words', reason: 'token-read-only' }, false) });
  await fireEvent.click(screen.getByRole('button', { name: uiText.settings.connectRepository }));
  await waitFor(() => expect(connectStatus().dataset.phase).toBe('error'));
  expect(connectStatus().textContent).toBe(uiText.settings.gitReasons['token-read-only']);
  expect(connectStatus().textContent).not.toContain('raw git words');
});
