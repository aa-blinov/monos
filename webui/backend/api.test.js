import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { EventEmitter } from 'node:events';
import fs from 'fs';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-api-'));
const notesDir = path.join(tempRoot, 'notes');
fs.mkdirSync(path.join(notesDir, 'Topic'), { recursive: true });
fs.mkdirSync(path.join(notesDir, '.secret'), { recursive: true });

fs.writeFileSync(path.join(notesDir, 'Topic', 'Alpha.md'), `---
title: "Alpha Note"
tags: ["alpha", "shared"]
---

Alpha links to [[Beta Note]].
`, 'utf-8');

fs.writeFileSync(path.join(notesDir, 'Beta.md'), `---
title: "Beta Note"
tags: ["beta", "shared"]
---

Beta content.
`, 'utf-8');

fs.writeFileSync(path.join(notesDir, 'FormatMe.md'), 'Line with spaces   \n\n\nSecond line\t \n', 'utf-8');
fs.writeFileSync(path.join(notesDir, '.secret', 'Hidden.md'), '# Hidden\n', 'utf-8');

process.env.NOTES_ROOT = tempRoot;

const { startServer, stopServer } = await import('./index.js');
const { buildGithubRemoteUrl, gitEnv } = await import('./routes/git.js');
const { getDb } = await import('./database.js');
const { indexAllFiles, migrateCachedMetadataToFrontmatter } = await import('./indexing.js');

let baseUrl = '';

function apiTest(name, fn) {
  test(name, { concurrency: false }, fn);
}

async function requestJson(url, options) {
  const response = await realFetch(url, options);
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { response, data };
}

function buildUrl(pathname, query = {}) {
  const url = new URL(pathname, baseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url;
}

// GitHub is reached through the global fetch, so the mock replaces that rather
// than https.get. Real fetch is kept aside: the test's own HTTP calls must
// still reach the server under test.
const realFetch = globalThis.fetch;

async function withMockedFetch(mockImpl, fn) {
  globalThis.fetch = mockImpl;
  try {
    await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
}

function createJsonGetMock(routeMap) {
  return async (input) => {
    const href = String(input && input.url ? input.url : input);
    const pathname = href.replace('https://api.github.com', '');
    const body = routeMap[pathname];
    if (body instanceof Error) throw body;
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      async json() { return body ?? []; },
    };
  };
}

test.before(async () => {
  const started = await startServer({ port: 0 });
  baseUrl = `http://127.0.0.1:${started.port}`;
});

test.after(async () => {
  await stopServer();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

apiTest('GET /health отвечает статусом ok', async () => {
  const { response, data } = await requestJson(buildUrl('/health'));

  assert.equal(response.status, 200);
  assert.deepEqual(data, { status: 'ok' });
});

apiTest('backend ограничивает браузерные Origin локальным frontend', async () => {
  const allowed = await realFetch(buildUrl('/health'), {
    headers: { Origin: 'http://localhost:5173' },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');

  const blocked = await requestJson(buildUrl('/api/git/sync'), {
    method: 'POST',
    headers: { Origin: 'https://evil.example' },
  });
  assert.equal(blocked.response.status, 403);
  assert.equal(blocked.data.detail, 'Origin not allowed');
});

apiTest('страница с origin самого сервера проходит проверку Origin', async () => {
  const port = new URL(baseUrl).port;
  const own = await realFetch(buildUrl('/health'), {
    headers: { Origin: `http://127.0.0.1:${port}` },
  });
  assert.equal(own.status, 200);

  const foreign = await realFetch(buildUrl('/health'), {
    headers: { Origin: 'https://evil.example' },
  });
  assert.equal(foreign.status, 403);
});

apiTest('backend слушает только loopback, а не все интерфейсы', async () => {
  const { server } = await startServer({ port: 0 });
  assert.equal(server.address().address, '127.0.0.1');
});

// Raw HTTP: fetch does not let a caller choose the Host header.
function rawStatus(port, requestPath, headers) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path: requestPath, headers }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on('error', reject);
    request.end();
  });
}

apiTest('запрос с чужим Host отклоняется (защита от DNS rebinding)', async () => {
  const port = new URL(baseUrl).port;
  assert.equal(await rawStatus(port, '/health', { Host: `127.0.0.1:${port}` }), 200);
  assert.equal(await rawStatus(port, '/health', { Host: `localhost:${port}` }), 200);
  assert.equal(await rawStatus(port, '/health', { Host: `evil.example:${port}` }), 403);
});

apiTest('заметка длиннее 100 kB сохраняется, а не отвечает 413', async () => {
  const notePath = 'notes/Topic/Long.md';
  const content = `# Long\n\n${'Длинный абзац. '.repeat(10_000)}`;
  assert.ok(Buffer.byteLength(content) > 100 * 1024);

  const { response } = await requestJson(buildUrl('/api/file', { path: notePath, create: '1' }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  assert.equal(response.status, 200);

  const saved = fs.readFileSync(path.join(tempRoot, notePath), 'utf-8');
  assert.equal(saved, content);

  // Later tests count the notes, so this one must not outlive the test.
  const removed = await realFetch(buildUrl('/api/file', { path: notePath, permanent: 1 }), { method: 'DELETE' });
  assert.equal(removed.status, 200);
});

apiTest('создание заметки с занятым именем не перезаписывает существующую', async () => {
  const create = (content) => requestJson(buildUrl('/api/notes/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Guarded note', content }),
  });

  const first = await create('original body that must survive');
  assert.equal(first.response.status, 200);

  const second = await create('second body');
  assert.equal(second.response.status, 409);
  assert.equal(second.data.path, 'notes/Guarded note.md');

  const saved = fs.readFileSync(path.join(tempRoot, 'notes', 'Guarded note.md'), 'utf-8');
  assert.match(saved, /original body that must survive/);
  assert.doesNotMatch(saved, /second body/);

  const removed = await realFetch(buildUrl('/api/file', { path: 'notes/Guarded note.md', permanent: 1 }), { method: 'DELETE' });
  assert.equal(removed.status, 200);
});

apiTest('токен GitHub передаётся git через окружение, а не через аргументы', () => {
  // Without a token git still gets core.quotepath=false, so non-ASCII names come back readable.
  const bare = gitEnv('');
  assert.equal(bare.GIT_CONFIG_COUNT, '1');
  assert.equal(bare.GIT_CONFIG_KEY_0, 'core.quotepath');
  assert.equal(bare.GIT_CONFIG_VALUE_0, 'false');

  const env = gitEnv('ghp_example');
  assert.equal(env.GIT_CONFIG_COUNT, '2');
  assert.equal(env.GIT_CONFIG_KEY_1, 'http.https://github.com/.extraheader');
  assert.ok(!Object.values(env).some((value) => value === 'ghp_example'), 'the token never travels as a plain value');
  const header = env.GIT_CONFIG_VALUE_1.replace(/^AUTHORIZATION: basic /, '');
  assert.equal(Buffer.from(header, 'base64').toString(), 'x-access-token:ghp_example');
});

apiTest('GET /api/tree индексирует заметки и игнорирует скрытые папки', async () => {
  const { response, data } = await requestJson(buildUrl('/api/tree'));

  assert.equal(response.status, 200);
  assert.equal(data.path, 'notes');
  assert.ok(!JSON.stringify(data).includes('.secret'));

  const topicDir = data.children.find((child) => child.path === 'notes/Topic');
  assert.ok(topicDir);

  const alpha = topicDir.children.find((child) => child.path === 'notes/Topic/Alpha.md');
  assert.ok(alpha);
  assert.equal(alpha.metadata.title, 'Alpha Note');
  assert.deepEqual(alpha.metadata.tags, ['alpha', 'shared']);
});

apiTest('GET /api/file и /api/notes/recent отражают чтение файла', async () => {
  const fileUrl = buildUrl('/api/file', { path: 'notes/Topic/Alpha.md' });
  const { response, data } = await requestJson(fileUrl);

  assert.equal(response.status, 200);
  assert.match(data.content, /Alpha links to \[\[Beta Note\]\]/);

  const recent = await requestJson(buildUrl('/api/notes/recent', { limit: '1' }));
  assert.equal(recent.response.status, 200);
  assert.equal(recent.data[0].path, 'notes/Topic/Alpha.md');
});

apiTest('POST /api/notes/touch поднимает заметку в recent', async () => {
  const touch = await requestJson(buildUrl('/api/notes/touch', { path: 'notes/Beta.md' }), {
    method: 'POST',
  });
  assert.equal(touch.response.status, 200);
  assert.equal(touch.data.path, 'notes/Beta.md');
  assert.ok(touch.data.lastOpened);

  const recent = await requestJson(buildUrl('/api/notes/recent', { limit: '1' }));
  assert.equal(recent.response.status, 200);
  assert.equal(recent.data[0].path, 'notes/Beta.md');
});

apiTest('GET /api/notes/recent: порядок по названию, фильтр по тегу и счётчик', async () => {
  const byTitle = await requestJson(buildUrl('/api/notes/recent', { sort: 'title', limit: '50' }));
  assert.equal(byTitle.response.status, 200);
  const names = byTitle.data.map((note) => note.name);
  const sorted = [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  assert.deepEqual(names, sorted);

  const shared = await requestJson(buildUrl('/api/notes/recent', { tag: 'shared', limit: '50' }));
  assert.ok(shared.data.length >= 2);
  assert.ok(shared.data.every((note) => note.tags.includes('shared')));

  // The tag is matched whole: a prefix of a tag name finds nothing.
  const prefix = await requestJson(buildUrl('/api/notes/recent', { tag: 'shar', limit: '50' }));
  assert.deepEqual(prefix.data, []);

  const count = await requestJson(buildUrl('/api/notes/recent/count', { tag: 'shared' }));
  assert.equal(count.data.total, shared.data.length);
  const all = await requestJson(buildUrl('/api/notes/recent/count'));
  assert.ok(all.data.total >= count.data.total);
});

apiTest('GET /api/notes/recent sort=modified сортирует по mtime, а не по last_opened', async () => {
  const alphaPath = path.join(notesDir, 'Topic', 'Alpha.md');
  const betaPath = path.join(notesDir, 'Beta.md');
  const formatMePath = path.join(notesDir, 'FormatMe.md');
  const oldestMtime = new Date('2025-12-01T00:00:00.000Z');
  const olderMtime = new Date('2026-01-01T00:00:00.000Z');
  const newerMtime = new Date('2026-02-01T00:00:00.000Z');
  fs.utimesSync(alphaPath, olderMtime, olderMtime);
  fs.utimesSync(betaPath, newerMtime, newerMtime);
  fs.utimesSync(formatMePath, oldestMtime, oldestMtime);
  indexAllFiles();

  getDb().prepare('UPDATE notes_index SET last_opened = ? WHERE path = ?')
    .run('2026-03-01T00:00:00.000Z', 'notes/Topic/Alpha.md');
  getDb().prepare('UPDATE notes_index SET last_opened = ? WHERE path = ?')
    .run('2026-01-15T00:00:00.000Z', 'notes/Beta.md');
  getDb().prepare('UPDATE notes_index SET last_opened = ? WHERE path = ?')
    .run('2025-12-15T00:00:00.000Z', 'notes/FormatMe.md');

  const modified = await requestJson(buildUrl('/api/notes/recent', { limit: '2', sort: 'modified' }));
  assert.equal(modified.response.status, 200);
  assert.deepEqual(modified.data.map((note) => note.path), ['notes/Beta.md', 'notes/Topic/Alpha.md']);
  assert.equal(modified.data[0].modified, newerMtime.toISOString());

  const opened = await requestJson(buildUrl('/api/notes/recent', { limit: '1' }));
  assert.equal(opened.response.status, 200);
  assert.equal(opened.data[0].path, 'notes/Topic/Alpha.md');
});

apiTest('POST /api/file и indexAllFiles обновляют поиск, но не меняют last_opened', async () => {
  const fixedOpenedAt = '2001-01-01T00:00:00.000Z';
  getDb().prepare('UPDATE notes_index SET last_opened = ? WHERE path = ?')
    .run(fixedOpenedAt, 'notes/Topic/Alpha.md');

  const nextContent = `---
title: "Alpha Note"
tags: ["alpha", "shared"]
---

Alpha links to [[Beta Note]].

Fresh searchable phrase from save.
`;

  const saved = await requestJson(buildUrl('/api/file', { path: 'notes/Topic/Alpha.md' }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: nextContent }),
  });
  assert.equal(saved.response.status, 200);
  assert.match(saved.data.modified, /^\d{4}-\d{2}-\d{2}T/);

  const afterSave = getDb().prepare('SELECT last_opened, modified_at FROM notes_index WHERE path = ?')
    .get('notes/Topic/Alpha.md');
  assert.equal(afterSave.last_opened, fixedOpenedAt);
  assert.equal(afterSave.modified_at, saved.data.modified);

  const search = await requestJson(buildUrl('/api/search'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'Fresh searchable', search_content: true }),
  });
  assert.equal(search.response.status, 200);
  assert.equal(search.data[0].path, 'notes/Topic/Alpha.md');

  indexAllFiles();
  const afterReindex = getDb().prepare('SELECT last_opened FROM notes_index WHERE path = ?')
    .get('notes/Topic/Alpha.md');
  assert.equal(afterReindex.last_opened, fixedOpenedAt);
});

