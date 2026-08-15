import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadTreeData,
  loadRecentNotesRequest,
  loadTagsRequest,
  loadDirectoriesRequest,
  checkGitStatus,
  createFolderRequest,
  createNoteRequest,
  syncRequest,
  renameItemRequest,
  deleteItemRequest,
  moveItemRequest,
  setItemIconRequest,
} from './sidebar-api.js';

let lastCall = null;
const originalFetch = globalThis.fetch;

function installMock() {
  globalThis.fetch = async (url, init) => {
    lastCall = { url: String(url), method: init?.method || 'GET', body: init?.body };
    return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
  };
}

test.before(() => installMock());
test.after(() => {
  globalThis.fetch = originalFetch;
});

test('loadTreeData: GET /api/tree', async () => {
  await loadTreeData();
  assert.equal(lastCall.method, 'GET');
  assert.equal(lastCall.url, '/api/tree');
});

test('loadRecentNotesRequest: GET /api/notes/recent?limit=5', async () => {
  await loadRecentNotesRequest();
  assert.equal(lastCall.url, '/api/notes/recent?limit=5');
});

test('loadTagsRequest: GET /api/tags', async () => {
  await loadTagsRequest();
  assert.equal(lastCall.url, '/api/tags');
});

test('loadDirectoriesRequest: GET /api/directories', async () => {
  await loadDirectoriesRequest();
  assert.equal(lastCall.url, '/api/directories');
});

test('checkGitStatus: GET /api/git/status', async () => {
  await checkGitStatus();
  assert.equal(lastCall.url, '/api/git/status');
});

test('createFolderRequest: POST /api/directory/create?path=...', async () => {
  await createFolderRequest('notes/NewFolder');
  assert.equal(lastCall.method, 'POST');
  assert.equal(lastCall.url, '/api/directory/create?path=notes%2FNewFolder');
});

test('createNoteRequest: POST /api/notes/create с body', async () => {
  await createNoteRequest({ title: 'T', category: 'C' });
  assert.equal(lastCall.method, 'POST');
  assert.equal(lastCall.url, '/api/notes/create');
  assert.match(lastCall.body, /"title":"T"/);
});

test('syncRequest: POST /api/git/sync', async () => {
  await syncRequest();
  assert.equal(lastCall.url, '/api/git/sync');
  assert.equal(lastCall.method, 'POST');
});

test('renameItemRequest: POST /api/file/rename?path=...', async () => {
  await renameItemRequest('notes/old.md', 'new.md');
  assert.equal(lastCall.url, '/api/file/rename?path=notes%2Fold.md');
  assert.match(lastCall.body, /"new_name":"new\.md"/);
});

test('deleteItemRequest: DELETE /api/file?path=...', async () => {
  await deleteItemRequest('notes/x.md');
  assert.equal(lastCall.method, 'DELETE');
  assert.equal(lastCall.url, '/api/file?path=notes%2Fx.md');
});

test('moveItemRequest: POST /api/file/move?source=...&target=...', async () => {
  await moveItemRequest('notes/src.md', 'notes/dst.md');
  assert.equal(lastCall.url, '/api/file/move?source=notes%2Fsrc.md&target=notes%2Fdst.md');
});

test('setItemIconRequest: POST /api/directory/icon?path=... с body', async () => {
  await setItemIconRequest('notes/Folder', { icon: 'folder', color: '#ff0000' });
  assert.equal(lastCall.url, '/api/directory/icon?path=notes%2FFolder');
  assert.match(lastCall.body, /"icon":"folder"/);
  assert.match(lastCall.body, /"color":"#ff0000"/);
});
