import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A change made outside Monos (an agent in the terminal) is indexed and announced; Monos's own save is not.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-watch-'));
fs.mkdirSync(path.join(tempRoot, 'notes'), { recursive: true });
process.env.NOTES_ROOT = tempRoot;
const { startServer, stopServer } = await import('./index.js');
const { getDb } = await import('./database.js');
let base;
let controller;
const events = [];

test.before(async () => {
  fs.writeFileSync(path.join(tempRoot, 'notes', 'Есть.md'), 'Было.\n', 'utf-8');
  const started = await startServer({ port: 0 });
  base = `http://127.0.0.1:${started.port}`;
  controller = new AbortController();
  const response = await fetch(`${base}/api/events`, { signal: controller.signal });
  (async () => {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of response.body) {
        for (const line of decoder.decode(chunk).split('\n')) if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)));
      }
    } catch { /* aborted */ }
  })();
});
test.after(async () => { controller.abort(); await stopServer(); });

const waitFor = async (check, ms = 3000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (check()) return true; await new Promise((r) => setTimeout(r, 50)); }
  return false;
};

test('файл, созданный в обход Monos, индексируется и объявляется странице', async () => {
  fs.writeFileSync(path.join(tempRoot, 'notes', 'От агента.md'), '---\ntitle: "От агента"\ntags: []\n---\n\nТекст агента.\n', 'utf-8');
  assert.ok(await waitFor(() => events.some((e) => e.paths?.includes('notes/От агента.md'))), 'событие должно прийти');
  const tree = JSON.stringify(await (await fetch(`${base}/api/tree`)).json());
  assert.match(tree, /От агента\.md/);
});

test('собственное сохранение Monos не объявляется как чужое', async () => {
  events.length = 0;
  const url = `${base}/api/file?path=${encodeURIComponent('notes/Есть.md')}`;
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'Стало.\n' }) });
  await new Promise((r) => setTimeout(r, 900));
  assert.equal(events.filter((e) => e.paths?.includes('notes/Есть.md')).length, 0);
});

test('сбой индексации после внешней правки не роняет процесс, и наблюдение продолжается', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const crashes = [];
  const onCrash = (error) => crashes.push(error);
  process.on('uncaughtException', onCrash);
  const db = getDb();
  try {
    // Every write fails from now on, as it does while another backend holds the lock. Reads still work.
    db.pragma('query_only = ON');
    fs.writeFileSync(path.join(tempRoot, 'notes', 'Под замком.md'), 'Текст.\n', 'utf-8');
    assert.ok(await waitFor(() => logged.mock.calls.length > 0 || crashes.length > 0), 'индексация должна была сработать');
    assert.deepEqual(crashes, [], 'сбой не должен стать необработанным исключением');
    assert.match(String(logged.mock.calls[0].arguments[0]), /outside Monos/);

    db.pragma('query_only = OFF');
    fs.writeFileSync(path.join(tempRoot, 'notes', 'После сбоя.md'), 'Текст.\n', 'utf-8');
    assert.ok(await waitFor(() => events.some((e) => e.paths?.includes('notes/После сбоя.md'))), 'после сбоя наблюдение продолжается');
  } finally {
    process.off('uncaughtException', onCrash);
    db.pragma('query_only = OFF');
  }
});
