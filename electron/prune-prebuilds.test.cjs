const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { keepPrebuild, prune } = require('../scripts/prune-prebuilds.cjs');

test('an Apple-silicon build keeps darwin-arm64 and drops every other system and the Intel build', () => {
  assert.equal(keepPrebuild('darwin-arm64', 'arm64'), true);
  assert.equal(keepPrebuild('darwin-arm64.node', 'arm64'), true);
  for (const name of ['darwin-x64', 'darwin-x64.node', 'linux-x64.node', 'linuxmusl-arm64.node', 'win32-arm64', 'win32-x64']) {
    assert.equal(keepPrebuild(name, 'arm64'), false, name);
  }
});

test('an Intel build keeps darwin-x64 only, a universal build keeps both macOS ones', () => {
  assert.equal(keepPrebuild('darwin-x64', 'x64'), true);
  assert.equal(keepPrebuild('darwin-arm64', 'x64'), false);
  assert.equal(keepPrebuild('darwin-arm64', 'universal'), true);
  assert.equal(keepPrebuild('darwin-x64.node', 'universal'), true);
  assert.equal(keepPrebuild('linux-x64.node', 'universal'), false);
});

test('names that are not a prebuild are never removed', () => {
  for (const name of ['pty.node', 'spawn-helper', 'build', 'README.md', 'darwin']) assert.equal(keepPrebuild(name, 'arm64'), true, name);
});

test('prune empties the other processors from nested prebuilds folders and reports what it removed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-prune-'));
  try {
    const mk = (rel) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x'); };
    mk('node-pty/prebuilds/darwin-arm64/pty.node');
    mk('node-pty/prebuilds/darwin-x64/spawn-helper');
    mk('node-pty/prebuilds/win32-x64/pty.node');
    mk('better-sqlite3/prebuilds/darwin-arm64.node');
    mk('better-sqlite3/prebuilds/darwin-x64.node');
    mk('better-sqlite3/prebuilds/linux-x64.node');
    mk('better-sqlite3/build/Release/better_sqlite3.node');
    const removed = prune(root, 'arm64').sort();
    assert.equal(removed.length, 4);
    assert.ok(fs.existsSync(path.join(root, 'node-pty/prebuilds/darwin-arm64/pty.node')));
    assert.ok(fs.existsSync(path.join(root, 'better-sqlite3/prebuilds/darwin-arm64.node')));
    assert.ok(fs.existsSync(path.join(root, 'better-sqlite3/build/Release/better_sqlite3.node')), 'a rebuilt binding is not a prebuild');
    assert.ok(!fs.existsSync(path.join(root, 'node-pty/prebuilds/darwin-x64')));
    assert.ok(!fs.existsSync(path.join(root, 'better-sqlite3/prebuilds/linux-x64.node')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