apiTest('POST /api/notes/reorder сохраняет ручной порядок board', async () => {
  const reorder = await requestJson(buildUrl('/api/notes/reorder'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: ['notes/Topic/Alpha.md', 'notes/Beta.md'] }),
  });

  assert.equal(reorder.response.status, 200);
  assert.deepEqual(reorder.data.map((note) => note.path), ['notes/Topic/Alpha.md', 'notes/Beta.md']);
  assert.deepEqual(reorder.data.map((note) => note.boardOrder), [1, 2]);

  const recent = await requestJson(buildUrl('/api/notes/recent', { limit: '2' }));
  assert.equal(recent.response.status, 200);
  assert.deepEqual(recent.data.map((note) => note.path), ['notes/Topic/Alpha.md', 'notes/Beta.md']);
});

apiTest('GET /api/notes/recent поддерживает offset для бесконечного board', async () => {
  const first = await requestJson(buildUrl('/api/notes/recent', { limit: '1', offset: '0' }));
  const second = await requestJson(buildUrl('/api/notes/recent', { limit: '1', offset: '1' }));

  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.equal(first.data.length, 1);
  assert.equal(second.data.length, 1);
  assert.notEqual(first.data[0].path, second.data[0].path);
});

apiTest('GET /api/file возвращает ожидаемые ошибки для отсутствующего файла и директории', async () => {
  const missing = await requestJson(buildUrl('/api/file', { path: 'notes/Missing.md' }));
  assert.equal(missing.response.status, 404);
  assert.equal(missing.data.detail, 'File not found');

  const directory = await requestJson(buildUrl('/api/file', { path: 'notes/Topic' }));
  assert.equal(directory.response.status, 400);
  assert.equal(directory.data.detail, 'Path is a directory');
});

apiTest('attachments API сохраняет, отдаёт и переименовывает изображения рядом с заметкой', async () => {
  const imageBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
  const form = new FormData();
  form.append('name', 'clipboard-image.webp');
  form.append('file', new Blob([imageBytes], { type: 'image/webp' }), 'clipboard-image.webp');

  const upload = await requestJson(buildUrl('/api/attachments', { notePath: 'notes/Topic/Alpha.md' }), {
    method: 'POST',
    body: form,
  });
  assert.equal(upload.response.status, 200);
  assert.equal(upload.data.path, 'notes/Topic/_attachments/clipboard-image.webp');
  assert.equal(upload.data.relativePath, '_attachments/clipboard-image.webp');
  assert.equal(fs.existsSync(path.join(notesDir, 'Topic', '_attachments', 'clipboard-image.webp')), true);

  const raw = await realFetch(buildUrl('/api/attachments/raw', { path: upload.data.path }));
  assert.equal(raw.status, 200);
  assert.equal(raw.headers.get('content-type'), 'image/webp');
  assert.deepEqual(new Uint8Array(await raw.arrayBuffer()), imageBytes);

  const renamed = await requestJson(buildUrl('/api/attachments/rename'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      notePath: 'notes/Topic/Alpha.md',
      path: upload.data.path,
      newName: 'renamed-image',
    }),
  });
  assert.equal(renamed.response.status, 200);
  assert.equal(renamed.data.path, 'notes/Topic/_attachments/renamed-image.webp');
  assert.equal(renamed.data.relativePath, '_attachments/renamed-image.webp');
  assert.equal(fs.existsSync(path.join(notesDir, 'Topic', '_attachments', 'renamed-image.webp')), true);
  assert.equal(fs.existsSync(path.join(notesDir, 'Topic', '_attachments', 'clipboard-image.webp')), false);

  indexAllFiles();
  const tree = await requestJson(buildUrl('/api/tree'));
  assert.equal(JSON.stringify(tree.data).includes('_attachments'), false);

  const search = await requestJson(buildUrl('/api/search'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'renamed-image', search_content: true }),
  });
  assert.equal(search.response.status, 200);
  assert.deepEqual(search.data, []);
});

apiTest('attachments API отклоняет небезопасные пути и не-image upload', async () => {
  const outsideRaw = await requestJson(buildUrl('/api/attachments/raw', { path: 'notes/Topic/Alpha.md' }));
  assert.equal(outsideRaw.response.status, 403);

  const renameOutside = await requestJson(buildUrl('/api/attachments/rename'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      notePath: 'notes/Topic/Alpha.md',
      path: 'notes/Beta.md',
      newName: 'Escaped.webp',
    }),
  });
  assert.equal(renameOutside.response.status, 403);

  const form = new FormData();
  form.append('file', new Blob(['not image'], { type: 'text/plain' }), 'note.txt');
  const textUpload = await requestJson(buildUrl('/api/attachments', { notePath: 'notes/Topic/Alpha.md' }), {
    method: 'POST',
    body: form,
  });
  assert.equal(textUpload.response.status, 400);
});

apiTest('файловые маршруты отклоняют пути вне notes', async () => {
  const outsideFile = path.join(tempRoot, 'Outside.md');
  fs.writeFileSync(outsideFile, 'outside', 'utf-8');

  const readOutside = await requestJson(buildUrl('/api/file', { path: 'Outside.md' }));
  assert.equal(readOutside.response.status, 403);

  const infoOutside = await requestJson(buildUrl('/api/file-info', { path: 'Outside.md' }));
  assert.equal(infoOutside.response.status, 403);

  const writeOutside = await requestJson(buildUrl('/api/file', { path: 'Outside.md' }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'changed' }),
  });
  assert.equal(writeOutside.response.status, 403);
  assert.equal(fs.readFileSync(outsideFile, 'utf-8'), 'outside');

  const deleteOutside = await requestJson(buildUrl('/api/file', { path: 'Outside.md' }), {
    method: 'DELETE',
  });
  assert.equal(deleteOutside.response.status, 403);
  assert.equal(fs.existsSync(outsideFile), true);

  const renameOutside = await requestJson(buildUrl('/api/file/rename', { path: 'notes/Beta.md' }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_name: '../Beta Escaped.md' }),
  });
  assert.equal(renameOutside.response.status, 400);
  assert.equal(fs.existsSync(path.join(notesDir, 'Beta.md')), true);
  assert.equal(fs.existsSync(path.join(tempRoot, 'Beta Escaped.md')), false);

  const moveOutside = await requestJson(buildUrl('/api/file/move', {
    source: 'notes/Beta.md',
    target: '../MovedOut',
  }), {
    method: 'POST',
  });
  assert.equal(moveOutside.response.status, 403);
  assert.equal(fs.existsSync(path.join(notesDir, 'Beta.md')), true);

  const createDirectoryOutside = await requestJson(buildUrl('/api/directory/create', { path: '../MovedOut' }), {
    method: 'POST',
  });
  assert.equal(createDirectoryOutside.response.status, 403);
  assert.equal(fs.existsSync(path.join(tempRoot, 'MovedOut')), false);

  const createNoteOutside = await requestJson(buildUrl('/api/notes/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Escaped',
      category: '../MovedOut',
      tags: [],
      content: '',
    }),
  });
  assert.equal(createNoteOutside.response.status, 403);
  assert.equal(fs.existsSync(path.join(tempRoot, 'MovedOut', 'Escaped.md')), false);
});

apiTest('PUT /api/file/metadata и GET /api/tags обновляют title и tags', async () => {
  const metadataUrl = buildUrl('/api/file/metadata', { path: 'notes/Topic/Alpha.md' });
  const update = await requestJson(metadataUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Alpha Updated', tags: ['edited', 'shared'] }),
  });

  assert.equal(update.response.status, 200);
  assert.equal(update.data.title, 'Alpha Updated');

  const info = await requestJson(buildUrl('/api/file-info', { path: 'notes/Topic/Alpha.md' }));
  assert.equal(info.response.status, 200);
  assert.equal(info.data.metadata.title, 'Alpha Updated');
  assert.deepEqual(info.data.metadata.tags, ['edited', 'shared']);

  const savedContent = fs.readFileSync(path.join(notesDir, 'Topic', 'Alpha.md'), 'utf-8');
  assert.match(savedContent, /title: "Alpha Updated"/);
  assert.match(savedContent, /tags: \["edited", "shared"\]/);

  const tags = await requestJson(buildUrl('/api/tags'));
  assert.equal(tags.response.status, 200);
  assert.ok(tags.data.includes('edited'));
  assert.ok(tags.data.includes('shared'));
});

apiTest('GET /api/categories считает заметки по категориям без корзины и без регистра', async () => {
  const writeNote = async (name, category) => {
    const saved = await requestJson(buildUrl('/api/file', { create: '1', path: `notes/Topic/${name}.md` }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `---\ntitle: "${name}"\ncategory: "${category}"\n---\n\nBody\n` }),
    });
    assert.equal(saved.response.status, 200, `запись ${name}`);
  };
  await writeNote('CatOne', 'Zeta Cat');
  await writeNote('CatTwo', 'zeta cat');
  await writeNote('CatThree', 'Zeta Idea');
  await writeNote('CatGone', 'Zeta Trashed');
  const deleted = await requestJson(buildUrl('/api/file', { path: 'notes/Topic/CatGone.md' }), { method: 'DELETE' });
  assert.equal(deleted.response.status, 200);

  const categories = await requestJson(buildUrl('/api/categories'));
  assert.equal(categories.response.status, 200);
  const byName = Object.fromEntries(categories.data.map((item) => [item.name, item.count]));
  assert.equal(byName['Zeta Cat'], 2, 'написания Zeta Cat и zeta cat — одна категория');
  assert.equal(byName['Zeta Idea'], 1);
  assert.equal(byName['Zeta Trashed'], undefined, 'заметка из корзины не считается');
  const counts = categories.data.map((item) => item.count);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a), 'сначала самые частые');
});

apiTest('закрепление живёт в файле и переживает переименование тега', async () => {
  const pinnedPath = 'notes/Topic/Alpha.md';
  const fileOnDisk = path.join(notesDir, 'Topic', 'Alpha.md');

  const pin = await requestJson(buildUrl('/api/file/metadata', { path: pinnedPath }), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pinned: true }),
  });
  assert.equal(pin.response.status, 200);
  assert.match(fs.readFileSync(fileOnDisk, 'utf-8'), /pinned: true/);

  // Дерево — источник для сайдбара, значит закрепление должно быть в нём.
  const tree = await requestJson(buildUrl('/api/tree'));
  assert.equal(tree.response.status, 200);
  const findNote = (node) => {
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = findNote(child);
        if (found) return found;
      }
      return null;
    }
    if (!node || typeof node !== 'object') return null;
    if (node.path === pinnedPath) return node;
    return findNote(node.children);
  };
  assert.equal(findNote(tree.data)?.metadata?.pinned, true);

  // Переименование тега перезаписывает шапку — закрепление обязано уцелеть.
  const renamed = await requestJson(buildUrl('/api/tags/rename'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'edited', to: 'переименованный' }),
  });
  assert.equal(renamed.response.status, 200);
  assert.ok(renamed.data.changed.includes(pinnedPath));
  const after = fs.readFileSync(fileOnDisk, 'utf-8');
  assert.ok(after.includes('pinned: true'), 'переименование тега сняло закрепление');
  assert.ok(after.includes('переименованный'), 'новый тег не записан');

  // И снятие закрепления убирает ключ, а не оставляет "pinned: false".
  const unpin = await requestJson(buildUrl('/api/file/metadata', { path: pinnedPath }), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pinned: false }),
  });
  assert.equal(unpin.response.status, 200);
  const cleared = fs.readFileSync(fileOnDisk, 'utf-8');
  assert.ok(!cleared.includes('pinned'), 'ключ закрепления остался в файле');
});

apiTest('массовое тегирование помечает выбранные заметки и не трогает остальное', async () => {
  const alpha = 'notes/Topic/Alpha.md';
  const beta = 'notes/Beta.md';
  const untouched = 'notes/Topic/Note.md';

  const add = await requestJson(buildUrl('/api/notes/bulk-tag'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: [alpha, beta], tag: 'общий' }),
  });
  assert.equal(add.response.status, 200);
  assert.deepEqual(add.data.changed.sort(), [alpha, beta].sort());
  assert.equal(add.data.missing.length, 0);

  for (const file of [alpha, beta]) {
    const content = fs.readFileSync(path.join(notesDir, path.relative('notes', file)), 'utf-8');
    assert.ok(content.includes('общий'), `тег не записан в ${file}`);
  }

  // Повторное добавление того же тега не должен ничего менять.
  const again = await requestJson(buildUrl('/api/notes/bulk-tag'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: [alpha], tag: 'общий' }),
  });
  assert.equal(again.data.changed.length, 0, 'повторное тегирование должно быть холостым');

  // Снятие тега убирает его, но не выкидывает остальные — включая закрепление.
  // Массовое действие не должно тихо отменять то, что человек настроил раньше.
  const withOther = await requestJson(buildUrl('/api/file/metadata', { path: alpha }), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags: ['общий', 'другой'], title: 'Alpha Note', pinned: true }),
  });
  assert.equal(withOther.response.status, 200);
  assert.ok(fs.readFileSync(path.join(notesDir, 'Topic', 'Alpha.md'), 'utf-8').includes('pinned: true'));

  const remove = await requestJson(buildUrl('/api/notes/bulk-tag'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: [alpha], tag: 'общий', remove: true }),
  });
  assert.equal(remove.response.status, 200);
  const afterRemove = fs.readFileSync(path.join(notesDir, 'Topic', 'Alpha.md'), 'utf-8');
  assert.ok(!afterRemove.includes('"общий"'), 'тег остался в файле');
  assert.ok(afterRemove.includes('другой'), 'соседний тег должен был уцелеть');
  assert.ok(afterRemove.includes('pinned: true'), 'снятие тега отменило закрепление');

  // Заметка вне списка не меняется.
  const other = path.join(notesDir, 'Beta.md');
  const otherBefore = fs.readFileSync(other, 'utf-8');
  await requestJson(buildUrl('/api/notes/bulk-tag'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: [alpha], tag: 'другой-тег' }),
  });
  assert.equal(fs.readFileSync(other, 'utf-8'), otherBefore, 'заметка вне списка изменилась');
});

