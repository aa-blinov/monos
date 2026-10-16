import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Pinning keeps a note at the top of the board, in both orders the board uses.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-pinned-'));
fs.mkdirSync(path.join(tempRoot, 'notes'), { recursive: true });
process.env.NOTES_ROOT = tempRoot;
const { startServer, stopServer } = await import('./index.js');
let base;

test.before(async () => {
  const started = await startServer({ port: 0 });
  base = `http://127.0.0.1:${started.port}`;
  for (const title of ['Старая', 'Средняя', 'Новая']) {
    await fetch(`${base}/api/notes/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content: title }) });
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await fetch(`${base}/api/file/metadata?path=${encodeURIComponent('notes/Старая.md')}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pinned: true }),
  });
});
test.after(async () => { await stopServer(); });

for (const sort of ['modified', '']) {
  test(`закреплённая заметка первая на доске (sort=${sort || 'board'})`, async () => {
    const notes = await (await fetch(`${base}/api/notes/recent?limit=10&sort=${sort}`)).json();
    assert.equal(notes[0].name, 'Старая');
    assert.equal(notes[0].pinned, true);
    assert.equal(notes[1].pinned, false);
  });
}
