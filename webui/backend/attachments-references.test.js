import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// A picture that a note shows as ![[name.png]], [[name.png]] or an HTML <img> is in use, not an orphan.
// A closed locked note may show any picture, so nothing is listed until it is unlocked.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-orphans-'));
const notesDir = path.join(tempRoot, 'notes');
fs.mkdirSync(path.join(notesDir, '_attachments'), { recursive: true });
for (const name of ['pic.png', 'photo one.jpg', 'loose.png']) {
  fs.writeFileSync(path.join(notesDir, '_attachments', name), 'image bytes');
}
fs.writeFileSync(path.join(notesDir, 'Entry.md'), [
  '# Entry',
  '',
  '![[pic.png]]',
  '',
  '<img src="_attachments/photo%20one.jpg" width="200">',
  '',
].join('\n'), 'utf-8');
process.env.NOTES_ROOT = tempRoot;

const { startServer, stopServer } = await import('./index.js');
const { port } = await startServer({ port: 0 });
after(() => stopServer());

const base = `http://127.0.0.1:${port}`;
const json = { 'content-type': 'application/json' };
const secretPath = 'notes/Secret.md';
const query = `?path=${encodeURIComponent(secretPath)}`;

async function orphans() {
  const response = await fetch(`${base}/api/attachments/orphans`);
  assert.equal(response.status, 200);
  return response.json();
}

test('картинки, на которые ссылаются ![[имя]] и HTML <img>, не считаются лишними', async () => {
  const data = await orphans();
  assert.deepEqual(data.orphans.map((item) => item.name), ['loose.png']);
  assert.equal(data.lockedNotes, 0);
});

test('запертая заметка закрыта: её картинки неизвестны, поэтому список неиспользуемых пуст', async () => {
  fs.writeFileSync(path.join(notesDir, 'Secret.md'), '# Secret\n\n![[pic.png]]\n', 'utf-8');
  const locked = await fetch(`${base}/api/file/lock${query}`, { method: 'POST', headers: json, body: JSON.stringify({ passphrase: 'фраза-тест' }) });
  assert.equal(locked.status, 200);
  assert.equal((await fetch(`${base}/api/file/relock${query}`, { method: 'POST' })).status, 200);

  const data = await orphans();
  assert.deepEqual(data.orphans, []);
  assert.equal(data.lockedNotes, 1);
});

test('открытая в этой сессии заметка учитывается, и неиспользуемая картинка снова видна', async () => {
  const unlocked = await fetch(`${base}/api/file/unlock${query}`, { method: 'POST', headers: json, body: JSON.stringify({ passphrase: 'фраза-тест' }) });
  assert.equal(unlocked.status, 200);

  const data = await orphans();
  assert.deepEqual(data.orphans.map((item) => item.name), ['loose.png']);
  assert.equal(data.lockedNotes, 0);
});