apiTest('массовое тегирование сообщает о пропавших заметках, а не падает', async () => {
  const result = await requestJson(buildUrl('/api/notes/bulk-tag'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paths: ['notes/Topic/Alpha.md', 'notes/НетТакой.md', '../вне хранилища.md'],
      tag: 'проверка',
    }),
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.data.changed, ['notes/Topic/Alpha.md']);
  assert.equal(result.data.missing.length, 2, 'пропавшие должны быть перечислены');
});

apiTest('массовое тегирование требует и пути, и тег', async () => {
  const noPaths = await requestJson(buildUrl('/api/notes/bulk-tag'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag: 'x' }),
  });
  assert.equal(noPaths.response.status, 400);

  const noTag = await requestJson(buildUrl('/api/notes/bulk-tag'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: ['notes/Topic/Alpha.md'] }),
  });
  assert.equal(noTag.response.status, 400);
});

apiTest('дублирование копирует заметку рядом и не занимает то же имя', async () => {
  const source = 'notes/Topic/Alpha.md';

  const first = await requestJson(buildUrl('/api/notes/duplicate', { path: source }), { method: 'POST' });
  assert.equal(first.response.status, 200);
  assert.equal(first.data.name, 'Alpha копия.md');

  const second = await requestJson(buildUrl('/api/notes/duplicate', { path: source }), { method: 'POST' });
  assert.equal(second.response.status, 200);
  assert.equal(second.data.name, 'Alpha копия 2.md', 'второе копия не должна перезаписать первое');

  const original = fs.readFileSync(path.join(notesDir, 'Topic', 'Alpha.md'), 'utf-8');
  const copy = fs.readFileSync(path.join(notesDir, 'Topic', 'Alpha копия.md'), 'utf-8');
  // Тело совпадает, заголовок помечен как копия.
  assert.ok(copy.includes('Первая') || copy.includes('Alpha'), 'тело должно было скопироваться');
  assert.notEqual(original, copy);
});

apiTest('дублирование отказывает для папки и несуществующей заметки', async () => {
  const missing = await requestJson(buildUrl('/api/notes/duplicate', { path: 'notes/НетТакой.md' }), { method: 'POST' });
  assert.equal(missing.response.status, 404);

  const dir = await requestJson(buildUrl('/api/notes/duplicate', { path: 'notes/Topic' }), { method: 'POST' });
  assert.equal(dir.response.status, 404);

  const outside = await requestJson(buildUrl('/api/notes/duplicate', { path: '../секрет.md' }), { method: 'POST' });
  assert.ok(outside.response.status >= 400, 'путь вне хранилища должен быть отклонён');
});

apiTest('metadata migration переносит старый SQLite cache во frontmatter перед reindex', async () => {
  const legacyPath = path.join(notesDir, 'Legacy Cache.md');
  fs.writeFileSync(legacyPath, 'Legacy cache body.', 'utf-8');

  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT OR REPLACE INTO notes_index
      (path, name, is_dir, parent_path, title, content, tags, category, date_created, last_opened)
    VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'notes/Legacy Cache.md',
    'Legacy Cache.md',
    'notes',
    'Legacy Cached Title',
    'Legacy cache body.',
    JSON.stringify(['legacy-cache']),
    'Archive',
    now,
    now
  );

  migrateCachedMetadataToFrontmatter();
  indexAllFiles();

  const savedContent = fs.readFileSync(legacyPath, 'utf-8');
  assert.match(savedContent, /title: "Legacy Cached Title"/);
  assert.match(savedContent, /category: "Archive"/);
  assert.match(savedContent, /tags: \["legacy-cache"\]/);

  const search = await requestJson(buildUrl('/api/search'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '#legacy-cache', search_content: false }),
  });
  assert.equal(search.response.status, 200);
  assert.equal(search.data[0].path, 'notes/Legacy Cache.md');
});

apiTest('POST /api/file сохраняет контент и делает его доступным в поиске', async () => {
  const content = `---
title: "Alpha Updated"
tags: ["edited", "shared"]
---

The retrieval pipeline is now documented.
`;

  const save = await requestJson(buildUrl('/api/file', { path: 'notes/Topic/Alpha.md' }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });

  assert.equal(save.response.status, 200);

  const search = await requestJson(buildUrl('/api/search'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'retrieval pipeline', search_content: true }),
  });

  assert.equal(search.response.status, 200);
  assert.equal(search.data[0].path, 'notes/Topic/Alpha.md');
  assert.equal(search.data[0].name, 'Alpha Updated');
});

apiTest('POST /api/notes/create, resolve-link и backlinks работают вместе', async () => {
  const created = await requestJson(buildUrl('/api/notes/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Gamma',
      category: 'Work/Ideas',
      tags: ['gamma'],
      content: 'Gamma links to [[Beta Note]].',
    }),
  });

  assert.equal(created.response.status, 200);
  assert.equal(created.data.path, 'notes/Work/Ideas/Gamma.md');

  const createdContent = fs.readFileSync(path.join(notesDir, 'Work', 'Ideas', 'Gamma.md'), 'utf-8');
  assert.match(createdContent, /title: "Gamma"/);
  assert.match(createdContent, /category: "Work\/Ideas"/);
  assert.match(createdContent, /tags: \["gamma"\]/);

  const tagSearch = await requestJson(buildUrl('/api/search'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '#gamma', search_content: false }),
  });
  assert.equal(tagSearch.response.status, 200);
  assert.equal(tagSearch.data[0].path, 'notes/Work/Ideas/Gamma.md');

  const resolved = await requestJson(buildUrl('/api/notes/resolve-link', { name: 'Gamma' }));
  assert.equal(resolved.response.status, 200);
  assert.equal(resolved.data.path, 'notes/Work/Ideas/Gamma.md');

  const plainMention = await requestJson(buildUrl('/api/notes/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Delta',
      category: 'Work/Ideas',
      tags: [],
      content: 'Delta mentions Beta Note without a wiki link.',
    }),
  });
  assert.equal(plainMention.response.status, 200);

  const backlinks = await requestJson(buildUrl('/api/notes/backlinks', { path: 'notes/Beta.md' }));
  assert.equal(backlinks.response.status, 200);
  assert.ok(backlinks.data.some((entry) => (
    entry.path === 'notes/Work/Ideas/Gamma.md' && entry.type === 'backlink'
  )));
  assert.ok(!backlinks.data.some((entry) => entry.path === 'notes/Work/Ideas/Delta.md'));

  const suggestions = await requestJson(buildUrl('/api/notes/suggest', { query: 'gam' }));
  assert.equal(suggestions.response.status, 200);
  assert.ok(suggestions.data.some((entry) => (
    entry.path === 'notes/Work/Ideas/Gamma.md' && entry.insertText === 'Gamma'
  )));
});

apiTest('POST /api/notes/create индексирует новую папку категории для дерева', async () => {
  const created = await requestJson(buildUrl('/api/notes/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '02-06-26-10-20-36',
      category: 'Daily',
      tags: [],
      content: 'Привет!',
    }),
  });

  assert.equal(created.response.status, 200);
  assert.equal(created.data.path, 'notes/Daily/02-06-26-10-20-36.md');

  const tree = await requestJson(buildUrl('/api/tree'));
  assert.equal(tree.response.status, 200);
  const dailyDir = tree.data.children.find((child) => child.path === 'notes/Daily');
  assert.ok(dailyDir);
  assert.ok(dailyDir.children.some((child) => child.path === 'notes/Daily/02-06-26-10-20-36.md'));
});

