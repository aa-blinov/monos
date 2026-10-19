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
const { getDb } = await import('./database.js');
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

test('отказ называет устройство, которое изменило заметку', async () => {
  const { execFileSync } = await import('node:child_process');
  const notes = path.join(tempRoot, 'notes');
  const git = (args) => execFileSync('git', args, { cwd: notes, encoding: 'utf-8' });
  git(['init', '-q', '-b', 'master']);
  await fetch(`${base}/api/device`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ноутбук' }) });
  git(['add', '-A']); git(['-c', 'user.name=Ноутбук', '-c', 'user.email=n@x', 'commit', '-qm', 'mine']);
  const loaded = await (await fetch(url())).json();
  fs.writeFileSync(notePath, 'Правка с телефона.\n', 'utf-8');
  git(['-c', 'user.name=Телефон', '-c', 'user.email=t@x', 'commit', '-qam', 'theirs']);
  const response = await save('Моя правка.\n', loaded.version);
  assert.equal(response.status, 409);
  const { sides } = await response.json();
  assert.equal(sides.ours.device, 'Ноутбук');
  assert.equal(sides.theirs.device, 'Телефон');
  assert.ok(!Number.isNaN(Date.parse(sides.theirs.date)));
});

// The text is on disk before the index is touched, and the file is the source of truth. An index left
// behind made search lag; answering 500 said the text was lost when the file already held it, and the
// person kept re-saving a note that was written.
test('сохранение отвечает успехом, когда текст записан, а индекс не обновился', async () => {
  const loaded = await (await fetch(url())).json();
  const db = getDb();
  db.pragma('query_only = ON');
  let response;
  try {
    response = await save('Первая строка.\nПравка, которую индекс не увидит.\n', loaded.version);
  } finally {
    db.pragma('query_only = OFF');
  }

  assert.equal(response.status, 200);
  assert.equal(fs.readFileSync(notePath, 'utf-8'), 'Первая строка.\nПравка, которую индекс не увидит.\n');
});
