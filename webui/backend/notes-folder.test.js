import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import http from 'node:http';
import os from 'os';
import path from 'path';

// The default folder, and the API that chooses another one. Nothing changes until the next start.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-folder-'));
const external = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-vault-'));
fs.mkdirSync(path.join(tempRoot, 'notes'), { recursive: true });
process.env.NOTES_ROOT = tempRoot;

const { startServer, stopServer } = await import('./index.js');
const { NOTES_DIR, DEFAULT_NOTES_DIR } = await import('./config.js');
const { relPath, resolveNotesPath } = await import('./utils.js');
const { port } = await startServer({ port: 0 });
after(() => stopServer());

function request(method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: requestPath,
      headers: payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
    }, (response) => {
      let text = '';
      response.setEncoding('utf-8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

test('без выбора заметки лежат в папке по умолчанию, а пути остаются прежними', () => {
  assert.equal(NOTES_DIR, DEFAULT_NOTES_DIR);
  assert.equal(relPath(path.join(NOTES_DIR, 'Plan.md')), 'notes/Plan.md');
  assert.equal(relPath(NOTES_DIR), 'notes');
  assert.equal(resolveNotesPath('notes/Plan.md'), path.join(NOTES_DIR, 'Plan.md'));
});

test('выбор папки записывается и показывается, но открывается только после перезапуска', async () => {
  const chosen = await request('POST', '/api/storage/folder', { folder: external });
  assert.equal(chosen.status, 200);
  assert.equal(chosen.body.canceled, false);
  assert.equal(chosen.body.target, external);
  assert.equal(chosen.body.folder, DEFAULT_NOTES_DIR);
  assert.equal(chosen.body.restartRequired, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(tempRoot, '.data', 'storage.json'), 'utf-8')).notesFolder, external);

  const state = await request('GET', '/api/storage');
  assert.equal(state.body.target, external);
  assert.equal(state.body.unavailable, null);
});

test('в папку, которой нет, или внутрь данных Monos выбрать нельзя', async () => {
  const relative = await request('POST', '/api/storage/folder', { folder: 'Notes' });
  assert.equal(relative.status, 400);
  const missing = await request('POST', '/api/storage/folder', { folder: path.join(external, 'нет-такой') });
  assert.equal(missing.status, 400);
  const insideData = await request('POST', '/api/storage/folder', { folder: path.join(tempRoot, '.data') });
  assert.equal(insideData.status, 400);
  const dataParent = await request('POST', '/api/storage/folder', { folder: tempRoot });
  assert.equal(dataParent.status, 400);
});

test('без пути выбор идёт через окно приложения: вне Electron это отказ, а не тихая смена', async () => {
  const response = await request('POST', '/api/storage/folder', {});
  assert.equal(response.status, 409);
  assert.match(response.body.detail, /Monos app/);
});

test('возврат к папке по умолчанию убирает выбор из настроек', async () => {
  const state = await request('DELETE', '/api/storage/folder');
  assert.equal(state.body.target, DEFAULT_NOTES_DIR);
  assert.equal(state.body.restartRequired, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(tempRoot, '.data', 'storage.json'), 'utf-8')).notesFolder, undefined);
});
