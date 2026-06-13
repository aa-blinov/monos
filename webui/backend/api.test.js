import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { EventEmitter } from 'node:events';
import fs from 'fs';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import os from 'os';
import path from 'path';

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
const { buildGithubRemoteUrl } = await import('./routes/git.js');
const { getDb } = await import('./database.js');
const { indexAllFiles, migrateCachedMetadataToFrontmatter } = await import('./indexing.js');

let baseUrl = '';

function apiTest(name, fn) {
  test(name, { concurrency: false }, fn);
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
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

async function withMockedHttpsGet(mockImpl, fn) {
  const originalGet = https.get;
  https.get = mockImpl;
  syncBuiltinESMExports();

  try {
    await fn();
  } finally {
    https.get = originalGet;
    syncBuiltinESMExports();
  }
}

function createJsonGetMock(routeMap) {
  return (options, callback) => {
    const req = new EventEmitter();

    process.nextTick(() => {
      const res = new EventEmitter();
      callback(res);

      const body = routeMap[options.path];
      if (body instanceof Error) {
        req.emit('error', body);
        return;
      }

      res.emit('data', JSON.stringify(body ?? []));
      res.emit('end');
    });

    return req;
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
  const allowed = await fetch(buildUrl('/health'), {
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

  const afterSave = getDb().prepare('SELECT last_opened FROM notes_index WHERE path = ?')
    .get('notes/Topic/Alpha.md');
  assert.equal(afterSave.last_opened, fixedOpenedAt);

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

  const raw = await fetch(buildUrl('/api/attachments/raw', { path: upload.data.path }));
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
  assert.ok(backlinks.data.some((entry) => (
    entry.path === 'notes/Work/Ideas/Delta.md' && entry.type === 'mention'
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
  await withMockedHttpsGet(createJsonGetMock({
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
  await withMockedHttpsGet(createJsonGetMock({
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

apiTest('POST /api/format нормализует markdown-файлы на диске', async () => {
  const formatted = await requestJson(buildUrl('/api/format'), { method: 'POST' });

  assert.equal(formatted.response.status, 200);
  assert.match(formatted.data.message, /Formatted/);

  const file = fs.readFileSync(path.join(notesDir, 'FormatMe.md'), 'utf-8');
  assert.equal(file, 'Line with spaces\n\nSecond line\n');
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

  const deleted = await requestJson(buildUrl('/api/file', { path: 'notes/NewDir/Sub/Temp Renamed.md' }), {
    method: 'DELETE',
  });
  assert.equal(deleted.response.status, 200);

  const missing = await requestJson(buildUrl('/api/file-info', { path: 'notes/NewDir/Sub/Temp Renamed.md' }));
  assert.equal(missing.response.status, 404);
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

apiTest('GET /api/git/conflicts и POST /api/git/conflicts/resolve работают с merge-конфликтом', async () => {
  const baseFile = path.join(notesDir, 'Conflict.md');
  const currentBranch = execSync('git branch --show-current', {
    cwd: notesDir,
    stdio: 'pipe',
    encoding: 'utf-8',
  }).trim();

  fs.writeFileSync(baseFile, 'base\n', 'utf-8');
  execSync('git add Conflict.md', { cwd: notesDir, stdio: 'pipe' });
  execSync('git commit -m "Add conflict base"', { cwd: notesDir, stdio: 'pipe' });

  execSync('git checkout -b conflict-branch', { cwd: notesDir, stdio: 'pipe' });
  fs.writeFileSync(baseFile, 'branch version\n', 'utf-8');
  execSync('git add Conflict.md', { cwd: notesDir, stdio: 'pipe' });
  execSync('git commit -m "Branch change"', { cwd: notesDir, stdio: 'pipe' });

  execSync(`git checkout ${currentBranch}`, { cwd: notesDir, stdio: 'pipe' });
  fs.writeFileSync(baseFile, 'main version\n', 'utf-8');
  execSync('git add Conflict.md', { cwd: notesDir, stdio: 'pipe' });
  execSync('git commit -m "Main change"', { cwd: notesDir, stdio: 'pipe' });

  try {
    execSync('git merge conflict-branch', { cwd: notesDir, stdio: 'pipe' });
  } catch {}

  const conflicts = await requestJson(buildUrl('/api/git/conflicts'));
  assert.equal(conflicts.response.status, 200);
  assert.ok(Array.isArray(conflicts.data));
  assert.ok(conflicts.data.some(c => c.path === 'Conflict.md'));
  assert.ok(conflicts.data[0].ours !== undefined);
  assert.ok(conflicts.data[0].theirs !== undefined);

  fs.writeFileSync(baseFile, 'resolved\n', 'utf-8');
  const resolved = await requestJson(buildUrl('/api/git/conflicts/resolve'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: ['Conflict.md'] }),
  });

  assert.equal(resolved.response.status, 200);

  const afterResolve = await requestJson(buildUrl('/api/git/conflicts'));
  assert.equal(afterResolve.response.status, 200);
  assert.deepEqual(afterResolve.data, []);
});
