import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-clip-'));
const notesDir = path.join(tempRoot, 'notes');
fs.mkdirSync(notesDir, { recursive: true });

process.env.NOTES_ROOT = tempRoot;

const { startServer, stopServer } = await import('./index.js');

let base;
let appOrigin;
let token;

test.before(async () => {
  const started = await startServer({ port: 0 });
  base = appOrigin = `http://127.0.0.1:${started.port}`;
  // electron/main.cjs sets this after importing the backend, because the port is
  // only known once the server binds. Mirror it here so the clipper sees the
  // same origin the packaged app does.
  process.env.ALLOWED_ORIGINS = appOrigin;
  const res = await fetch(`${base}/api/clip/token`);
  token = (await res.json()).token;
});

test.after(async () => {
  await stopServer();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

const post = (body, headers = {}) =>
  fetch(`${base}/api/clip/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

test('токен создаётся и лежит с правами 0600', () => {
  assert.match(token, /^[0-9a-f]{64}$/);
  const file = path.join(tempRoot, '.data', 'clipper-token');
  assert.ok(fs.existsSync(file));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'token file must not be world-readable');
});

test('запись без токена отклоняется и не создаёт файл', async () => {
  const before = fs.readdirSync(notesDir).length;
  const res = await post({ title: 'No token', content: 'nope' });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.detail, /token/i);
  // the error must be JSON, never an Express HTML stack trace
  assert.equal(typeof body.detail, 'string');
  assert.equal(fs.readdirSync(notesDir).length, before);
});

test('запись с неверным токеном отклоняется', async () => {
  const res = await post(
    { title: 'Bad token', content: 'nope' },
    { 'X-Monos-Clip-Token': 'f'.repeat(64) },
  );
  assert.equal(res.status, 401);
});

test('запись с чужим Origin отклоняется даже при верном токене', async () => {
  // A different loopback port is still a different origin: the check is on the
  // full origin, not merely on "is it local".
  for (const origin of ['https://evil.example', 'http://127.0.0.1:1']) {
    const res = await post(
      { title: 'Evil', content: 'nope' },
      { Origin: origin, 'X-Monos-Clip-Token': token },
    );
    assert.equal(res.status, 403, `${origin} must be rejected`);
  }
});

test('Origin приложения и расширения принимаются, запись создаёт заметку', async () => {
  for (const origin of [appOrigin, 'chrome-extension://abcdefghijklmnopabcdefghijklmnop']) {
    const res = await post(
      {
        title: 'Clipped from the web',
        content: 'the body of the note',
        sourceUrl: 'https://example.com/post',
        selectedText: ['the selected text'],
      },
      { Origin: origin, 'X-Monos-Clip-Token': token },
    );
    assert.equal(res.status, 201, `origin ${origin} should be accepted`);
  }

  const all = fs.readdirSync(notesDir);
  const files = all.filter((f) => f.startsWith('clipped-from-the-web'));
  assert.ok(files.length >= 2, `each accepted origin should create its own note, got: ${JSON.stringify(all)}`);

  const written = fs.readFileSync(path.join(notesDir, files[0]), 'utf-8');
  assert.match(written, /^---\n/);
  assert.match(written, /title: "Clipped from the web"/);
  assert.match(written, /source: "https:\/\/example\.com\/post"/);
  assert.match(written, /^> the selected text$/m);
  assert.match(written, /the body of the note/);
});

test('Bearer-заголовок принимается так же, как X-Monos-Clip-Token', async () => {
  const res = await post(
    { title: 'Bearer clip', content: 'text' },
    { Authorization: `Bearer ${token}` },
  );
  assert.equal(res.status, 201);
});

test('папка за пределами notes отклоняется', async () => {
  const res = await post(
    { title: 'Escape', content: 'text', folder: '../escape' },
    { 'X-Monos-Clip-Token': token },
  );
  assert.equal(res.status, 403);
  assert.ok(!fs.existsSync(path.join(tempRoot, 'escape')));
});

test('пустая заметка отклоняется', async () => {
  const res = await post({ title: '', content: '' }, { 'X-Monos-Clip-Token': token });
  assert.equal(res.status, 400);
});

test('токен не отдаётся наружу приложения', async () => {
  const res = await fetch(`${base}/api/clip/token`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).token, undefined);
});