apiTest('resolve-link находит заметку, даже если имя на диске разложено (NFD)', async () => {
  // macOS отдаёт имена файлов разложенными, а связку набирают сложёнными.
  // Сравнение байт в SQL такое не прощает: «Запрос новой функциональности» не
  // находился, хотя файл лежал рядом. В корпусе таких имён было 19 из 109.
  const nfc = 'Запрос новой функциональности';
  const nfd = nfc.normalize('NFD');
  assert.notEqual(nfc, nfd, 'проверка бессмысленна: строки совпали');

  const dir = path.join(notesDir, 'NFCTest');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${nfd}.md`);
  fs.writeFileSync(file, 'тело заметки\n', 'utf8');
  indexAllFiles();

  const resolved = await requestJson(buildUrl('/api/notes/resolve-link', { name: nfc }));
  assert.equal(resolved.response.status, 200);
  assert.ok(resolved.data.path, `заметка не нашлась по сложенному имени: ${JSON.stringify(resolved.data)}`);
  // Путь из ответа относителен к корню заметок, а он в тесте — временный.
  assert.ok(
    fs.existsSync(path.join(tempRoot, resolved.data.path)),
    'путь из ответа обязан существовать на диске',
  );

  fs.rmSync(file, { force: true });
});

apiTest('миграция НЕ возвращает удалённые из файла метаданные', async () => {
  // Регрессия: ручная правка шапки отменялась при каждом старте бэкенда.
  // Пользователь удалил category из файла, БД её помнил — и миграция писала
  // значение обратно в markdown. Так в хранилище попало category: "Проверено".
  const file = path.join(notesDir, 'Migrated.md');
  fs.writeFileSync(file, '---\ntitle: "Своё"\ntags: []\n---\n\nТело.\n', 'utf8');
  indexAllFiles();

  // Имитируем рассинхрон: в БД категория осталась, в файле её удалили.
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(path.join(tempRoot, '.data', 'notes.db'));
  db.prepare("UPDATE notes_index SET category = ? WHERE path = ?").run('Проверено', 'notes/Migrated.md');
  db.close();

  const { migrateCachedMetadataToFrontmatter } = await import('./indexing.js');
  migrateCachedMetadataToFrontmatter();

  const after = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(after, /category/, 'удалённая категория вернулась в файл');
  assert.match(after, /title: "Своё"/);
  assert.match(after, /Тело\./);
  fs.rmSync(file, { force: true });
});

apiTest('миграция дописывает кэшированные метаданные в файл без шапки', async () => {
  // Настоящий случай миграции: заметка старая, шапки у неё нет, а метаданные
  // остались в БД от прежней версии. Восстанавливаем — так и задумано.
  const file = path.join(notesDir, 'LegacyNote.md');
  fs.writeFileSync(file, 'Просто тело без шапки.\n', 'utf8');
  indexAllFiles();

  const Database = (await import('better-sqlite3')).default;
  const db = new Database(path.join(tempRoot, '.data', 'notes.db'));
  db.prepare('UPDATE notes_index SET category = ? WHERE path = ?').run('Из кэша', 'notes/LegacyNote.md');
  db.close();

  const { migrateCachedMetadataToFrontmatter } = await import('./indexing.js');
  migrateCachedMetadataToFrontmatter();

  const after = fs.readFileSync(file, 'utf8');
  assert.match(after, /^---\n/, 'у файла без шапки она должна появиться');
  assert.match(after, /category: "Из кэша"/);
  assert.match(after, /Просто тело/);
  fs.rmSync(file, { force: true });
});

apiTest('GET /api/notes/resolve-link возвращает пустой объект для неизвестной заметки', async () => {
  const resolved = await requestJson(buildUrl('/api/notes/resolve-link', { name: 'Does Not Exist' }));
  assert.equal(resolved.response.status, 200);
  assert.deepEqual(resolved.data, {});
});

apiTest('POST /api/directory/create и GET /api/directories создают новые папки', async () => {
  const created = await requestJson(buildUrl('/api/directory/create', { path: 'notes/NewDir/Sub' }), {
    method: 'POST',
  });

  assert.equal(created.response.status, 200);

  const directories = await requestJson(buildUrl('/api/directories'));
  assert.equal(directories.response.status, 200);
  assert.ok(directories.data.includes('NewDir'));
  assert.ok(directories.data.includes('NewDir/Sub'));
});

apiTest('POST /api/settings и GET /api/settings сохраняют настройки', async () => {
  const saved = await requestJson(buildUrl('/api/settings'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      theme: 'gruvbox',
      featureFlags: { searchTests: true },
    }),
  });

  assert.equal(saved.response.status, 200);

  const settings = await requestJson(buildUrl('/api/settings'));
  assert.equal(settings.response.status, 200);
  assert.equal(settings.data.theme, 'gruvbox');
  assert.deepEqual(settings.data.featureFlags, { searchTests: true });
});

apiTest('PUT /api/templates сохраняет пользовательские шаблоны на диск', async () => {
  const payload = {
    customTemplates: [
      {
        id: 'custom-research',
        title: 'Research Template',
        description: 'Personal research flow',
        category: 'Research',
        tags: ['research', 'personal'],
        content: '# {{title}}\n\n## Notes\n-',
      },
    ],
    hiddenLibraryTemplateIds: ['daily-note'],
  };

  const saved = await requestJson(buildUrl('/api/templates'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  assert.equal(saved.response.status, 200);
  assert.equal(saved.data.customTemplates[0].title, 'Research Template');
  assert.deepEqual(saved.data.hiddenLibraryTemplateIds, ['daily-note']);

  const templateFile = path.join(notesDir, '.monos', 'templates.json');
  assert.ok(fs.existsSync(templateFile));
  const disk = JSON.parse(fs.readFileSync(templateFile, 'utf-8'));
  assert.equal(disk.customTemplates[0].id, 'custom-research');

  const loaded = await requestJson(buildUrl('/api/templates'));
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.data.customTemplates[0].category, 'Research');
  assert.deepEqual(loaded.data.customTemplates[0].tags, ['research', 'personal']);
  assert.deepEqual(loaded.data.hiddenLibraryTemplateIds, ['daily-note']);
});

apiTest('git-маршруты валидируют обязательные параметры до инициализации репозитория', async () => {
  const setup = await requestJson(buildUrl('/api/git/setup'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: '', repo: '', branch: '' }),
  });
  assert.equal(setup.response.status, 400);

  const repos = await requestJson(buildUrl('/api/git/repos'));
  assert.equal(repos.response.status, 400);

  const branches = await requestJson(buildUrl('/api/git/branches', { token: 'test' }));
  assert.equal(branches.response.status, 400);

  const user = await requestJson(buildUrl('/api/git/user'));
  assert.equal(user.response.status, 400);

  const sync = await requestJson(buildUrl('/api/git/sync'), { method: 'POST' });
  assert.equal(sync.response.status, 400);
});

apiTest('git-маршруты GitHub API возвращают ожидаемые структуры', async () => {
  await withMockedFetch(createJsonGetMock({
    '/user/repos?per_page=100&sort=updated': [
      { full_name: 'aa-blinov/zed-notes' },
      { full_name: 'aa-blinov/wiki' },
    ],
    '/repos/aa-blinov/zed-notes/branches?per_page=100': [
      { name: 'main' },
      { name: 'develop' },
    ],
    '/user': { login: 'aa-blinov' },
  }), async () => {
    const repos = await requestJson(buildUrl('/api/git/repos', { token: 'ghp_test' }));
    assert.equal(repos.response.status, 200);
    assert.deepEqual(repos.data, ['aa-blinov/zed-notes', 'aa-blinov/wiki']);

    const branches = await requestJson(buildUrl('/api/git/branches', {
      token: 'ghp_test',
      repo: 'aa-blinov/zed-notes',
    }));
    assert.equal(branches.response.status, 200);
    assert.deepEqual(branches.data, ['main', 'develop']);

    const user = await requestJson(buildUrl('/api/git/user', { token: 'ghp_test' }));
    assert.equal(user.response.status, 200);
    assert.deepEqual(user.data, { login: 'aa-blinov' });
  });
});

apiTest('git-маршруты GitHub API возвращают 500 при сетевой ошибке', async () => {
  await withMockedFetch(createJsonGetMock({
    '/user/repos?per_page=100&sort=updated': new Error('network down'),
  }), async () => {
    const repos = await requestJson(buildUrl('/api/git/repos', { token: 'ghp_test' }));
    assert.equal(repos.response.status, 500);
    assert.match(repos.data.detail, /network down/);
  });
});

apiTest('POST /api/directory/icon отражается в дереве директорий', async () => {
  const updated = await requestJson(buildUrl('/api/directory/icon', { path: 'notes/Topic' }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ icon: 'folder-open', color: '#ff9900' }),
  });

  assert.equal(updated.response.status, 200);

  const tree = await requestJson(buildUrl('/api/tree'));
  const topicDir = tree.data.children.find((child) => child.path === 'notes/Topic');
  assert.equal(topicDir.icon, 'folder-open');
  assert.equal(topicDir.color, '#ff9900');

  const noteColor = await requestJson(buildUrl('/api/directory/icon', { path: 'notes/Topic/Alpha.md' }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ color: '#8ec07c' }),
  });
  assert.equal(noteColor.response.status, 200);

  const info = await requestJson(buildUrl('/api/file-info', { path: 'notes/Topic/Alpha.md' }));
  assert.equal(info.response.status, 200);
  assert.equal(info.data.color, '#8ec07c');
});

apiTest('POST /api/directory/icon очищает иконку и цвет', async () => {
  const cleared = await requestJson(buildUrl('/api/directory/icon', { path: 'notes/Topic' }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ icon: null, color: null }),
  });

  assert.equal(cleared.response.status, 200);

  const tree = await requestJson(buildUrl('/api/tree'));
  const topicDir = tree.data.children.find((child) => child.path === 'notes/Topic');
  assert.equal(topicDir.icon, null);
  assert.equal(topicDir.color, null);
});

apiTest('rename, move и delete обновляют файловое дерево и индекс', async () => {
  const create = await requestJson(buildUrl('/api/notes/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Temp Move',
      category: '',
      tags: [],
      content: 'Temporary note.',
    }),
  });

  assert.equal(create.response.status, 200);

  const rename = await requestJson(buildUrl('/api/file/rename', { path: 'notes/Temp Move.md' }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_name: 'Temp Renamed.md' }),
  });

  assert.equal(rename.response.status, 200);
  assert.equal(rename.data.path, 'notes/Temp Renamed.md');

  const move = await requestJson(buildUrl('/api/file/move', {
    source: 'notes/Temp Renamed.md',
    target: 'notes/NewDir/Sub',
  }), {
    method: 'POST',
  });

  assert.equal(move.response.status, 200);

  const movedInfo = await requestJson(buildUrl('/api/file-info', { path: 'notes/NewDir/Sub/Temp Renamed.md' }));
  assert.equal(movedInfo.response.status, 200);

  const notePath = 'notes/NewDir/Sub/Temp Renamed.md';
  const deleted = await requestJson(buildUrl('/api/file', { path: notePath }), {
    method: 'DELETE',
  });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.data.message, 'Moved to trash');

  const trashedInfo = await requestJson(buildUrl('/api/file-info', { path: notePath }));
  assert.equal(trashedInfo.response.status, 410);

  const trash = await requestJson(buildUrl('/api/notes/trash'));
  assert.equal(trash.response.status, 200);
  assert.ok(trash.data.some((note) => note.path === notePath));

  const tree = await requestJson(buildUrl('/api/tree'));
  assert.equal(tree.response.status, 200);
  assert.ok(!JSON.stringify(tree.data).includes('Temp Renamed.md'));

  const restored = await requestJson(buildUrl('/api/notes/restore', { path: notePath }), {
    method: 'POST',
  });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.data.path, notePath);

  const restoredInfo = await requestJson(buildUrl('/api/file-info', { path: notePath }));
  assert.equal(restoredInfo.response.status, 200);

  const permanent = await requestJson(buildUrl('/api/file', { path: notePath, permanent: '1' }), {
    method: 'DELETE',
  });
  assert.equal(permanent.response.status, 200);

  const missing = await requestJson(buildUrl('/api/file-info', { path: notePath }));
  assert.equal(missing.response.status, 404);
});

apiTest('rename папки сразу обновляет дерево, индекс и настройки вложенных путей', async () => {
  const sourceDir = path.join(notesDir, 'Rename Source');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'Child.md'), `---
title: "Rename Child"
tags: ["rename"]
---

Child content.
`, 'utf-8');
  indexAllFiles();

  const icon = await requestJson(buildUrl('/api/directory/icon', { path: 'notes/Rename Source/Nested' }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ icon: 'folder', color: '#fabd2f' }),
  });
  assert.equal(icon.response.status, 200);

  const rename = await requestJson(buildUrl('/api/file/rename', { path: 'notes/Rename Source' }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_name: 'Rename Target' }),
  });

  assert.equal(rename.response.status, 200);
  assert.equal(rename.data.path, 'notes/Rename Target');

  const oldInfo = await requestJson(buildUrl('/api/file-info', { path: 'notes/Rename Source/Child.md' }));
  assert.equal(oldInfo.response.status, 404);

  const newInfo = await requestJson(buildUrl('/api/file-info', { path: 'notes/Rename Target/Child.md' }));
  assert.equal(newInfo.response.status, 200);

  const tree = await requestJson(buildUrl('/api/tree'));
  assert.equal(tree.response.status, 200);
  const treeJson = JSON.stringify(tree.data);
  assert.ok(treeJson.includes('Rename Target'));
  assert.ok(treeJson.includes('Child.md'));
  assert.ok(!treeJson.includes('Rename Source'));

  const nestedConfig = getDb().prepare('SELECT color FROM folder_config WHERE path = ?').get('notes/Rename Target/Nested');
  assert.equal(nestedConfig.color, '#fabd2f');
});

apiTest('GET /api/backup/export возвращает ZIP с видимой иерархией заметок', async () => {
  fs.mkdirSync(path.join(notesDir, '.monos'), { recursive: true });
  fs.writeFileSync(path.join(notesDir, '.monos', 'templates.json'), '{"customTemplates":[]}', 'utf-8');

  const response = await realFetch(buildUrl('/api/backup/export'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/zip');
  assert.match(response.headers.get('content-disposition'), /monos-notes-\d{4}-\d{2}-\d{2}\.zip/);

  const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
  const entryNames = zip.getEntries().map(entry => entry.entryName);
  assert.ok(entryNames.includes('Topic/Alpha.md'));
  assert.ok(entryNames.includes('Beta.md'));
  assert.ok(!entryNames.includes('.monos/templates.json'));
  assert.ok(!entryNames.includes('.secret/Hidden.md'));
});

apiTest('POST /api/backup/import мержит ZIP без перезаписи существующих файлов', async () => {
  const zip = new AdmZip();
  zip.addFile('Imported/Nested.md', Buffer.from('# Imported\n\nHello import.\n'));
  zip.addFile('Imported/Utf16.md', Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    Buffer.from('---\ntitle: "UTF16 Note"\ntags: ["import"]\n---\n\nПривет из UTF-16 заметки.\n', 'utf16le'),
  ]));
  zip.addFile('Topic/Alpha.md', Buffer.from('# Imported duplicate\n'));
  zip.addFile('Imported/_attachments/image.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  zip.addFile('Imported/unsafe.exe', Buffer.from('skip'));
  zip.addFile('__MACOSX/Junk.md', Buffer.from('# Junk\n'));
  zip.addFile('.monos/templates.json', Buffer.from('{}'));

  const form = new FormData();
  form.append('archive', new Blob([zip.toBuffer()], { type: 'application/zip' }), 'notes.zip');

  const imported = await requestJson(buildUrl('/api/backup/import'), {
    method: 'POST',
    body: form,
  });

  assert.equal(imported.response.status, 200);
  assert.equal(imported.data.importedNotes, 3);
  assert.equal(imported.data.importedAttachments, 1);
  assert.equal(imported.data.renamed, 1);
  assert.equal(fs.existsSync(path.join(notesDir, 'Imported', 'Nested.md')), true);
  assert.equal(fs.readFileSync(path.join(notesDir, 'Imported', 'Utf16.md'), 'utf-8').includes('\u0000'), false);
  assert.equal(fs.existsSync(path.join(notesDir, 'Topic', 'Alpha 2.md')), true);
  assert.equal(fs.existsSync(path.join(notesDir, 'Imported', '_attachments', 'image.png')), true);
  assert.equal(fs.existsSync(path.join(notesDir, 'Imported', 'unsafe.exe')), false);

  const tree = await requestJson(buildUrl('/api/tree'));
  assert.equal(tree.response.status, 200);
  assert.ok(JSON.stringify(tree.data).includes('Nested.md'));
  assert.ok(JSON.stringify(tree.data).includes('Utf16.md'));
  assert.ok(JSON.stringify(tree.data).includes('Alpha 2.md'));

  const utf16File = await requestJson(buildUrl('/api/file', { path: 'notes/Imported/Utf16.md' }));
  assert.equal(utf16File.response.status, 200);
  assert.match(utf16File.data.content, /Привет из UTF-16 заметки/);
  assert.equal(utf16File.data.content.includes('\u0000'), false);
});

apiTest('GET /api/git/status и /api/git/log работают с локальным git-репозиторием', async () => {
  execSync('git init', { cwd: notesDir, stdio: 'pipe' });
  execSync('git config user.name "Monos Tests"', { cwd: notesDir, stdio: 'pipe' });
  execSync('git config user.email "tests@monos.local"', { cwd: notesDir, stdio: 'pipe' });
  execSync('git add -A', { cwd: notesDir, stdio: 'pipe' });
  execSync('git commit -m "Initial notes"', { cwd: notesDir, stdio: 'pipe' });

  const cleanStatus = await requestJson(buildUrl('/api/git/status'));
  assert.equal(cleanStatus.response.status, 200);
  assert.equal(cleanStatus.data.initialized, true);
  assert.equal(cleanStatus.data.hasChanges, false);
  assert.ok(cleanStatus.data.current_branch);

  const log = await requestJson(buildUrl('/api/git/log', { limit: '5' }));
  assert.equal(log.response.status, 200);
  assert.ok(log.data.some((entry) => entry.message === 'Initial notes'));

  fs.appendFileSync(path.join(notesDir, 'Beta.md'), '\nDirty change.\n', 'utf-8');

  const dirtyStatus = await requestJson(buildUrl('/api/git/status'));
  assert.equal(dirtyStatus.response.status, 200);
  assert.equal(dirtyStatus.data.initialized, true);
  assert.equal(dirtyStatus.data.hasChanges, true);
  assert.equal(dirtyStatus.data.status, 'dirty');
});

apiTest('POST /api/git/sync коммитит локальные изменения и обновляет время синхронизации', async () => {
  const remoteDir = path.join(tempRoot, 'remote.git');
  execSync(`git init --bare "${remoteDir}"`, { cwd: tempRoot, stdio: 'pipe' });
  execSync(`git remote add origin "${remoteDir}"`, { cwd: notesDir, stdio: 'pipe' });

  const branch = execSync('git branch --show-current', {
    cwd: notesDir,
    stdio: 'pipe',
    encoding: 'utf-8',
  }).trim();

  execSync(`git push -u origin ${branch}`, { cwd: notesDir, stdio: 'pipe' });
  fs.appendFileSync(path.join(notesDir, 'Beta.md'), '\nSynced change.\n', 'utf-8');

  const synced = await requestJson(buildUrl('/api/git/sync'), { method: 'POST' });
  assert.equal(synced.response.status, 200);
  assert.equal(synced.data.conflicts, false);

  const latestCommit = execSync('git log -1 --pretty=%s', {
    cwd: notesDir,
    stdio: 'pipe',
    encoding: 'utf-8',
  }).trim();
  assert.equal(latestCommit, 'Auto-sync from Monos');

  const remoteCommit = execSync(`git --git-dir "${remoteDir}" log -1 --pretty=%s`, {
    cwd: tempRoot,
    stdio: 'pipe',
    encoding: 'utf-8',
  }).trim();
  assert.equal(remoteCommit, 'Auto-sync from Monos');

  const settingsPath = path.join(tempRoot, '.data', 'git_settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  assert.ok(settings.last_sync);
});

apiTest('POST /api/git/sync превращает diverged edits в разрешаемый конфликт', async () => {
  const conflictRemoteDir = path.join(tempRoot, 'conflict-remote.git');
  const peerDir = path.join(tempRoot, 'conflict-peer');
  execSync(`git init --bare "${conflictRemoteDir}"`, { cwd: tempRoot, stdio: 'pipe' });
  execSync(`git remote set-url origin "${conflictRemoteDir}"`, { cwd: notesDir, stdio: 'pipe' });

  const branch = execSync('git branch --show-current', {
    cwd: notesDir,
    stdio: 'pipe',
    encoding: 'utf-8',
  }).trim();
  execSync(`git push -u origin ${branch}`, { cwd: notesDir, stdio: 'pipe' });

  const baseFile = path.join(notesDir, 'SyncConflict.md');
  fs.writeFileSync(baseFile, 'base\n', 'utf-8');
  const baseSync = await requestJson(buildUrl('/api/git/sync'), { method: 'POST' });
  assert.equal(baseSync.response.status, 200);
  assert.equal(baseSync.data.conflicts, false);

  execSync(`git clone "${conflictRemoteDir}" "${peerDir}"`, { cwd: tempRoot, stdio: 'pipe' });
  execSync('git config user.name "Monos Peer"', { cwd: peerDir, stdio: 'pipe' });
  execSync('git config user.email "peer@monos.local"', { cwd: peerDir, stdio: 'pipe' });
  fs.writeFileSync(path.join(peerDir, 'SyncConflict.md'), 'remote version\n', 'utf-8');
  execSync('git add SyncConflict.md', { cwd: peerDir, stdio: 'pipe' });
  execSync('git commit -m "Peer edits sync conflict"', { cwd: peerDir, stdio: 'pipe' });
  execSync(`git push origin ${branch}`, { cwd: peerDir, stdio: 'pipe' });

  fs.writeFileSync(baseFile, 'local version\n', 'utf-8');
  const conflictSync = await requestJson(buildUrl('/api/git/sync'), { method: 'POST' });
  assert.equal(conflictSync.response.status, 200, JSON.stringify(conflictSync.data));
  assert.equal(conflictSync.data.conflicts, true);

  const conflictStatus = await requestJson(buildUrl('/api/git/status'));
  assert.equal(conflictStatus.response.status, 200);
  assert.equal(conflictStatus.data.status, 'conflict');

  const repeatedSync = await requestJson(buildUrl('/api/git/sync'), { method: 'POST' });
  assert.equal(repeatedSync.response.status, 200);
  assert.equal(repeatedSync.data.conflicts, true);

  const conflicts = await requestJson(buildUrl('/api/git/conflicts'));
  assert.equal(conflicts.response.status, 200);
  const conflict = conflicts.data.find(item => item.path === 'SyncConflict.md');
  assert.ok(conflict);
  assert.equal(conflict.ours, 'local version');
  assert.equal(conflict.theirs, 'remote version');

  const resolved = await requestJson(buildUrl('/api/git/conflicts/resolve'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolutions: { 'SyncConflict.md': 'ours' } }),
  });
  assert.equal(resolved.response.status, 200);
  assert.equal(fs.readFileSync(baseFile, 'utf-8'), 'local version\n');
});

apiTest('POST /api/git/sync возвращает ошибку и не обновляет last_sync при failed push', async () => {
  const rejectRemoteDir = path.join(tempRoot, 'reject-remote.git');
  execSync(`git init --bare "${rejectRemoteDir}"`, { cwd: tempRoot, stdio: 'pipe' });
  execSync(`git remote set-url origin "${rejectRemoteDir}"`, { cwd: notesDir, stdio: 'pipe' });

  const branch = execSync('git branch --show-current', {
    cwd: notesDir,
    stdio: 'pipe',
    encoding: 'utf-8',
  }).trim();
  execSync(`git push -u origin ${branch}`, { cwd: notesDir, stdio: 'pipe' });

  const hookPath = path.join(rejectRemoteDir, 'hooks', 'pre-receive');
  fs.writeFileSync(hookPath, '#!/bin/sh\necho "push rejected by test" >&2\nexit 1\n', 'utf-8');
  fs.chmodSync(hookPath, 0o755);

  const settingsPath = path.join(tempRoot, '.data', 'git_settings.json');
  const previousSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));

  fs.appendFileSync(path.join(notesDir, 'Beta.md'), '\nRejected sync change.\n', 'utf-8');
  const failedSync = await requestJson(buildUrl('/api/git/sync'), { method: 'POST' });

  assert.equal(failedSync.response.status, 500);
  assert.match(failedSync.data.detail, /push rejected by test/);

  const nextSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  assert.equal(nextSettings.last_sync, previousSettings.last_sync);
});

apiTest('git routes не выполняют shell payload из пользовательских аргументов', async () => {
  const markerPath = path.join(tempRoot, 'git-shell-injection-marker');
  fs.rmSync(markerPath, { force: true });

  const maliciousFile = `"; touch "${markerPath}"; #`;
  const resolved = await requestJson(buildUrl('/api/git/conflicts/resolve'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: [maliciousFile] }),
  });

  assert.equal(resolved.response.status, 500);
  assert.equal(fs.existsSync(markerPath), false);
});

