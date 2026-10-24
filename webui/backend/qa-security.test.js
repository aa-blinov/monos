import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bootVault, lanAddress, lanToken } from './support/vault.js';

// B1, B2, B12, B13, B17, B21: what a request may touch, what it may not, and how a refusal looks.
const vault = await bootVault({
  lan: true,
  files: { 'Welcome.md': '# Welcome\n', 'Topic/Alpha.md': '# Alpha\n' },
});
after(() => vault.stop());

const q = (relative) => ({ query: { path: relative } });
const json = (value) => JSON.stringify(value);
const bearer = { authorization: `Bearer ${lanToken}` };
const lanTest = lanAddress ? test : test.skip;
const noInternals = (response) => {
  assert.equal(typeof response.data?.code, 'string', `an error body has a code: ${JSON.stringify(response.data)}`);
  assert.equal(typeof response.data?.detail, 'string');
  const text = JSON.stringify(response.data);
  assert.ok(!text.includes(vault.root) && !text.includes('/private/') && !/\bat \S+\.js:\d+/.test(text), `no path or stack in ${text}`);
};

lanTest('B1: another device on the network cannot read the clipper token, so it cannot write notes', async () => {
  const denied = await vault.get('/api/clip/token', { host: lanAddress });
  assert.equal(denied.status, 403);
  assert.equal(denied.data.code, 'this_computer_only');
  const withBearer = await vault.get('/api/clip/token', { host: lanAddress, headers: bearer });
  assert.equal(withBearer.status, 403, 'not even with the access token');
  const guess = await vault.post('/api/clip/notes', { host: lanAddress, headers: { authorization: 'Bearer ' + 'x'.repeat(64) }, body: { title: 'Intruder', content: 'x' } });
  assert.equal(guess.status, 401);
  assert.equal(vault.exists('intruder.md'), false);
});

test('B1: the clipper still works from this computer', async () => {
  const token = (await vault.get('/api/clip/token')).data.token;
  assert.ok(token && token.length >= 32);
  const clipped = await vault.post('/api/clip/notes', { headers: { authorization: `Bearer ${token}` }, body: { title: 'From the page', content: 'text' } });
  assert.equal(clipped.status, 201);
});

