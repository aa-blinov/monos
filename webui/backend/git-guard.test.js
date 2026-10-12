import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// A temp root keeps every git side effect away from the real notes folder. If
// the public-repo guard ever failed, `git init` would happen here and the
// assertion below would still catch it — but nothing real is ever at risk.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-gitguard-'));
fs.mkdirSync(path.join(tempRoot, 'notes'), { recursive: true });

process.env.NOTES_ROOT = tempRoot;

// Grab the real fetch before the stub replaces it: the tests still have to
// reach the server over HTTP, while the route under test must see the stub.
const realFetch = globalThis.fetch;

const { startServer, stopServer } = await import('./index.js');
const git = await import('./routes/git.js');

let base;
let githubHandler;

test.before(async () => {
  const started = await startServer({ port: 0 });
  base = `http://127.0.0.1:${started.port}`;
  // shaped like a real Response: the route reads .json(), .status and .headers
  const reply = (status, body, scopes = '') => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: new Headers(scopes ? { 'x-oauth-scopes': scopes } : {}),
  });

  githubHandler = async (url) => {
    const href = String(url);
    if (href.includes('/repos/owner/private-thing')) {
      return reply(200, { full_name: 'owner/private-thing', private: true, visibility: 'private' });
    }
    if (href.includes('/repos/owner/open-thing')) {
      return reply(200, { full_name: 'owner/open-thing', private: false, visibility: 'public' });
    }
    return reply(404, {});
  };
  globalThis.fetch = githubHandler;
});

test.after(async () => {
  await stopServer();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

const setup = (body) =>
  realFetch(`${base}/api/git/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const repoCheck = (query) => realFetch(`${base}/api/git/repo-check?${query}`);

test('repo-check помечает приватный репозиторий как безопасный', async () => {
  const res = await repoCheck('token=t&repo=owner/private-thing');
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.private, true);
  assert.equal(body.safe, true);
});

test('repo-check помечает публичный репозиторий как небезопасный', async () => {
  const res = await repoCheck('token=t&repo=owner/open-thing');
  const body = await res.json();
  assert.equal(body.private, false);
  assert.equal(body.safe, false, 'публичный репозиторий обязан быть помечен как небезопасный');
});

test('repo-check сообщает о недоступном репозитории', async () => {
  const res = await repoCheck('token=t&repo=owner/nothing');
  assert.equal(res.status, 404);
});

test('setup ОТКАЗЫВАЕТСЯ на публичный репозиторий без явного согласия', async () => {
  const res = await setup({ token: 't', repo: 'owner/open-thing', branch: 'main' });
  const body = await res.json();
  assert.equal(res.status, 409);
  assert.equal(body.publicRepo, true);
  assert.match(body.detail, /public/i);
});

test('после отказа ничего не запушено и репозиторий не создан', async () => {
  assert.equal(
    fs.existsSync(path.join(tempRoot, 'notes', '.git')),
    false,
    'git init не должен был произойти — guard стоит до него',
  );
});

test('repo-check перечисляет опасные scopes токена', async () => {
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/repos/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ full_name: 'owner/private-thing', private: true, visibility: 'private' }),
        headers: new Headers({ 'x-oauth-scopes': 'repo, workflow, admin, delete_repo' }),
      };
    }
    return githubHandler(url, init);
  };
  try {
    const res = await repoCheck('token=t&repo=owner/private-thing');
    const body = await res.json();
    const warned = body.scopeWarnings.map((w) => w.scope).sort();
    assert.deepEqual(warned, ['admin', 'delete_repo', 'workflow']);
    assert.equal(body.safe, true, 'широкие scopes не делают репозиторий публичным');
  } finally {
    globalThis.fetch = githubHandler;
  }
});

test('транспорт репозитория строится из имени', () => {
  assert.equal(git.buildGithubRemoteUrl('owner/repo'), 'https://github.com/owner/repo.git');
});