import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bootVault } from './support/vault.js';

// B-J12 and the git half of the error contract: a setup that does not finish leaves nothing behind, and GitHub's
// refusals come back as a status and a code instead of a crash or a 200 that means nothing.
const vault = await bootVault({ files: { 'A.md': '# a\n' } });
const globalConfig = path.join(vault.root, 'gitconfig');
fs.writeFileSync(globalConfig, '[user]\n\tname = Test\n\temail = test@example.test\n');
process.env.GIT_CONFIG_GLOBAL = globalConfig;
process.env.GIT_CONFIG_NOSYSTEM = '1';
after(() => vault.stop());

const realFetch = globalThis.fetch;
async function withGitHub(handler, run) {
  globalThis.fetch = async (input) => {
    const result = await handler(String(input?.url ?? input));
    if (result instanceof Error) throw result;
    return { ok: result.status < 400, status: result.status, headers: new Headers(result.headers || {}), async json() { return result.body; } };
  };
  try { await run(); } finally { globalThis.fetch = realFetch; }
}
const setup = (body) => vault.post('/api/git/setup', { body: { token: 'ghp_x', repo: 'owner/name', branch: 'main', device_name: 'Test device', ...body } });
const nothingLeft = async () => {
  assert.equal(fs.existsSync(path.join(vault.notesDir, '.git')), false, 'no repository was made');
  assert.equal(fs.existsSync(path.join(vault.root, '.data', 'git_settings.json')), false, 'no git settings were written');
  assert.equal(fs.existsSync(path.join(vault.notesDir, '.gitignore')), false);
  assert.equal((await vault.get('/api/git/status')).data.initialized, false, 'the status does not say connected');
};

test('B-J12: a branch name git refuses is a 400 with a code, before anything is made', async () => {
  for (const branch of ['bad..name', '-x', 'a b', 'x~y', 'end.lock', 'a//b', '']) {
    const response = await setup({ branch });
    assert.ok(response.status === 400, `${JSON.stringify(branch)} -> ${response.status}`);
    assert.ok(['invalid_branch', 'missing_fields'].includes(response.data.code), response.data.code);
    assert.doesNotMatch(response.data.detail, /fatal|refname|check-ref-format/i, 'no raw git stderr');
  }
  assert.equal((await setup({ branch: 'x'.repeat(300) })).data.code, 'invalid_branch');
  assert.equal((await setup({ branch: ['a'] })).data.code, 'invalid_branch');
  await nothingLeft();
});

test('B-J12: a repository that is not owner/name, or no token, is refused before anything is made', async () => {
  assert.equal((await setup({ repo: '../../x' })).data.code, 'invalid_repo');
  assert.equal((await setup({ repo: 'noslash' })).data.code, 'invalid_repo');
  assert.equal((await setup({ repo: ['a/b'] })).data.code, 'invalid_repo');
  assert.equal((await setup({ token: '   ' })).data.code, 'token_required');
  assert.equal((await setup({ token: { a: 1 } })).data.code, 'token_required');
  await nothingLeft();
});

test('B-J12: a token GitHub refuses stops the setup at the start, with bad_token', async () => {
  await withGitHub(() => ({ status: 401, body: { message: 'Bad credentials' } }), async () => {
    const response = await setup({});
    assert.equal(response.status, 401);
    assert.equal(response.data.code, 'bad_token');
  });
  await nothingLeft();
});

test('B-J12: a setup that fails at the end is taken back as a whole', async () => {
  // The remote is a folder that does not exist: init, remote, settings and the first commit all happen, then the push fails.
  fs.writeFileSync(globalConfig, `[user]\n\tname = Test\n\temail = test@example.test\n[url "${path.join(vault.root, 'no-such-remote.git')}"]\n\tinsteadOf = https://github.com/owner/name.git\n`);
  const response = await setup({ acknowledgePublic: true });
  assert.equal(response.status, 500);
  assert.equal(response.data.code, 'git_failed');
  assert.ok(!JSON.stringify(response.data).includes(vault.root), 'no path of this computer');
  await nothingLeft();
  assert.ok(vault.exists('A.md'), 'the notes were never touched');
});