test('B2: no file route reaches .git or the app folders: write, delete, rename and move are refused', async () => {
  fs.mkdirSync(path.join(vault.notesDir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(vault.notesDir, '.git', 'config'), '[core]\n');
  const write = await vault.post('/api/file', { query: { path: 'notes/.git/config', create: '1' }, body: { content: '[core]\n\tfsmonitor = touch /tmp/pwned\n' } });
  assert.equal(write.status, 403);
  assert.equal(write.data.code, 'hidden_path');
  assert.equal(fs.readFileSync(path.join(vault.notesDir, '.git', 'config'), 'utf-8'), '[core]\n');

  const remove = await vault.del('/api/file', q('notes/.git'));
  assert.equal(remove.status, 403);
  assert.ok(fs.existsSync(path.join(vault.notesDir, '.git')));
  assert.equal((await vault.del('/api/file', { query: { path: 'notes/.git/config', permanent: '1' } })).status, 403);

  for (const hidden of ['notes/.monos', 'notes/.trash', 'notes/.git/hooks']) {
    assert.equal((await vault.post('/api/file/rename', { ...q(hidden), body: { new_name: 'x' } })).status, 403, `rename ${hidden}`);
    assert.equal((await vault.get('/api/file', q(`${hidden}/x.md`))).status, 403, `read ${hidden}`);
  }
  assert.equal((await vault.post('/api/file/move', { query: { source: 'notes/Welcome.md', target: 'notes/.git' } })).status, 403);
  assert.equal((await vault.post('/api/file/move', { query: { source: 'notes/.git', target: 'notes/Topic' } })).status, 403);
  assert.equal((await vault.post('/api/directory/create', q('notes/.hooks/x'))).status, 403);
  assert.equal((await vault.post('/api/notes/create', { body: { title: 'x', category: '.git/hooks' } })).status, 403);
  assert.ok(!fs.existsSync(path.join(vault.notesDir, '.hooks')));
});

test('B12: a file created through the note route is a note with a name every system can make', async () => {
  const bad = ['a:b?.md', 'CON.md', 'evil.exe', 'noext', 'evil.html'];
  for (const name of bad) {
    const response = await vault.post('/api/file', { query: { path: `notes/${name}`, create: '1' }, body: { content: 'x' } });
    assert.equal(response.status, 400, `${name} -> ${response.status}`);
    noInternals(response);
    assert.equal(fs.existsSync(path.join(vault.notesDir, name)), false, `${name} was not written`);
  }
  assert.equal((await vault.post('/api/file', { query: { path: 'notes/.hidden.md', create: '1' }, body: { content: 'x' } })).status, 403, 'a hidden name is not a place for a note');
  assert.equal((await vault.post('/api/file', { query: { path: 'notes/Fine name.md', create: '1' }, body: { content: 'ok' } })).status, 200);
  assert.equal((await vault.post('/api/file', { query: { path: 'notes/Plain.txt', create: '1' }, body: { content: 'ok' } })).status, 200);
});

test('B12: every segment of a folder or a category is checked, not only the last; rename keeps its rules', async () => {
  for (const folder of ['a:b/con', 'a./b', 'ok/CON', 'x/y?/z', 'dir /x']) {
    assert.equal((await vault.post('/api/directory/create', q(folder))).status, 400, `directory ${folder}`);
    assert.equal((await vault.post('/api/notes/create', { body: { title: 'Note', category: folder } })).status, 400, `category ${folder}`);
  }
  assert.equal(fs.existsSync(path.join(vault.notesDir, 'a:b')), false);
  assert.equal(fs.existsSync(path.join(vault.notesDir, 'a.')), false);
  for (const name of ['.monos', '.git', 'x?y.md', 'con.md']) {
    assert.equal((await vault.post('/api/file/rename', { ...q('notes/Welcome.md'), body: { new_name: name } })).status, 400, `rename to ${name}`);
  }
  assert.equal((await vault.post('/api/file/rename', { ...q('notes/Welcome.md'), body: { new_name: 'Welcome.exe' } })).status, 400, 'a note stays a note');
  assert.ok(vault.exists('Welcome.md'));
  // Hidden names are forbidden for notes (the export, the indexer and the folder walks would never list them again).
  const hiddenNote = await vault.post('/api/notes/create', { body: { title: '.hidden' } });
  assert.equal(hiddenNote.status, 400);
  assert.equal(hiddenNote.data.code, 'name_hidden');
});

lanTest('B13: the GitHub token is for this computer only; preferences are plain values; a device cannot touch secrets', async () => {
  const saved = await vault.post('/api/settings', { body: { git_token: 'ghp_secret_token_value', boardColumns: '3', width: 640, tabsToSpaces: true } });
  assert.equal(saved.status, 200);
  const local = (await vault.get('/api/settings')).data;
  assert.equal(local.git_token, 'ghp_secret_token_value', 'this computer still reads it');
  const lan = await vault.get('/api/settings', { host: lanAddress, headers: bearer });
  assert.equal(lan.status, 200);
  assert.equal(lan.data.git_token, undefined, 'another device never receives the token');
  assert.equal(lan.data.git_token_protected, undefined);
  assert.ok(!JSON.stringify(lan.data).includes('ghp_secret'));
  assert.equal(lan.data.boardColumns, '3', 'a text that looks like a number comes back as the text');
  assert.equal(lan.data.width, 640);
  assert.equal(lan.data.tabsToSpaces, true);

  const overwrite = await vault.post('/api/settings', { host: lanAddress, headers: bearer, body: { git_token: 'attacker', sortMode: 'title' } });
  assert.equal(overwrite.status, 200);
  assert.deepEqual(overwrite.data.ignored, ['git_token']);
  assert.equal((await vault.get('/api/settings')).data.git_token, 'ghp_secret_token_value', 'the stored token was not replaced');
  assert.equal((await vault.get('/api/settings', { host: lanAddress, headers: bearer })).data.sortMode, 'title', 'an ordinary preference from a device is stored');
});

test('B13: settings reject objects, long texts, odd names and a body that is not an object', async () => {
  for (const body of [{ prefs: { a: 1 } }, { list: [1, 2] }, { big: 'x'.repeat(9000) }, { 'bad name!': 1 }, { '../x': 1 }]) {
    const response = await vault.post('/api/settings', { body });
    assert.equal(response.status, 400, json(body).slice(0, 60));
    assert.equal(response.data.code, 'invalid_setting');
  }
  assert.equal((await vault.post('/api/settings', { raw: '[1,2]' })).status, 400);
  assert.equal((await vault.post('/api/settings', { body: { a: null, b: false, c: 1.5, d: 'text' } })).status, 200);
});

lanTest('B13: publishing writes into a folder of this computer, so another device cannot name one', async () => {
  const target = fs.mkdtempSync(path.join(path.dirname(vault.root), 'publish-target-'));
  try {
    const denied = await vault.post('/api/publish', { host: lanAddress, headers: bearer, body: { target } });
    assert.equal(denied.status, 403);
    assert.equal(fs.existsSync(path.join(target, 'monos-site')), false, 'nothing was written');
    assert.equal((await vault.post('/api/publish', { body: { target } })).status, 200);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('B17: another spelling of a path is the same path for every route', async () => {
  for (const spelling of ['notes/./Welcome.md', 'notes/Welcome.md/', './notes/Welcome.md', 'notes//Welcome.md', 'notes/Topic/../Welcome.md']) {
    const read = await vault.get('/api/file', q(spelling));
    assert.equal(read.status, 200, spelling);
    assert.match(read.data.content, /Welcome/);
  }
  assert.equal((await vault.get('/api/file', q('notes/../outside.md'))).status, 403);
  assert.equal((await vault.get('/api/file', q('../etc/passwd'))).status, 403);
  assert.equal((await vault.get('/api/file', q('/etc/passwd'))).status, 403);
});

test('B21: bad input is a 400 with a code, never a 500 with an internal message', async () => {
  const checks = [
    ['search without a body', () => vault.post('/api/search'), [200]],
    ['metadata without a body', () => vault.put('/api/file/metadata', q('notes/Welcome.md')), [200, 400]],
    ['create with tags as text', () => vault.post('/api/notes/create', { body: { title: 'T1', tags: 'abc' } }), [400]],
    ['create with an object title', () => vault.post('/api/notes/create', { body: { title: { a: 1 } } }), [400]],
    ['create with an array of objects as tags', () => vault.post('/api/notes/create', { body: { title: 'T2', tags: [{}] } }), [400]],
    ['icon as an object', () => vault.post('/api/directory/icon', { ...q('notes/Topic'), body: { icon: { a: 1 } } }), [400]],
    ['icon with markup', () => vault.post('/api/directory/icon', { ...q('notes/Topic'), body: { icon: '<img onerror=alert(1)>' } }), [400]],
    ['colour with a url()', () => vault.post('/api/directory/icon', { ...q('notes/Topic'), body: { color: 'url(javascript:1)' } }), [400]],
    ['icon on a path outside', () => vault.post('/api/directory/icon', { ...q('../../etc'), body: { icon: 'star' } }), [403]],
    ['base_version that is a number', () => vault.post('/api/file', { ...q('notes/Welcome.md'), body: { content: 'x', base_version: 5 } }), [400]],
    ['metadata with title as an object', () => vault.put('/api/file/metadata', { ...q('notes/Welcome.md'), body: { title: { a: 1 } } }), [400]],
    ['content that is not text', () => vault.post('/api/file', { ...q('notes/Welcome.md'), body: { content: { a: 1 } } }), [400]],
    ['a 300-char name', () => vault.post('/api/file', { query: { path: `notes/${'a'.repeat(300)}.md`, create: '1' }, body: { content: 'x' } }), [400]],
    ['print of a missing note', () => vault.get('/api/print/note', q('notes/CON.md')), [404]],
    ['an address under /api that does not exist', () => vault.get('/api/no/such/route'), [404]],
    ['a broken JSON body', () => vault.post('/api/search', { raw: '{"query":' }), [400]],
  ];
  for (const [label, run, statuses] of checks) {
    const response = await run();
    assert.ok(statuses.includes(response.status), `${label}: ${response.status} ${JSON.stringify(response.data).slice(0, 120)}`);
    if (response.status >= 400) noInternals(response);
  }
  assert.equal(JSON.stringify((await vault.get('/api/file', q('notes/Welcome.md'))).data).includes('[object Object]'), false);
  assert.equal(vault.exists('[object Object].md'), false, 'a title that is not text is never turned into a name');
  assert.match(vault.read('Welcome.md'), /Welcome/, 'a refused save left the note as it was');
});

test('B21: an oversized or broken upload is 413 or 400, and says nothing of the disk', async () => {
  const big = new FormData();
  big.append('file', new Blob([Buffer.alloc(16 * 1024 * 1024, 1)], { type: 'image/png' }), 'big.png');
  const tooBig = await fetch(`${vault.base}/api/attachments?notePath=notes/Welcome.md`, { method: 'POST', body: big });
  assert.equal(tooBig.status, 413);
  assert.equal((await tooBig.json()).code, 'too_large');

  const broken = await fetch(`${vault.base}/api/attachments?notePath=notes/Welcome.md`, {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=zzz' },
    body: '--zzz\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\nabc',
  });
  assert.equal(broken.status, 400);
  const body = await broken.json();
  assert.equal(typeof body.code, 'string');
  assert.ok(!JSON.stringify(body).includes(vault.root));
});

test('B21: the attachment route serves attachments only, by the file the path really names', async () => {
  vault.write('Topic/_attachments/pic.png', 'png');
  const served = await vault.get('/api/attachments/raw', q('notes/Topic/_attachments/pic.png'));
  assert.equal(served.status, 200);
  const sneaky = await vault.get('/api/attachments/raw', q('notes/_attachments/../Welcome.md'));
  assert.equal(sneaky.status, 403);
  assert.equal(sneaky.data.code, 'not_an_attachment');
  assert.ok(!String(sneaky.text).includes('# Welcome'));
});

test('B14: every error body carries the code, and a missing note is not found, whatever the route', async () => {
  const response = await vault.get('/api/file', q('notes/Nope.md'));
  assert.equal(response.status, 404);
  assert.equal(response.data.code, 'not_found');
  noInternals(response);
});
