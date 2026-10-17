import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { runTwoDeviceScenario, startDevice } from './support/two-devices.js';

// The sync against real GitHub: the token, its permissions, the connection of a first and of a second device,
// and the two-device story of two-device-sync.test.js. Everything happens on a branch made for the run and
// removed at the end, in a repository that is only for this.
//
// Skipped unless both are set (the CI job sets them from a secret and a variable):
//   MONOS_LIVE_GITHUB_TOKEN  a fine-grained token limited to that one repository, Contents: Read and write
//   MONOS_LIVE_GITHUB_REPO   owner/name of the private repository, e.g. aa-blinov/monos-home
const token = process.env.MONOS_LIVE_GITHUB_TOKEN || '';
const repo = process.env.MONOS_LIVE_GITHUB_REPO || '';
const live = Boolean(token && repo);
const skip = live ? false : 'MONOS_LIVE_GITHUB_TOKEN and MONOS_LIVE_GITHUB_REPO are not set';

// A failure message must never carry the token.
const redact = (text) => String(text).split(token).join('***');
const github = (method, apiPath) => fetch(`https://api.github.com${apiPath}`, {
  method,
  headers: { 'User-Agent': 'Monos-live-test', Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
});

const branch = `monos-live-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;
let a;
let b;

async function connect(device, label) {
  assert.equal((await device.post('/api/settings', { git_token: token })).status, 200, `${label}: the token is stored`);
  const setup = await device.post('/api/git/setup', { token, repo, branch, device_name: label });
  assert.equal(setup.status, 200, redact(`${label}: connect: ${JSON.stringify(setup.data)}`));
  assert.equal(setup.data.conflicts, false, `${label}: connecting made no conflict`);
}

test.before(async () => {
  if (!live) return;
  const info = await github('GET', `/repos/${repo}`);
  assert.equal(info.status, 200, `the token cannot read ${repo} (status ${info.status})`);
  const data = await info.json();
  assert.equal(data.private, true, `${repo} is public: the live test would publish its notes. Use a private repository.`);
  assert.equal(data.permissions?.push, true, `the token cannot write to ${repo}: it needs Contents: Read and write`);
  a = await startDevice('Live-A');
  b = await startDevice('Live-B');
});

test.after(async () => {
  await a?.stop();
  await b?.stop();
  if (!live) return;
  const removed = await github('DELETE', `/repos/${repo}/git/refs/heads/${branch}`).catch(() => null);
  if (!removed || ![204, 404, 422].includes(removed.status)) console.warn(`the test branch ${branch} was not removed (${removed?.status ?? 'no answer'}); delete it by hand`);
});

test('GitHub: токен проверяется, а неверный отвергается', { skip, timeout: 60000 }, async () => {
  const check = await a.get(`/api/git/repo-check?token=${encodeURIComponent(token)}&repo=${encodeURIComponent(repo)}`);
  assert.equal(check.status, 200, redact(JSON.stringify(check.data)));
  assert.equal(check.data.private, true);
  assert.equal(check.data.safe, true);
  const wrong = await a.get(`/api/git/repo-check?token=${encodeURIComponent('github_pat_not_a_real_token_for_the_test')}&repo=${encodeURIComponent(repo)}`);
  assert.equal(wrong.status, 401, 'a token GitHub does not know is refused');
});

test('GitHub: два устройства подключаются, обмениваются заметками и разбирают конфликт', { skip, timeout: 600000 }, async () => {
  try {
    await connect(a, 'Live-A');
    await connect(b, 'Live-B');
    const branches = await a.get(`/api/git/branches?token=${encodeURIComponent(token)}&repo=${encodeURIComponent(repo)}`);
    assert.ok(branches.data.includes(branch), 'the first device created the branch on GitHub');
    await runTwoDeviceScenario(a, b, assert);
  } catch (error) {
    error.message = redact(error.message);
    throw error;
  }
});
