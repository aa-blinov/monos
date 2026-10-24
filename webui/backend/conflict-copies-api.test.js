import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// A sync conflict copy is listed in the maintenance report, and moving it to the trash clears it from the list.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-copies-'));
const notesDir = path.join(tempRoot, 'notes');
fs.mkdirSync(notesDir, { recursive: true });
fs.writeFileSync(path.join(notesDir, 'Plan.md'), '# Plan\n\nВерсия с одного компьютера.\n', 'utf-8');
fs.writeFileSync(path.join(notesDir, 'Plan (conflicted copy 2026-10-15 MacBook).md'), '# Plan\n\nВерсия с другого компьютера.\n', 'utf-8');
process.env.NOTES_ROOT = tempRoot;

const { startServer, stopServer } = await import('./index.js');
const { port } = await startServer({ port: 0 });
after(() => stopServer());

const base = `http://127.0.0.1:${port}`;
const copyPath = 'notes/Plan (conflicted copy 2026-10-15 MacBook).md';

test('копия в обслуживании списана с оригиналом, а после корзины список пуст', async () => {
  const before = await (await fetch(`${base}/api/notes/maintenance`)).json();
  assert.equal(before.conflictCopyCount, 1);
  assert.deepEqual(before.conflictCopies.map((copy) => [copy.path, copy.original, copy.kind]), [
    [copyPath, 'notes/Plan.md', 'conflict'],
  ]);

  const moved = await fetch(`${base}/api/file?path=${encodeURIComponent(copyPath)}`, { method: 'DELETE' });
  assert.equal(moved.status, 200);
  assert.equal((await moved.json()).message, 'Moved to trash');
  // The trash is the `.trash` folder of the notes folder: the file rests there until it is emptied from the trash.
  assert.equal(fs.existsSync(path.join(notesDir, 'Plan (conflicted copy 2026-10-15 MacBook).md')), false);
  assert.ok(fs.existsSync(path.join(notesDir, '.trash', 'Plan (conflicted copy 2026-10-15 MacBook).md')), 'the file rests in .trash');

  const after = await (await fetch(`${base}/api/notes/maintenance`)).json();
  assert.equal(after.conflictCopyCount, 0);
});
