import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A sync can change a note while it is open. A save that started from the old text must not write over
// the other device's edit: it is refused with the text on disk.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-stale-save-'));
fs.mkdirSync(path.join(tempRoot, 'notes'), { recursive: true });
process.env.NOTES_ROOT = tempRoot;
const { startServer, stopServer } = await import('./index.js');
const notePath = path.join(tempRoot, 'notes', 'Планы.md');
let base;

test.before(async () => {
  fs.writeFileSync(notePath, 'Первая строка.\n', 'utf-8');
  const started = await startServer({ port: 0 });
  base = `http://127.0.0.1:${started.port}`;
  await fetch(`${base}/api/reindex`, { method: 'POST' }).catch(() => {});
});
test.after(async () => { await stopServer(); });

const url = () => `${base}/api/file?path=${encodeURIComponent('notes/Планы.md')}`;
const save = (content, base_version) => fetch(url(), {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, base_version }),
});

test('сохранение от текущей версии проходит и отдаёт новую версию', async () => {
  const loaded = await (await fetch(url())).json();
  assert.match(loaded.version, /^[0-9a-f]{16}$/);
  const response = await save('Первая строка.\nМоя правка.\n', loaded.version);
  assert.equal(response.status, 200);
  const body = await response.json();
  const reloaded = await (await fetch(url())).json();
  assert.equal(body.version, reloaded.version);
});

test('сохранение от устаревшей версии отклоняется с текстом с диска', async () => {
  const loaded = await (await fetch(url())).json();
  fs.writeFileSync(notePath, 'Первая строка.\nМоя правка.\nПравка с телефона.\n', 'utf-8');
  const response = await save('Первая строка.\nМоя правка.\nЕщё моя.\n', loaded.version);
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.changed, true);
  assert.match(body.content, /Правка с телефона/);
  assert.equal(fs.readFileSync(notePath, 'utf-8'), 'Первая строка.\nМоя правка.\nПравка с телефона.\n');
});

test('сохранение без версии не проверяется (старые клиенты, явная перезапись)', async () => {
  const response = await save('Перезаписано.\n');
  assert.equal(response.status, 200);
});