apiTest('git remote URL не содержит GitHub token', () => {
  const token = 'ghp_secret_token_for_test';
  const remoteUrl = buildGithubRemoteUrl('owner/repo');

  assert.equal(remoteUrl, 'https://github.com/owner/repo.git');
  assert.equal(remoteUrl.includes(token), false);
  assert.equal(remoteUrl.includes('@github.com'), false);
});

apiTest('GET /api/git/conflicts и POST /api/git/conflicts/resolve работают с theirs в подпапке', async () => {
  const conflictPath = 'Nested/Conflict.md';
  const baseFile = path.join(notesDir, conflictPath);
  fs.mkdirSync(path.dirname(baseFile), { recursive: true });
  const currentBranch = execSync('git branch --show-current', {
    cwd: notesDir,
    stdio: 'pipe',
    encoding: 'utf-8',
  }).trim();

  fs.writeFileSync(baseFile, 'base\n', 'utf-8');
  execSync(`git add "${conflictPath}"`, { cwd: notesDir, stdio: 'pipe' });
  execSync('git commit -m "Add conflict base"', { cwd: notesDir, stdio: 'pipe' });

  execSync('git checkout -b conflict-branch', { cwd: notesDir, stdio: 'pipe' });
  fs.writeFileSync(baseFile, 'branch version\n', 'utf-8');
  execSync(`git add "${conflictPath}"`, { cwd: notesDir, stdio: 'pipe' });
  execSync('git commit -m "Branch change"', { cwd: notesDir, stdio: 'pipe' });

  execSync(`git checkout ${currentBranch}`, { cwd: notesDir, stdio: 'pipe' });
  fs.writeFileSync(baseFile, 'main version\n', 'utf-8');
  execSync(`git add "${conflictPath}"`, { cwd: notesDir, stdio: 'pipe' });
  execSync('git commit -m "Main change"', { cwd: notesDir, stdio: 'pipe' });

  try {
    execSync('git merge conflict-branch', { cwd: notesDir, stdio: 'pipe' });
  } catch {}

  const conflicts = await requestJson(buildUrl('/api/git/conflicts'));
  assert.equal(conflicts.response.status, 200);
  assert.ok(Array.isArray(conflicts.data));
  assert.ok(conflicts.data.some(c => c.path === conflictPath));
  const conflict = conflicts.data.find(c => c.path === conflictPath);
  assert.equal(conflict.ours, 'main version');
  assert.equal(conflict.theirs, 'branch version');

  const resolved = await requestJson(buildUrl('/api/git/conflicts/resolve'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolutions: { [conflictPath]: 'theirs' } }),
  });

  assert.equal(resolved.response.status, 200);
  assert.equal(fs.readFileSync(baseFile, 'utf-8'), 'branch version\n');

  const afterResolve = await requestJson(buildUrl('/api/git/conflicts'));
  assert.equal(afterResolve.response.status, 200);
  assert.deepEqual(afterResolve.data, []);
});

apiTest('POST /api/notes/create с openIfExists возвращает существующую заметку, а без флага — 409', async () => {
  const body = (extra = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Today Once', category: 'Daily', tags: [], content: '', ...extra }) });
  const first = await requestJson(buildUrl('/api/notes/create'), body());
  assert.equal(first.response.status, 200);
  const again = await requestJson(buildUrl('/api/notes/create'), body({ openIfExists: true }));
  assert.equal(again.response.status, 200);
  assert.equal(again.data.existing, true);
  assert.equal(again.data.path, first.data.path);
  const refused = await requestJson(buildUrl('/api/notes/create'), body());
  assert.equal(refused.response.status, 409);
});

apiTest('POST /api/git/sync-on-quit: без выбора человека ничего не отправляет, с выбором — отправляет', async () => {
  const remoteDir = path.join(tempRoot, 'quit-remote.git');
  execSync(`git init --bare "${remoteDir}"`, { cwd: tempRoot, stdio: 'pipe' });
  try {
    execSync(`git remote add origin "${remoteDir}"`, { cwd: notesDir, stdio: 'pipe' });
  } catch {
    execSync(`git remote set-url origin "${remoteDir}"`, { cwd: notesDir, stdio: 'pipe' });
  }
  const branch = execSync('git branch --show-current', { cwd: notesDir, stdio: 'pipe', encoding: 'utf-8' }).trim();
  execSync(`git push -u origin ${branch}`, { cwd: notesDir, stdio: 'pipe' });
  const remoteFiles = () => execSync(`git --git-dir "${remoteDir}" ls-tree -r --name-only ${branch}`, {
    cwd: tempRoot,
    stdio: 'pipe',
    encoding: 'utf-8',
  });
  const saveQuitChoice = (value) => requestJson(buildUrl('/api/settings'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ git_auto_upload_quit: value }),
  });

  fs.writeFileSync(path.join(notesDir, 'Quit-off.md'), 'written, not uploaded\n', 'utf-8');
  const skipped = await requestJson(buildUrl('/api/git/sync-on-quit'), { method: 'POST' });
  assert.equal(skipped.response.status, 200);
  assert.equal(skipped.data.skipped, 'off');
  assert.equal(remoteFiles().includes('Quit-off.md'), false);

  await saveQuitChoice(true);
  fs.writeFileSync(path.join(notesDir, 'Quit-on.md'), 'uploaded when the app closes\n', 'utf-8');
  const sent = await requestJson(buildUrl('/api/git/sync-on-quit'), { method: 'POST' });
  assert.equal(sent.response.status, 200);
  assert.equal(sent.data.conflicts, false);
  assert.equal(remoteFiles().includes('Quit-on.md'), true);
  await saveQuitChoice(false);
});

apiTest('POST /api/git/pull считает коммиты, которые пришли с другого устройства', async () => {
  const remoteDir = path.join(tempRoot, 'arrived-remote.git');
  execSync(`git init --bare "${remoteDir}"`, { cwd: tempRoot, stdio: 'pipe' });
  try {
    execSync(`git remote add origin "${remoteDir}"`, { cwd: notesDir, stdio: 'pipe' });
  } catch {
    execSync(`git remote set-url origin "${remoteDir}"`, { cwd: notesDir, stdio: 'pipe' });
  }
  const branch = execSync('git branch --show-current', { cwd: notesDir, stdio: 'pipe', encoding: 'utf-8' }).trim();
  execSync(`git push -u origin ${branch}`, { cwd: notesDir, stdio: 'pipe' });

  const peerDir = path.join(tempRoot, 'arrived-peer');
  execSync(`git clone -b ${branch} "${remoteDir}" "${peerDir}"`, { cwd: tempRoot, stdio: 'pipe' });
  execSync('git config user.email peer@example.test && git config user.name Peer', { cwd: peerDir, stdio: 'pipe' });
  fs.writeFileSync(path.join(peerDir, 'Arrived.md'), 'from another device\n', 'utf-8');
  execSync('git add -A && git commit -m "Auto-sync from Peer"', { cwd: peerDir, stdio: 'pipe' });
  execSync(`git push origin ${branch}`, { cwd: peerDir, stdio: 'pipe' });

  const pulled = await requestJson(buildUrl('/api/git/pull'), { method: 'POST' });
  assert.equal(pulled.response.status, 200);
  assert.equal(pulled.data.received, 1);
  assert.equal(fs.readFileSync(path.join(notesDir, 'Arrived.md'), 'utf-8'), 'from another device\n');
});

