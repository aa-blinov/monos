import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bootVault } from './support/vault.js';

// B-J5: moving a note (or a folder) takes its pictures with it, so the links in the note still reach them.
const vault = await bootVault({
  files: {
    'Src/Note.md': 'Picture ![p](_attachments/pic.png) and embed ![[doc.pdf]] and html <img src="_attachments/h%20one.png" width="100">\n',
    'Src/Shared one.md': 'Same picture ![p](_attachments/pic.png)\n',
    'Src/_attachments/pic.png': 'PIC-BYTES',
    'Src/_attachments/doc.pdf': 'PDF-BYTES',
    'Src/_attachments/h one.png': 'H-BYTES',
    'Dest/_attachments/pic.png': 'OTHER-PIC-BYTES',
    'Dest/Existing.md': '![e](_attachments/pic.png)\n',
    'Dir/Inner/Deep.md': '![d](_attachments/deep.png)\n',
    'Dir/Inner/_attachments/deep.png': 'DEEP',
    'Dir/Top.md': '![t](_attachments/top.png)\n',
    'Dir/_attachments/top.png': 'TOP',
    'Elsewhere/_attachments/far.png': 'FAR',
    'Dir/Inner/Far note.md': '![f](../../Elsewhere/_attachments/far.png)\n',
    'Lone.md': '![l](_attachments/lone.png)\n',
    '_attachments/lone.png': 'LONE',
    'Target/Keep.md': '# keep\n',
  },
});
after(() => vault.stop());

const move = (source, target) => vault.post('/api/file/move', { query: { source, target } });
const attachmentStatus = async (relative) => (await vault.get('/api/attachments/raw', { query: { path: relative } })).status;

test('B-J5: a note moved to another folder brings the pictures it shows, and its links still resolve', async () => {
  const moved = await move('notes/Src/Note.md', 'notes/Target');
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  assert.equal(moved.data.path, 'notes/Target/Note.md');
  assert.equal(moved.data.attachments, 3);
  const text = vault.read('Target/Note.md');
  assert.match(text, /\(_attachments\/pic\.png\)/, 'the link is unchanged where the name was free');
  for (const file of ['pic.png', 'doc.pdf', 'h one.png']) {
    assert.ok(vault.exists(`Target/_attachments/${file}`), `${file} is in the new folder`);
  }
  assert.equal(await attachmentStatus('notes/Target/_attachments/pic.png'), 200, 'the page can fetch it');
  assert.equal(vault.read('Target/_attachments/pic.png'), 'PIC-BYTES');
  assert.ok(vault.exists('Src/_attachments/pic.png'), 'the other note of the old folder still shows pic.png: it stays');
  assert.equal(vault.exists('Src/_attachments/doc.pdf'), false, 'files nothing else shows are moved, not copied');
  assert.equal(vault.exists('Src/_attachments/h one.png'), false);
});

test('B-J5: the attachment list sees the picture as used by the moved note, and publish finds every asset', async () => {
  const items = (await vault.get('/api/attachments/all')).data.items;
  const pic = items.find((item) => item.path === 'notes/Target/_attachments/pic.png');
  assert.ok(pic.usedBy.some((user) => user.path === 'notes/Target/Note.md'));
  const os = await import('node:os');
  const path = await import('node:path');
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-move-site-'));
  try {
    const published = await vault.post('/api/publish', { body: { target } });
    assert.equal(published.status, 200);
    assert.deepEqual(published.data.missingAssets, []);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('B-J5: a picture whose name is taken in the new folder is carried under another name, and the link follows', async () => {
  const moved = await move('notes/Src/Shared one.md', 'notes/Dest');
  assert.equal(moved.status, 200);
  const text = vault.read('Dest/Shared one.md');
  assert.match(text, /\(_attachments\/pic-2\.png\)/);
  assert.equal(vault.read('Dest/_attachments/pic-2.png'), 'PIC-BYTES');
  assert.equal(vault.read('Dest/_attachments/pic.png'), 'OTHER-PIC-BYTES', 'the picture that was there is untouched');
  assert.match(vault.read('Dest/Existing.md'), /\(_attachments\/pic\.png\)/);
  assert.equal(vault.exists('Src/_attachments/pic.png'), false, 'nothing in the old folder shows it any more');
});

test('B-J5: a folder moved whole keeps its notes and their pictures together', async () => {
  const moved = await move('notes/Dir', 'notes/Target');
  assert.equal(moved.status, 200);
  assert.equal(vault.read('Target/Dir/_attachments/top.png'), 'TOP');
  assert.equal(vault.read('Target/Dir/Inner/_attachments/deep.png'), 'DEEP');
  assert.equal((await attachmentStatus('notes/Target/Dir/Inner/_attachments/deep.png')), 200);
  assert.match(vault.read('Target/Dir/Top.md'), /\(_attachments\/top\.png\)/);
});

test('B-J5: a note inside a moved folder that pointed outside it still reaches its picture', async () => {
  const text = vault.read('Target/Dir/Inner/Far note.md');
  assert.match(text, /\]\(_attachments\/far\.png\)/, 'the link now points into the note\'s own folder');
  assert.equal(vault.read('Target/Dir/Inner/_attachments/far.png'), 'FAR');
  assert.equal(vault.exists('Elsewhere/_attachments/far.png'), false, 'and nothing else showed it, so it moved');
});

test('B-J5: a note moved up to the top of the notes brings its pictures to the top folder', async () => {
  const moved = await move('notes/Target/Dir/Top.md', 'notes');
  assert.equal(moved.status, 200);
  assert.equal(vault.read('_attachments/top.png'), 'TOP');
  assert.match(vault.read('Top.md'), /\(_attachments\/top\.png\)/);
});

test('B-J5: a move in the same folder or of a note without pictures changes nothing else', async () => {
  const before = fs.readdirSync(vault.notesDir).sort();
  const same = await move('notes/Lone.md', 'notes');
  assert.equal(same.status, 200);
  assert.deepEqual(fs.readdirSync(vault.notesDir).sort(), before);
  const noPictures = await move('notes/Target/Keep.md', 'notes/Dest');
  assert.equal(noPictures.status, 200);
  assert.equal(noPictures.data.attachments, 0);
});
