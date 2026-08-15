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