apiTest('POST /api/git/setup мержит remote с локальными заметками и показывает конфликт пересечения', async () => {
  const branch = execSync('git branch --show-current', {
    cwd: notesDir,
    stdio: 'pipe',
    encoding: 'utf-8',
  }).trim();
  const remoteDir = path.join(tempRoot, 'setup-overlap-remote.git');
  const seedDir = path.join(tempRoot, 'setup-overlap-seed');
  const localPath = 'SetupOverlap.md';
  const remoteUrl = 'https://github.com/test/setup-overlap.git';

  execSync(`git init --bare "${remoteDir}"`, { cwd: tempRoot, stdio: 'pipe' });
  fs.mkdirSync(seedDir, { recursive: true });
  execSync('git init', { cwd: seedDir, stdio: 'pipe' });
  execSync('git config user.name "Remote Seed"', { cwd: seedDir, stdio: 'pipe' });
  execSync('git config user.email "seed@monos.local"', { cwd: seedDir, stdio: 'pipe' });
  fs.writeFileSync(path.join(seedDir, localPath), 'remote setup version\n', 'utf-8');
  execSync(`git add "${localPath}"`, { cwd: seedDir, stdio: 'pipe' });
  execSync('git commit -m "Remote setup seed"', { cwd: seedDir, stdio: 'pipe' });
  execSync(`git branch -M ${branch}`, { cwd: seedDir, stdio: 'pipe' });
  execSync(`git remote add origin "${remoteDir}"`, { cwd: seedDir, stdio: 'pipe' });
  execSync(`git push -u origin ${branch}`, { cwd: seedDir, stdio: 'pipe' });

  fs.writeFileSync(path.join(notesDir, localPath), 'local setup version\n', 'utf-8');
  execSync(`git config url."${remoteDir}".insteadOf "${remoteUrl}"`, { cwd: notesDir, stdio: 'pipe' });

  const setup = await requestJson(buildUrl('/api/git/setup'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: 'test-token',
      repo: 'test/setup-overlap',
      branch,
      device_name: 'Monos Setup Test',
    }),
  });
  assert.equal(setup.response.status, 200, JSON.stringify(setup.data));
  assert.equal(setup.data.conflicts, true);

  const status = await requestJson(buildUrl('/api/git/status'));
  assert.equal(status.response.status, 200);
  assert.equal(status.data.status, 'conflict');

  const conflicts = await requestJson(buildUrl('/api/git/conflicts'));
  const conflict = conflicts.data.find(item => item.path === localPath);
  assert.ok(conflict);
  assert.equal(conflict.ours, 'local setup version');
  assert.equal(conflict.theirs, 'remote setup version');

  const resolved = await requestJson(buildUrl('/api/git/conflicts/resolve'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolutions: { [localPath]: 'theirs' } }),
  });
  assert.equal(resolved.response.status, 200);
  assert.equal(fs.readFileSync(path.join(notesDir, localPath), 'utf-8'), 'remote setup version\n');

  const synced = await requestJson(buildUrl('/api/git/sync'), { method: 'POST' });
  assert.equal(synced.response.status, 200, JSON.stringify(synced.data));
  assert.equal(synced.data.conflicts, false);
});

apiTest('conflict resolver корректно выбирает remote-версию при local delete / remote modify', async () => {
  const conflictPath = 'DeleteModify.md';
  const baseFile = path.join(notesDir, conflictPath);
  const currentBranch = execSync('git branch --show-current', {
    cwd: notesDir,
    stdio: 'pipe',
    encoding: 'utf-8',
  }).trim();

  fs.writeFileSync(baseFile, 'delete modify base\n', 'utf-8');
  execSync(`git add "${conflictPath}"`, { cwd: notesDir, stdio: 'pipe' });
  execSync('git commit -m "Add delete modify base"', { cwd: notesDir, stdio: 'pipe' });

  execSync('git checkout -b delete-modify-branch', { cwd: notesDir, stdio: 'pipe' });
  fs.writeFileSync(baseFile, 'remote modified content\n', 'utf-8');
  execSync(`git add "${conflictPath}"`, { cwd: notesDir, stdio: 'pipe' });
  execSync('git commit -m "Modify delete conflict file"', { cwd: notesDir, stdio: 'pipe' });

  execSync(`git checkout ${currentBranch}`, { cwd: notesDir, stdio: 'pipe' });
  fs.rmSync(baseFile, { force: true });
  execSync(`git rm "${conflictPath}"`, { cwd: notesDir, stdio: 'pipe' });
  execSync('git commit -m "Delete conflict file"', { cwd: notesDir, stdio: 'pipe' });

  try {
    execSync('git merge delete-modify-branch', { cwd: notesDir, stdio: 'pipe' });
  } catch {}

  const conflicts = await requestJson(buildUrl('/api/git/conflicts'));
  const conflict = conflicts.data.find(item => item.path === conflictPath);
  assert.ok(conflict);
  assert.equal(conflict.oursExists, false);
  assert.equal(conflict.theirsExists, true);
  assert.equal(conflict.theirs, 'remote modified content');

  const resolved = await requestJson(buildUrl('/api/git/conflicts/resolve'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolutions: { [conflictPath]: 'theirs' } }),
  });
  assert.equal(resolved.response.status, 200);
  assert.equal(fs.readFileSync(baseFile, 'utf-8'), 'remote modified content\n');
});

apiTest('conflict resolver обрабатывает binary attachment conflicts', async () => {
  const conflictPath = '_attachments/binary-conflict.bin';
  const baseFile = path.join(notesDir, conflictPath);
  const currentBranch = execSync('git branch --show-current', {
    cwd: notesDir,
    stdio: 'pipe',
    encoding: 'utf-8',
  }).trim();
  const remoteBytes = Buffer.from([0, 1, 2, 3, 4, 5]);

  fs.mkdirSync(path.dirname(baseFile), { recursive: true });
  fs.writeFileSync(baseFile, Buffer.from([0, 0, 0]));
  execSync(`git add "${conflictPath}"`, { cwd: notesDir, stdio: 'pipe' });
  execSync('git commit -m "Add binary conflict base"', { cwd: notesDir, stdio: 'pipe' });

  execSync('git checkout -b binary-conflict-branch', { cwd: notesDir, stdio: 'pipe' });
  fs.writeFileSync(baseFile, remoteBytes);
  execSync(`git add "${conflictPath}"`, { cwd: notesDir, stdio: 'pipe' });
  execSync('git commit -m "Remote binary edit"', { cwd: notesDir, stdio: 'pipe' });

  execSync(`git checkout ${currentBranch}`, { cwd: notesDir, stdio: 'pipe' });
  fs.writeFileSync(baseFile, Buffer.from([0, 9, 9, 9]));
  execSync(`git add "${conflictPath}"`, { cwd: notesDir, stdio: 'pipe' });
  execSync('git commit -m "Local binary edit"', { cwd: notesDir, stdio: 'pipe' });

  try {
    execSync('git merge binary-conflict-branch', { cwd: notesDir, stdio: 'pipe' });
  } catch {}

  const conflicts = await requestJson(buildUrl('/api/git/conflicts'));
  const conflict = conflicts.data.find(item => item.path === conflictPath);
  assert.ok(conflict);
  assert.equal(conflict.binary, true);
  assert.equal(conflict.ours, '[Binary file]');
  assert.equal(conflict.theirs, '[Binary file]');

  const resolved = await requestJson(buildUrl('/api/git/conflicts/resolve'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolutions: { [conflictPath]: 'theirs' } }),
  });
  assert.equal(resolved.response.status, 200);
  assert.deepEqual(fs.readFileSync(baseFile), remoteBytes);
});

apiTest('conflict resolver закрывает rename/rename conflict выбором local rename', async () => {
  const basePath = 'RenameMe.md';
  const localPath = 'LocalRenamed.md';
  const remotePath = 'RemoteRenamed.md';
  const currentBranch = execSync('git branch --show-current', {
    cwd: notesDir,
    stdio: 'pipe',
    encoding: 'utf-8',
  }).trim();

  fs.writeFileSync(path.join(notesDir, basePath), 'rename base\n', 'utf-8');
  execSync(`git add "${basePath}"`, { cwd: notesDir, stdio: 'pipe' });
  execSync('git commit -m "Add rename conflict base"', { cwd: notesDir, stdio: 'pipe' });

  execSync('git checkout -b rename-conflict-branch', { cwd: notesDir, stdio: 'pipe' });
  execSync(`git mv "${basePath}" "${remotePath}"`, { cwd: notesDir, stdio: 'pipe' });
  execSync('git commit -m "Remote rename conflict file"', { cwd: notesDir, stdio: 'pipe' });

  execSync(`git checkout ${currentBranch}`, { cwd: notesDir, stdio: 'pipe' });
  execSync(`git mv "${basePath}" "${localPath}"`, { cwd: notesDir, stdio: 'pipe' });
  execSync('git commit -m "Local rename conflict file"', { cwd: notesDir, stdio: 'pipe' });

  try {
    execSync('git merge rename-conflict-branch', { cwd: notesDir, stdio: 'pipe' });
  } catch {}

  const conflicts = await requestJson(buildUrl('/api/git/conflicts'));
  assert.equal(conflicts.response.status, 200);
  assert.ok(conflicts.data.some(item => item.path === localPath));
  assert.ok(conflicts.data.some(item => item.path === remotePath));
  assert.ok(conflicts.data.some(item => item.path === basePath));

  const resolved = await requestJson(buildUrl('/api/git/conflicts/resolve'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resolutions: {
        [localPath]: 'ours',
        [remotePath]: 'ours',
        [basePath]: 'ours',
      },
    }),
  });

  assert.equal(resolved.response.status, 200);
  assert.equal(fs.existsSync(path.join(notesDir, localPath)), true);
  assert.equal(fs.existsSync(path.join(notesDir, remotePath)), false);
  assert.equal(fs.existsSync(path.join(notesDir, basePath)), false);
});

apiTest('падающая команда git не роняет сервер и не отдаёт невалидный код ответа', async () => {
  // Заведомо нерабочий адрес у ветки, за которой тянет pull: git завершится с
  // кодом 1 и приложит к ошибке поле `status`. Раньше оно уходило прямо в
  // res.status(), и Node падал с ERR_HTTP_INVALID_STATUS_CODE — вместе со всем
  // бэкендом, а не только с этим запросом.
  const before = execSync('git remote get-url origin', { cwd: notesDir, encoding: 'utf-8' }).trim();
  execSync('git remote set-url origin https://invalid.invalid/definitely-not-here.git', { cwd: notesDir, stdio: 'pipe' });

  try {
    const failed = await requestJson(buildUrl('/api/git/pull'), { method: 'POST' });
    assert.ok(
      failed.response.status >= 200 && failed.response.status < 600,
      `сервер ответил кодом ${failed.response.status}`,
    );
    assert.ok(failed.data?.detail, 'ответ должен объяснять, что произошло');

    // Главное: процесс жив и продолжает отвечать на остальные запросы.
    const alive = await requestJson(buildUrl('/api/git/status'));
    assert.equal(alive.response.status, 200);
  } finally {
    execSync(`git remote set-url origin "${before}"`, { cwd: notesDir, stdio: 'pipe' });
  }
});

apiTest('переименование заметки переписывает [[ссылки]] на неё; код и подписи сохраняются', async () => {
  const create = (body) => requestJson(buildUrl('/api/notes/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const target = await create({ title: 'Relink Target', category: '', tags: [], content: 'Цель.' });
  assert.equal(target.response.status, 200);
  const source = await create({
    title: 'Relink Source',
    category: '',
    tags: [],
    content: 'См. [[Relink Target]] и [[Relink Target|цель]].\n\n```\n[[Relink Target]]\n```\n',
  });
  assert.equal(source.response.status, 200);

  const renamed = await requestJson(buildUrl('/api/file/rename', { path: target.data.path }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_name: 'Relink Target 2.md' }),
  });
  assert.equal(renamed.response.status, 200);
  assert.equal(renamed.data.updatedLinks, 2);
  assert.deepEqual(renamed.data.updatedPaths, [source.data.path]);

  const after = fs.readFileSync(path.join(notesDir, 'Relink Source.md'), 'utf-8');
  assert.match(after, /См\. \[\[Relink Target 2\]\] и \[\[Relink Target 2\|цель\]\]\./);
  assert.match(after, /```\n\[\[Relink Target\]\]\n```/);
});

apiTest('не переписывает ссылки, пока то же имя есть у другой заметки', async () => {
  const create = (body) => requestJson(buildUrl('/api/notes/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const first = await create({ title: 'Twin Name', category: '', tags: [], content: 'Первая.' });
  const second = await create({ title: 'Twin Name', category: 'Twin Folder', tags: [], content: 'Вторая.' });
  const holder = await create({ title: 'Twin Holder', category: '', tags: [], content: 'Ведёт на [[Twin Name]].' });
  assert.equal(second.response.status, 200);
  assert.equal(holder.response.status, 200);

  const renamed = await requestJson(buildUrl('/api/file/rename', { path: first.data.path }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_name: 'Twin Moved.md' }),
  });
  assert.equal(renamed.response.status, 200);
  assert.equal(renamed.data.updatedLinks, 0);
  assert.match(fs.readFileSync(path.join(notesDir, 'Twin Holder.md'), 'utf-8'), /\[\[Twin Name\]\]/);
});

apiTest('переименование заметки с исходящими [[ссылками]] работает, обратные ссылки остаются верными', async () => {
  const create = (body) => requestJson(buildUrl('/api/notes/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const goal = await create({ title: 'Outgoing Goal', category: '', tags: [], content: 'Цель.' });
  const linker = await create({ title: 'Outgoing Linker', category: '', tags: [], content: 'Ведёт на [[Outgoing Goal]].' });
  assert.equal(goal.response.status, 200);
  assert.equal(linker.response.status, 200);

  const renamed = await requestJson(buildUrl('/api/file/rename', { path: linker.data.path }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_name: 'Outgoing Linker 2.md' }),
  });
  assert.equal(renamed.response.status, 200);
  assert.equal(renamed.data.updatedLinks, 0);

  const backlinks = await requestJson(buildUrl('/api/notes/backlinks', { path: goal.data.path }));
  assert.deepEqual(backlinks.data.map((note) => note.path), [renamed.data.path]);
});

