import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadFileContent,
  loadFileInfo,
  loadBacklinksRequest,
  resolveWikiLink,
  loadTrashNotesRequest,
  touchNoteRequest,
  restoreNoteRequest,
  saveFileContent,
  setItemColorRequest,
} from './editor-api.js';

let lastCall = null;
const originalFetch = globalThis.fetch;

function installMock() {
  globalThis.fetch = async (url, init) => {
    lastCall = { url: String(url), method: init?.method || 'GET', body: init?.body, headers: init?.headers };
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '{}',
    };
  };
}

test.before(() => installMock());
test.after(() => {
  globalThis.fetch = originalFetch;
});

test('loadFileContent: GET /api/file?path=...', async () => {
  await loadFileContent('notes/foo.md');
  assert.equal(lastCall.method, 'GET');
  assert.equal(lastCall.url, '/api/file?path=notes%2Ffoo.md');
});

test('loadFileInfo: GET /api/file-info?path=...', async () => {
  await loadFileInfo('notes/bar.md');
  assert.equal(lastCall.url, '/api/file-info?path=notes%2Fbar.md');
});

test('loadBacklinksRequest: GET /api/notes/backlinks?path=...', async () => {
  await loadBacklinksRequest('notes/baz.md');
  assert.equal(lastCall.url, '/api/notes/backlinks?path=notes%2Fbaz.md');
});

test('resolveWikiLink: GET /api/notes/resolve-link?name=...', async () => {
  await resolveWikiLink('My Note');
  assert.equal(lastCall.url, '/api/notes/resolve-link?name=My%20Note');
});

test('loadTrashNotesRequest: GET /api/notes/trash?limit=200', async () => {
  await loadTrashNotesRequest();
  assert.equal(lastCall.url, '/api/notes/trash?limit=200');
});

test('touchNoteRequest: POST /api/notes/touch?path=...', async () => {
  await touchNoteRequest('notes/x.md');
  assert.equal(lastCall.method, 'POST');
  assert.equal(lastCall.url, '/api/notes/touch?path=notes%2Fx.md');
});

test('restoreNoteRequest: POST /api/notes/restore?path=...', async () => {
  await restoreNoteRequest('notes/x.md');
  assert.equal(lastCall.url, '/api/notes/restore?path=notes%2Fx.md');
});

test('saveFileContent: POST /api/file с body', async () => {
  await saveFileContent('notes/y.md', '# hi');
  assert.equal(lastCall.method, 'POST');
  assert.equal(lastCall.url, '/api/file?path=notes%2Fy.md');
  assert.match(lastCall.body, /# hi/);
});

test('setItemColorRequest: POST /api/directory/icon?path=...', async () => {
  await setItemColorRequest('notes/z.md', '#ff0000');
  assert.equal(lastCall.method, 'POST');
  assert.equal(lastCall.url, '/api/directory/icon?path=notes%2Fz.md');
  assert.match(lastCall.body, /#ff0000/);
});

test('saveFileContentOnLeave отправляет текст keepalive-запросом с базовой версией', async () => {
  const { saveFileContentOnLeave } = await import('./editor-api.js');
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = (url, init) => { calls.push({ url, init }); return Promise.resolve({ ok: true }); };
  try {
    assert.equal(saveFileContentOnLeave('notes/C# notes.md', 'text', 'v1'), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/file?path=notes%2FC%23%20notes.md');
    assert.equal(calls[0].init.keepalive, true);
    assert.deepEqual(JSON.parse(calls[0].init.body), { content: 'text', base_version: 'v1' });
  } finally {
    globalThis.fetch = original;
  }
});

test('saveFileContentOnLeave не шлёт то, что не поместится в keepalive (64 КиБ)', async () => {
  const { saveFileContentOnLeave } = await import('./editor-api.js');
  const original = globalThis.fetch;
  let sent = 0;
  globalThis.fetch = () => { sent += 1; return Promise.resolve({ ok: true }); };
  try {
    assert.equal(saveFileContentOnLeave('notes/a.md', 'x'.repeat(70 * 1024)), false);
    assert.equal(sent, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('duplicateNoteRequest отправляет слово для имени копии, если оно есть', async () => {
  const { duplicateNoteRequest } = await import('./editor-api.js');
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ path: 'notes/a copy.md' }) }; };
  try {
    await duplicateNoteRequest('notes/a.md', 'копия');
    assert.deepEqual(JSON.parse(calls[0].init.body), { suffix: 'копия' });
    await duplicateNoteRequest('notes/a.md');
    assert.equal(calls[1].init.body, undefined);
  } finally {
    globalThis.fetch = original;
  }
});