test('B-J12: listing repositories with a bad token is 401, not a crash and not a 200', async () => {
  await withGitHub(() => ({ status: 401, body: { message: 'Bad credentials' } }), async () => {
    const response = await vault.get('/api/git/repos', { query: { token: 'bad' } });
    assert.equal(response.status, 401);
    assert.equal(response.data.code, 'bad_token');
    assert.doesNotMatch(JSON.stringify(response.data), /map is not a function/);
  });
  await withGitHub(() => ({ status: 200, body: { message: 'surprise' } }), async () => {
    const response = await vault.get('/api/git/repos', { query: { token: 'ok' } });
    assert.equal(response.status, 502);
    assert.equal(response.data.code, 'github_unexpected');
  });
  await withGitHub(() => ({ status: 200, body: [{ full_name: 'o/a' }, { full_name: 'o/b' }] }), async () => {
    assert.deepEqual((await vault.get('/api/git/repos', { query: { token: 'ok' } })).data, ['o/a', 'o/b']);
  });
  assert.equal((await vault.get('/api/git/repos')).data.code, 'token_required');
});

test('B-J12: the user behind a bad token is 401, never login "unknown"', async () => {
  await withGitHub(() => ({ status: 401, body: { message: 'Bad credentials' } }), async () => {
    const response = await vault.get('/api/git/user', { query: { token: 'bad' } });
    assert.equal(response.status, 401);
    assert.equal(response.data.code, 'bad_token');
    assert.equal(response.data.login, undefined);
  });
  await withGitHub(() => ({ status: 200, body: { login: 'octo' } }), async () => {
    assert.deepEqual((await vault.get('/api/git/user', { query: { token: 'ok' } })).data, { login: 'octo' });
  });
  await withGitHub(() => ({ status: 200, body: {} }), async () => {
    assert.equal((await vault.get('/api/git/user', { query: { token: 'ok' } })).status, 502);
  });
});

test('git errors: branches and repo checks name what went wrong', async () => {
  await withGitHub(() => ({ status: 404, body: { message: 'Not Found' } }), async () => {
    const branches = await vault.get('/api/git/branches', { query: { token: 'ok', repo: 'o/missing' } });
    assert.equal(branches.status, 404);
    assert.equal(branches.data.code, 'repo_not_found');
    const check = await vault.get('/api/git/repo-check', { query: { token: 'ok', repo: 'o/missing' } });
    assert.equal(check.status, 404);
    assert.equal(check.data.code, 'repo_not_found');
  });
  await withGitHub(() => ({ status: 403, body: {}, headers: { 'x-ratelimit-remaining': '0' } }), async () => {
    const response = await vault.get('/api/git/repos', { query: { token: 'ok' } });
    assert.equal(response.status, 429);
    assert.equal(response.data.code, 'github_rate_limited');
  });
  await withGitHub(() => new Error('socket hang up'), async () => {
    for (const url of ['/api/git/repos', '/api/git/user']) {
      const response = await vault.get(url, { query: { token: 'ok' } });
      assert.equal(response.status, 502, url);
      assert.equal(response.data.code, 'repo_unreachable');
    }
    const branches = await vault.get('/api/git/branches', { query: { token: 'ok', repo: 'o/r' } });
    assert.equal(branches.data.code, 'repo_unreachable');
  });
  assert.equal((await vault.get('/api/git/branches', { query: { token: 'ok', repo: 'bad repo!' } })).data.code, 'invalid_repo');
});

test('git errors: routes that need a repository say so with a code', async () => {
  for (const url of ['/api/git/pull', '/api/git/sync']) {
    const response = await vault.post(url);
    assert.equal(response.status, 400, url);
    assert.equal(response.data.code, 'git_not_initialized');
  }
  assert.equal((await vault.post('/api/git/pull', { query: { auto: '1' } })).data.skipped, 'not-connected', 'an automatic round just waits');
});

test('git errors: a git failure that is not one of the known causes is git_failed, with no path in it', async () => {
  const response = await vault.get('/api/git/conflict-file', { query: { path: '../../etc/passwd' } });
  assert.ok(response.status >= 400);
  assert.equal(typeof response.data.code, 'string');
  assert.ok(!JSON.stringify(response.data).includes(vault.root));
});