apiTest('перенос не перезаписывает заметку с тем же именем в целевой папке', async () => {
  const create = (body) => requestJson(buildUrl('/api/notes/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await create({ title: 'Clash Note', category: 'Clash Folder', tags: [], content: 'Копия в папке.' });
  const moving = await create({ title: 'Clash Note', category: '', tags: [], content: 'Переносимая.' });
  const moved = await requestJson(buildUrl('/api/file/move', { source: moving.data.path, target: 'notes/Clash Folder' }), {
    method: 'POST',
  });
  assert.equal(moved.response.status, 409);
  assert.match(fs.readFileSync(path.join(notesDir, 'Clash Folder', 'Clash Note.md'), 'utf-8'), /Копия в папке\./);
  assert.match(fs.readFileSync(path.join(notesDir, 'Clash Note.md'), 'utf-8'), /Переносимая\./);
});

apiTest('заметка не в UTF-8 не портится при переписывании ссылок, а ответ называет её', async () => {
  const { indexFile } = await import('./indexing.js');
  const create = (body) => requestJson(buildUrl('/api/notes/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const legacyPath = path.join(notesDir, 'Legacy Link.md');
  const legacyBytes = Buffer.concat([
    Buffer.from([0xCF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2, 0x20]),
    Buffer.from('[[Legacy Goal]]\n', 'utf-8'),
  ]);
  fs.writeFileSync(legacyPath, legacyBytes);
  indexFile(legacyPath, legacyBytes.toString('utf-8'));
  const goal = await create({ title: 'Legacy Goal', category: '', tags: [], content: 'Цель.' });

  const renamed = await requestJson(buildUrl('/api/file/rename', { path: goal.data.path }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_name: 'Legacy Goal 2.md' }),
  });
  assert.equal(renamed.response.status, 200);
  assert.deepEqual(renamed.data.failedPaths, ['notes/Legacy Link.md']);
  assert.equal(fs.readFileSync(legacyPath).equals(legacyBytes), true);
});

apiTest('если одну заметку переписать нельзя, остальные переписываются, а ответ её называет', async () => {
  const create = (body) => requestJson(buildUrl('/api/notes/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const goal = await create({ title: 'Partial Goal', category: '', tags: [], content: 'Цель.' });
  const locked = await create({ title: 'Partial Locked', category: '', tags: [], content: 'Смотри [[Partial Goal]].' });
  await create({ title: 'Partial Open', category: '', tags: [], content: 'Тоже [[Partial Goal]].' });
  const lockedPath = path.join(notesDir, 'Partial Locked.md');
  fs.chmodSync(lockedPath, 0o444);
  try {
    const renamed = await requestJson(buildUrl('/api/file/rename', { path: goal.data.path }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_name: 'Partial Goal 2.md' }),
    });
    assert.equal(renamed.response.status, 200);
    assert.equal(renamed.data.updatedLinks, 1);
    assert.deepEqual(renamed.data.failedPaths, [locked.data.path]);
    assert.match(fs.readFileSync(path.join(notesDir, 'Partial Open.md'), 'utf-8'), /\[\[Partial Goal 2\]\]/);
    assert.match(fs.readFileSync(lockedPath, 'utf-8'), /\[\[Partial Goal\]\]/);
  } finally {
    fs.chmodSync(lockedPath, 0o644);
  }
});

apiTest('переименование вложения переписывает ссылки на картинку, код не трогает', async () => {
  const create = (body) => requestJson(buildUrl('/api/notes/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const holder = await create({
    title: 'Shot Holder',
    category: '',
    tags: [],
    content: 'Снимок: ![shot](_attachments/shot.png) и ![[shot.png]].\n\n`![shot](_attachments/shot.png)`\n',
  });
  assert.equal(holder.response.status, 200);
  fs.mkdirSync(path.join(notesDir, '_attachments'), { recursive: true });
  fs.writeFileSync(path.join(notesDir, '_attachments', 'shot.png'), Buffer.from([0x89, 0x50, 0x4E, 0x47]));

  const renamed = await requestJson(buildUrl('/api/attachments/rename'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notePath: holder.data.path, path: 'notes/_attachments/shot.png', newName: 'shot-renamed' }),
  });
  assert.equal(renamed.response.status, 200);
  assert.equal(renamed.data.updatedLinks, 2);
  assert.deepEqual(renamed.data.updatedPaths, [holder.data.path]);

  const after = fs.readFileSync(path.join(notesDir, 'Shot Holder.md'), 'utf-8');
  assert.match(after, /!\[shot\]\(_attachments\/shot-renamed\.png\) и !\[\[shot-renamed\.png\]\]/);
  assert.match(after, /`!\[shot\]\(_attachments\/shot\.png\)`/);
});

apiTest('ссылка, добавленная в заметку вне приложения, переписывается при переименовании цели', async () => {
  const create = (body) => requestJson(buildUrl('/api/notes/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const goal = await create({ title: 'External Goal', category: '', tags: [], content: 'Цель.' });
  const holder = await create({ title: 'External Holder', category: '', tags: [], content: 'Пусто.' });
  assert.equal(goal.response.status, 200);
  assert.equal(holder.response.status, 200);
  // Written straight to the file, so the index does not know the link yet.
  const holderFile = path.join(notesDir, 'External Holder.md');
  fs.writeFileSync(holderFile, fs.readFileSync(holderFile, 'utf-8').replace('Пусто.', 'Ссылка [[External Goal]].'), 'utf-8');

  const renamed = await requestJson(buildUrl('/api/file/rename', { path: goal.data.path }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_name: 'External Goal 2.md' }),
  });
  assert.equal(renamed.response.status, 200);
  assert.equal(renamed.data.updatedLinks, 1);
  assert.match(fs.readFileSync(holderFile, 'utf-8'), /\[\[External Goal 2\]\]/);
});

apiTest('сохранение в несуществующий путь без create=1 отвечает 404 и файл не создаёт', async () => {
  const response = await requestJson(buildUrl('/api/file', { path: 'notes/Gone Note.md' }), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'Вернулась.' }),
  });
  assert.equal(response.response.status, 404);
  assert.equal(fs.existsSync(path.join(notesDir, 'Gone Note.md')), false);
});

const postJson = (url, body) => requestJson(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

apiTest('алиас и ссылка на заголовок ведут на заметку: поиск по имени, обратные и битые ссылки', async () => {
  const folder = path.join(notesDir, 'Links');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'Espresso Guide.md'), '---\ntitle: Espresso Guide\naliases:\n  - Эспрессо\n---\n\n# Эспрессо\n\n## Ингредиенты\n', 'utf-8');
  fs.writeFileSync(path.join(folder, 'Reader.md'), 'Читать [[Эспрессо]], [[Espresso Guide#Ингредиенты]] и [[Нет такой]].\n', 'utf-8');
  indexAllFiles();

  const guide = 'notes/Links/Espresso Guide.md';
  const byAlias = await requestJson(buildUrl('/api/notes/resolve-link', { name: 'Эспрессо' }));
  assert.equal(byAlias.data.path, guide);
  const byHeading = await requestJson(buildUrl('/api/notes/resolve-link', { name: 'Espresso Guide#Ингредиенты' }));
  assert.equal(byHeading.data.path, guide);

  const backlinks = await requestJson(buildUrl('/api/notes/backlinks', { path: guide }));
  assert.deepEqual(backlinks.data.map((item) => item.path), ['notes/Links/Reader.md']);

  // Other tests leave their own broken links behind, so only this note's entries are checked.
  const broken = await requestJson(buildUrl('/api/notes/broken-links'));
  assert.deepEqual(broken.data.find((item) => item.target === 'Нет такой'), {
    target: 'Нет такой',
    sources: ['notes/Links/Reader.md'],
  });
  assert.equal(broken.data.some((item) => item.target === 'Эспрессо' || item.target.startsWith('Espresso Guide')), false);
});

apiTest('непривязанное упоминание связывается одним действием, граф показывает соседа', async () => {
  const folder = path.join(notesDir, 'Links');
  fs.writeFileSync(path.join(folder, 'Rowing.md'), 'Гребля.\n', 'utf-8');
  fs.writeFileSync(path.join(folder, 'Diary.md'), '# Дневник\n\nСегодня катался на rowing machine.\n', 'utf-8');
  indexAllFiles();

  const rowing = 'notes/Links/Rowing.md';
  const diary = 'notes/Links/Diary.md';
  const mentions = await requestJson(buildUrl('/api/notes/unlinked-mentions', { path: rowing }));
  assert.equal(mentions.data.find((item) => item.path === diary)?.phrase, 'Rowing');

  const linked = await postJson(buildUrl('/api/notes/link-mention', { path: diary }), { target: rowing });
  assert.equal(linked.response.status, 200);
  assert.deepEqual(linked.data.updatedPaths, [diary]);
  assert.deepEqual(linked.data.failedPaths, []);
  assert.match(fs.readFileSync(path.join(folder, 'Diary.md'), 'utf-8'), /катался на \[\[Rowing\|rowing\]\] machine/);

  const after = await requestJson(buildUrl('/api/notes/unlinked-mentions', { path: rowing }));
  assert.equal(after.data.some((item) => item.path === diary), false);

  const neighbors = await requestJson(buildUrl('/api/notes/neighbors', { path: diary }));
  assert.equal(neighbors.data.nodes.find((node) => node.center).path, diary);
  assert.ok(neighbors.data.nodes.some((node) => node.path === rowing));
  assert.ok(neighbors.data.edges.some((edge) => edge.from === diary && edge.to === rowing));

  const self = await postJson(buildUrl('/api/notes/link-mention', { path: diary }), { target: diary });
  assert.equal(self.response.status, 400);
});

apiTest('связи: каждый сосед говорит, как он связан с заметкой, а карта хранения отдаёт узлы и рёбра', async () => {
  const folder = path.join(notesDir, 'Map');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'Hub.md'), '# Hub\n\n[[Spoke Out]] и [[Spoke Both]] и [[Нет такой заметки]]\n', 'utf-8');
  fs.writeFileSync(path.join(folder, 'Spoke Out.md'), 'Только отсюда.\n', 'utf-8');
  fs.writeFileSync(path.join(folder, 'Spoke Both.md'), 'Назад: [[Hub]]\n', 'utf-8');
  fs.writeFileSync(path.join(folder, 'Spoke In.md'), 'Ссылка сюда: [[Hub]]\n', 'utf-8');
  fs.writeFileSync(path.join(folder, 'Alone Map.md'), 'Ни с кем не связана.\n', 'utf-8');
  indexAllFiles();

  const hub = 'notes/Map/Hub.md';
  const neighbors = await requestJson(buildUrl('/api/notes/neighbors', { path: hub }));
  const relation = Object.fromEntries(neighbors.data.nodes.map((node) => [node.title, node.relation]));
  assert.deepEqual(relation, { 'Hub': 'self', 'Spoke Both': 'both', 'Spoke In': 'in', 'Spoke Out': 'out' });
  assert.deepEqual(neighbors.data.missing, ['Нет такой заметки']);
  assert.deepEqual((await requestJson(buildUrl('/api/notes/neighbors', { path: 'notes/Map/Nope.md' }))).data, { nodes: [], edges: [], missing: [] });

  const graph = await requestJson(buildUrl('/api/graph'));
  const titles = graph.data.nodes.map((node) => node.title);
  for (const title of ['Hub', 'Spoke Out', 'Spoke Both', 'Spoke In']) assert.ok(titles.includes(title), title);
  assert.ok(!titles.includes('Alone Map'), 'a note without links is not on the map by default');
  assert.equal(graph.data.nodes.find((node) => node.title === 'Hub').degree, 3);
  const edgeOf = (a, b) => graph.data.edges.find((edge) => (edge.from === a && edge.to === b) || (edge.from === b && edge.to === a));
  assert.equal(edgeOf(hub, 'notes/Map/Spoke Both.md').both, true);
  assert.equal(edgeOf(hub, 'notes/Map/Spoke Out.md').both, false);
  assert.equal(graph.data.edges.every((edge) => titles.length && graph.data.nodes.some((n) => n.path === edge.from) && graph.data.nodes.some((n) => n.path === edge.to)), true);
  assert.ok(graph.data.orphanCount >= 1);
  assert.equal(graph.data.truncated, false);
  assert.ok(graph.data.noteCount >= graph.data.nodes.length);

  const withOrphans = await requestJson(buildUrl('/api/graph', { orphans: '1' }));
  assert.ok(withOrphans.data.nodes.some((node) => node.title === 'Alone Map' && node.degree === 0));
});

apiTest('обслуживание: сироты и давно не трогавшиеся заметки', async () => {
  const lonely = 'notes/Links/Lonely.md';
  fs.writeFileSync(path.join(notesDir, 'Links', 'Lonely.md'), 'Одна.\n', 'utf-8');
  indexAllFiles();
  getDb().prepare('UPDATE notes_index SET last_opened = ?, modified_at = ? WHERE path = ?')
    .run('2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z', lonely);

  const report = await requestJson(buildUrl('/api/notes/maintenance'));
  assert.equal(report.data.staleDays, 180);
  assert.ok(report.data.orphans.some((item) => item.path === lonely));
  assert.ok(report.data.stale.some((item) => item.path === lonely));
  // The notes that link to each other are connected, so they are not orphans.
  assert.equal(report.data.orphans.some((item) => item.path === 'notes/Links/Reader.md'), false);
});

