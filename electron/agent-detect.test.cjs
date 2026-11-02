const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { detectAgents, safeCommands } = require('./agent-detect.cjs');

const noFiles = {
  constants: { X_OK: 1 },
  accessSync() { throw new Error('ENOENT'); },
  statSync() { throw new Error('ENOENT'); },
};
const filesIn = (...present) => ({
  constants: { X_OK: 1 },
  accessSync(file) { if (!present.includes(file)) throw new Error('ENOENT'); },
  statSync() { return { isFile: () => true }; },
});
const shellSaying = (...lines) => (shell, args, options, done) => done(null, `${lines.join('\n')}\n`);

test('в команду попадают только имена: пробелы, подстановки и пути отсеиваются', () => {
  assert.deepEqual(safeCommands(['claude', 'a b', '$(rm -rf ~)', '../x', 'kiro-cli', 'claude', 5, '']), ['claude', 'kiro-cli']);
  assert.deepEqual(safeCommands('claude'), []);
});

test('оболочка нашла агента — он в ответе, в том порядке, как спросили', async () => {
  const found = await detectAgents(['claude', 'codex', 'aider'], {
    env: { PATH: '' }, shell: '/bin/zsh', platform: 'darwin', home: '/h', fsLike: noFiles,
    exec: shellSaying('Last login: today', 'MONOS_FOUND:aider', 'MONOS_FOUND:claude'),
  });
  assert.deepEqual(found, ['claude', 'aider']);
});

test('шум оболочки и чужие строки не принимаются за агентов', async () => {
  const found = await detectAgents(['claude'], {
    env: { PATH: '' }, shell: '/bin/zsh', platform: 'darwin', home: '/h', fsLike: noFiles,
    exec: shellSaying('MONOS_FOUND:evil', 'hello MONOS_FOUND:claude'),
  });
  assert.deepEqual(found, []);
});

test('оболочка упала или зависла — агенты ищутся по папкам PATH', async () => {
  const found = await detectAgents(['claude', 'codex'], {
    env: { PATH: '/opt/x/bin' }, shell: '/bin/zsh', platform: 'darwin', home: '/h',
    fsLike: filesIn(path.join('/opt/x/bin', 'codex')),
    exec: (shell, args, options, done) => done(new Error('timeout'), ''),
  });
  assert.deepEqual(found, ['codex']);
});

test('оболочка не из семейства POSIX не получает скрипт, остаются папки', async () => {
  let asked = false;
  const found = await detectAgents(['claude'], {
    env: { PATH: '/bin' }, shell: '/usr/bin/fish', platform: 'darwin', home: '/h',
    fsLike: filesIn(path.join('/bin', 'claude')),
    exec: () => { asked = true; },
  });
  assert.equal(asked, false);
  assert.deepEqual(found, ['claude']);
});

test('на Windows ищется по папкам с расширениями, оболочка не спрашивается', async () => {
  let asked = false;
  const found = await detectAgents(['codex'], {
    env: { PATH: 'C:\\bin', APPDATA: 'C:\\a' }, platform: 'win32', home: 'C:\\h',
    fsLike: filesIn(path.join('C:\\bin', 'codex.cmd')),
    exec: () => { asked = true; },
  });
  assert.equal(asked, false);
  assert.deepEqual(found, ['codex']);
});

test('пустой или негодный запрос — пустой ответ без обращения к оболочке', async () => {
  let asked = false;
  const options = { env: {}, shell: '/bin/zsh', platform: 'darwin', fsLike: noFiles, exec: () => { asked = true; } };
  assert.deepEqual(await detectAgents([], options), []);
  assert.deepEqual(await detectAgents(['a b'], options), []);
  assert.deepEqual(await detectAgents(undefined, options), []);
  assert.equal(asked, false);
});
