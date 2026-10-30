const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveSessionCwd } = require('./terminal-cwd.cjs');

function vault() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-cwd-'));
  fs.mkdirSync(path.join(root, 'Work', 'Plans'), { recursive: true });
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'Work', 'note.md'), '# note');
  return root;
}

test('no folder means the notes folder', () => {
  const root = vault();
  assert.equal(resolveSessionCwd(root, ''), root);
  assert.equal(resolveSessionCwd(root, undefined), root);
  assert.equal(resolveSessionCwd(root, 42), root);
});

test('a folder of the vault is where the shell starts', () => {
  const root = vault();
  assert.equal(resolveSessionCwd(root, 'Work/Plans'), path.join(root, 'Work', 'Plans'));
  assert.equal(resolveSessionCwd(root, 'Work\\Plans'), path.join(root, 'Work', 'Plans'));
});

test('a place outside, a hidden place, a file or a missing folder fall back to the notes folder', () => {
  const root = vault();
  for (const bad of ['../elsewhere', 'Work/../..', '.git', 'Work/.hidden', '/etc', 'Work/note.md', 'Missing']) {
    assert.equal(resolveSessionCwd(root, bad), root, bad);
  }
});

test('a link that leads out of the notes folder is refused', () => {
  const root = vault();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-outside-'));
  fs.symlinkSync(outside, path.join(root, 'Escape'));
  assert.equal(resolveSessionCwd(root, 'Escape'), root);
});