apiTest('переименование заметки сохраняет заголовок в [[Name#Heading]] и подпись', async () => {
  const folder = path.join(notesDir, 'Links');
  fs.writeFileSync(path.join(folder, 'Heading Target.md'), '# Цель\n\n## Раздел\n', 'utf-8');
  fs.writeFileSync(path.join(folder, 'Heading Caller.md'), 'См. [[Heading Target#Раздел]] и [[Heading Target#Раздел|здесь]].\n', 'utf-8');
  indexAllFiles();

  const renamed = await postJson(buildUrl('/api/file/rename', { path: 'notes/Links/Heading Target.md' }), {
    new_name: 'Heading Target 2.md',
  });
  assert.equal(renamed.response.status, 200);
  assert.equal(renamed.data.updatedLinks, 2);
  assert.equal(
    fs.readFileSync(path.join(folder, 'Heading Caller.md'), 'utf-8'),
    'См. [[Heading Target 2#Раздел]] и [[Heading Target 2#Раздел|здесь]].\n',
  );
});

apiTest('сохранение тегов не трогает алиасы и не копит строки блочного списка', async () => {
  const file = path.join(notesDir, 'Links', 'Tagged.md');
  fs.writeFileSync(file, '---\ntitle: Tagged\ntags:\n  - one\n  - two\naliases:\n  - Метка\n---\n\nТекст.\n', 'utf-8');
  indexAllFiles();

  const saved = await requestJson(buildUrl('/api/file/metadata', { path: 'notes/Links/Tagged.md' }), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags: ['three'] }),
  });
  assert.equal(saved.response.status, 200);
  const text = fs.readFileSync(file, 'utf-8');
  assert.equal(text.includes('  - one'), false);
  assert.match(text, /aliases:\n {2}- Метка/);
  const resolved = await requestJson(buildUrl('/api/notes/resolve-link', { name: 'Метка' }));
  assert.equal(resolved.data.path, 'notes/Links/Tagged.md');
});

apiTest('свойства: запись в шапку, отказы, файл-инфо и таблица с prop:-фильтром и сортировкой', async () => {
  const folder = path.join(notesDir, 'Props');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'Plan A.md'), '---\ntitle: Plan A\nstatus: open\n---\n\nТекст.\n', 'utf-8');
  fs.writeFileSync(path.join(folder, 'Plan B.md'), '---\ntitle: Plan B\nstatus: done\npriority: 5\n---\n\nТекст.\n', 'utf-8');
  fs.writeFileSync(path.join(folder, 'Plan C.md'), '---\ntitle: Plan C\n---\n\nТекст.\n', 'utf-8');
  indexAllFiles();

  const setProperty = (notePath, body) => requestJson(buildUrl('/api/file/property', { path: notePath }), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const added = await setProperty('notes/Props/Plan A.md', { key: 'priority', type: 'number', value: 2 });
  assert.equal(added.response.status, 200);
  assert.deepEqual(added.data.properties.find((item) => item.key === 'priority'), { key: 'priority', type: 'number', value: 2 });
  assert.match(fs.readFileSync(path.join(folder, 'Plan A.md'), 'utf-8'), /title: Plan A\nstatus: open\npriority: 2\n---/);

  assert.equal((await setProperty('notes/Props/Plan A.md', { key: 'title', type: 'text', value: 'x' })).response.status, 400);
  assert.equal((await setProperty('notes/Props/Plan A.md', { key: 'due', type: 'date', value: '2026-02-30' })).response.status, 400);
  assert.equal((await setProperty('notes/Props/Nope.md', { key: 'x', type: 'text', value: 'y' })).response.status, 404);

  const info = await requestJson(buildUrl('/api/file-info', { path: 'notes/Props/Plan B.md' }));
  assert.deepEqual(info.data.properties.map((item) => item.key), ['status', 'priority']);

  const removed = await setProperty('notes/Props/Plan B.md', { key: 'status', remove: true });
  assert.equal(removed.response.status, 200);
  assert.equal(fs.readFileSync(path.join(folder, 'Plan B.md'), 'utf-8').includes('status:'), false);

  const filtered = await requestJson(buildUrl('/api/notes/table', { query: 'prop:priority>=2', sort: 'priority', dir: 'desc' }));
  assert.deepEqual(filtered.data.rows.map((row) => row.title), ['Plan B', 'Plan A']);
  assert.ok(filtered.data.keys.find((item) => item.key === 'priority').count >= 2);

  const ascending = await requestJson(buildUrl('/api/notes/table', { query: 'prop:priority', sort: 'priority', dir: 'asc' }));
  assert.deepEqual(ascending.data.rows.map((row) => row.title), ['Plan A', 'Plan B']);

  const byStatus = await requestJson(buildUrl('/api/notes/table', { query: 'prop:status' }));
  assert.deepEqual(byStatus.data.rows.map((row) => row.title), ['Plan A']);
});

apiTest('ссылка с папкой (как в Obsidian) и ссылка на заголовок ведут на ту же заметку', async () => {
  const vault = path.join(notesDir, 'Vault', 'Projects');
  fs.mkdirSync(vault, { recursive: true });
  fs.writeFileSync(path.join(vault, 'Plan.md'), '# План\n\n## Раздел\n', 'utf-8');
  fs.writeFileSync(path.join(notesDir, 'Vault', 'Reader.md'), 'См. [[Vault/Projects/Plan]] и [[Plan#Раздел]].\n', 'utf-8');
  indexAllFiles();

  const plan = 'notes/Vault/Projects/Plan.md';
  const byFolder = await requestJson(buildUrl('/api/notes/resolve-link', { name: 'Vault/Projects/Plan' }));
  assert.equal(byFolder.data.path, plan);

  const backlinks = await requestJson(buildUrl('/api/notes/backlinks', { path: plan }));
  assert.deepEqual(backlinks.data.map((item) => item.path), ['notes/Vault/Reader.md']);

  const broken = await requestJson(buildUrl('/api/notes/broken-links'));
  assert.equal(broken.data.some((item) => item.target.startsWith('Vault/Projects/Plan')), false);
});

apiTest('PDF прикрепляется как есть и отдаётся как application/pdf; текст по-прежнему не принимается', async () => {
  const pdfBytes = Buffer.from('%PDF-1.4\n%монос\n%%EOF\n');
  const form = new FormData();
  form.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'Spec.pdf');
  const upload = await requestJson(buildUrl('/api/attachments', { notePath: 'notes/Topic/Alpha.md' }), {
    method: 'POST',
    body: form,
  });
  assert.equal(upload.response.status, 200);
  assert.equal(upload.data.name, 'Spec.pdf');
  assert.equal(upload.data.relativePath, '_attachments/Spec.pdf');
  assert.equal(fs.readFileSync(path.join(notesDir, 'Topic', '_attachments', 'Spec.pdf')).equals(pdfBytes), true);

  const raw = await realFetch(buildUrl('/api/attachments/raw', { path: upload.data.path }));
  assert.equal(raw.status, 200);
  assert.equal(raw.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await raw.arrayBuffer()).equals(pdfBytes), true);

  const textForm = new FormData();
  textForm.append('file', new Blob(['plain'], { type: 'text/plain' }), 'note.txt');
  const rejected = await requestJson(buildUrl('/api/attachments', { notePath: 'notes/Topic/Alpha.md' }), {
    method: 'POST',
    body: textForm,
  });
  assert.equal(rejected.response.status, 400);
});

const SITE_FOLDER = 'monos-site';

apiTest('публикация: сайт пишется в свою папку, чужую не трогает, внутри заметок ничего не создаёт', async () => {
  const folder = path.join(notesDir, 'Publish');
  fs.mkdirSync(path.join(folder, '_attachments'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'Target.md'), 'Цель.\n', 'utf-8');
  fs.writeFileSync(path.join(folder, 'Guide.md'), 'См. [[Target]] и [[Нет такой]].\n\n<script>bad()</script>\n\n![[Spec.pdf]]\n\n> [!tip] Совет\n> текст\n', 'utf-8');
  fs.writeFileSync(path.join(folder, '_attachments', 'Spec.pdf'), Buffer.from('%PDF-1.4\n%%EOF\n'));
  indexAllFiles();

  const siteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-site-'));
  const published = await postJson(buildUrl('/api/publish'), { target: siteRoot, folder: 'Publish' });
  assert.equal(published.response.status, 200);
  assert.equal(published.data.pages, 2);
  assert.equal(published.data.assets, 1);

  const site = path.join(siteRoot, 'monos-site');
  assert.ok(fs.existsSync(path.join(site, 'index.html')));
  const guide = fs.readFileSync(path.join(site, 'pages', 'Publish', 'Guide.html'), 'utf-8');
  assert.ok(guide.includes('<a href="Target.html">Target</a>'));
  assert.ok(guide.includes('&lt;script&gt;'));
  assert.equal(guide.includes('<script>bad()'), false);
  assert.ok(guide.includes('../../assets/Publish/_attachments/Spec.pdf'));
  assert.ok(guide.includes('callout-tip'));
  assert.ok(fs.existsSync(path.join(site, 'assets', 'Publish', '_attachments', 'Spec.pdf')));
  assert.equal(fs.existsSync(path.join(notesDir, SITE_FOLDER)), false);

  // Refused: a folder inside the notes, and a `monos-site` folder the app did not make.
  const inside = await postJson(buildUrl('/api/publish'), { target: folder, folder: '' });
  assert.equal(inside.response.status, 403);
  const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-foreign-'));
  fs.mkdirSync(path.join(foreign, SITE_FOLDER));
  fs.writeFileSync(path.join(foreign, SITE_FOLDER, 'keep.txt'), 'keep', 'utf-8');
  const refused = await postJson(buildUrl('/api/publish'), { target: foreign, folder: '' });
  assert.equal(refused.response.status, 409);
  assert.equal(fs.readFileSync(path.join(foreign, SITE_FOLDER, 'keep.txt'), 'utf-8'), 'keep');

  // Publishing again replaces the site the app made.
  const again = await postJson(buildUrl('/api/publish'), { target: siteRoot, folder: 'Publish' });
  assert.equal(again.response.status, 200);
});

apiTest('шифрование: без парольной фразы заметка не читается, поиск её не видит, сохранение шифруется заново', async () => {
  const folder = path.join(notesDir, 'Locked');
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'Diary.md');
  fs.writeFileSync(file, '---\ntitle: Дневник\n---\n\nСекретная запись про Ариадну.\n', 'utf-8');
  indexAllFiles();
  const rel = 'notes/Locked/Diary.md';
  const at = (route) => buildUrl(route, { path: rel });

  const sealed = await postJson(at('/api/file/lock'), { passphrase: 'фраза-один' });
  assert.equal(sealed.response.status, 200);
  assert.equal(fs.readFileSync(file, 'utf-8').includes('Ариадну'), false);
  assert.equal(fs.readFileSync(file, 'utf-8').includes('monos-locked: true'), true);

  const info = await requestJson(at('/api/file-info'));
  assert.equal(info.data.locked, true);
  assert.equal(info.data.unlocked, true);

  const search = await postJson(buildUrl('/api/search'), { query: 'Ариадну', search_content: true });
  assert.equal(search.data.some((hit) => hit.path === rel), false);

  // Open for this session until it is closed again.
  assert.equal((await postJson(at('/api/file/relock'), {})).response.status, 200);
  assert.equal((await requestJson(at('/api/file'))).response.status, 423);

  assert.equal((await postJson(at('/api/file/unlock'), { passphrase: 'не та' })).response.status, 403);
  assert.equal((await postJson(at('/api/file/unlock'), { passphrase: 'фраза-один' })).response.status, 200);
  assert.match((await requestJson(at('/api/file'))).data.content, /Ариадну/);

  // A save while unlocked is sealed again, never written in plain text.
  const saved = await requestJson(at('/api/file'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '---\ntitle: Дневник\n---\n\nНовая запись.\n' }),
  });
  assert.equal(saved.response.status, 200);
  assert.equal(fs.readFileSync(file, 'utf-8').includes('Новая запись'), false);

  // Removing the lock writes the text back as plain text.
  assert.equal((await postJson(at('/api/file/unprotect'), { passphrase: 'фраза-один' })).response.status, 200);
  assert.match(fs.readFileSync(file, 'utf-8'), /Новая запись/);
  assert.equal((await requestJson(at('/api/file-info'))).data.locked, false);
});

apiTest('print: YAML-шапка не попадает в HTML и PDF, а экспорт с вложениями уходит папкой в zip', async () => {
  const dir = path.join(notesDir, 'Export');
  fs.mkdirSync(path.join(dir, '_attachments'), { recursive: true });
  fs.writeFileSync(path.join(dir, '_attachments', 'pic.png'), 'png');
  fs.writeFileSync(path.join(dir, 'Doc.md'), '---\ntitle: "Doc"\ntags: ["secret-tag"]\n---\n\n# Heading\n\n![](_attachments/pic.png)\n', 'utf-8');

  const html = (await requestJson(buildUrl('/api/print/note', { path: 'notes/Export/Doc.md' }))).data;
  assert.match(html, /Heading/);
  assert.doesNotMatch(html, /secret-tag/);

  const source = fs.readFileSync(path.join(dir, 'Doc.md'), 'utf-8');
  const post = (body) => realFetch(buildUrl('/api/print/bundle'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const bundle = await post({ path: 'notes/Export/Doc.md', fileName: 'Doc.md', content: source });
  assert.equal(bundle.status, 200);
  const entries = new AdmZip(Buffer.from(await bundle.arrayBuffer())).getEntries().map((entry) => entry.entryName).sort();
  assert.deepEqual(entries, ['Doc/Doc.md', 'Doc/_attachments/pic.png']);

  // The text export has no links left, so the Markdown is passed as the source of the links.
  assert.equal((await post({ path: 'notes/Export/Doc.md', fileName: 'Doc.txt', content: 'Heading', source })).status, 200);
  assert.equal((await post({ path: 'notes/Export/Doc.md', fileName: 'Doc.txt', content: 'Heading' })).status, 204);
});
