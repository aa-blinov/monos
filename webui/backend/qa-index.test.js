import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bootVault } from './support/vault.js';

// B8, B9, B10, B11 and the board fields of B-J13: what the index finds, what it must not follow, and what a save
// must not overwrite.
const decomposed = 'Café й ë';
const vault = await bootVault({
  files: {
    'Quote.md': 'He said dont"stop and kept going\n',
    'Нфд Café.md': 'Просто текст\n',
    'Body.md': `Тело: ${decomposed}\n`,
  },
});
after(() => vault.stop());

const { indexAllFiles } = await import('./indexing.js');
const search = async (query, content = true) => (await vault.post('/api/search', { body: { query, search_content: content } })).data.map((item) => item.path);
const q = (relative) => ({ query: { path: relative } });

test('B8: text with a double quote is found, in the body and in a query that holds the quote', async () => {
  assert.ok((await search('dont"stop')).includes('notes/Quote.md'));
  assert.ok((await search('body:dont"stop')).includes('notes/Quote.md'));
  assert.ok((await search('said dont"stop')).includes('notes/Quote.md'), 'and so is a phrase of several words');
});

test('B8: a quoted phrase still means a phrase', async () => {
  vault.write('Phrase.md', 'one two three\n');
  indexAllFiles();
  assert.ok((await search('"one two"')).includes('notes/Phrase.md'));
  assert.ok(!(await search('"two one"')).includes('notes/Phrase.md'));
});

test('B9: decomposed and composed spellings find each other, in names and in text', async () => {
  const nfd = (text) => text.normalize('NFD');
  const nfc = (text) => text.normalize('NFC');
  // The note's text holds the decomposed forms (what a Mac gives), the queries are typed composed and decomposed.
  vault.write('Decomposed text.md', `${nfd('Café й ё')} stays here\n`);
  indexAllFiles();
  assert.ok((await search(nfc('Café'), true)).includes('notes/Decomposed text.md'), 'NFD text, NFC query');
  assert.ok((await search(nfd('Café'), true)).includes('notes/Decomposed text.md'), 'NFD text, NFD query');
  assert.ok((await search(nfc('й'), true)).includes('notes/Decomposed text.md'), 'a decomposed й is found by the composed letter');
  assert.ok((await search(`body:${nfc('Café й')}`, true)).includes('notes/Decomposed text.md'));

  // A file named with decomposed letters is found by the composed name.
  vault.write(`${nfd('Заметка ёж')}.md`, 'тело\n');
  indexAllFiles();
  const names = (await search(nfc('Заметка ёж'), false)).map((item) => nfc(item));
  assert.ok(names.includes(nfc('notes/Заметка ёж.md')), 'an NFD file name is found by an NFC query');
  const found = (await search(nfd('Заметка ёж'), false)).map((item) => nfc(item));
  assert.ok(found.includes(nfc('notes/Заметка ёж.md')), 'and by an NFD one');
});

test('B10: a symlinked note or folder is not followed by the index, search, recent or print', async () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-outside-'));
  try {
    fs.writeFileSync(path.join(outside, 'Leak.md'), 'LEAKED-OUTSIDE-TEXT\n');
    fs.mkdirSync(path.join(outside, 'dir'));
    fs.writeFileSync(path.join(outside, 'dir', 'Deep.md'), 'LEAKED-DEEP-TEXT\n');
    fs.symlinkSync(path.join(outside, 'Leak.md'), path.join(vault.notesDir, 'LinkedNote.md'));
    fs.symlinkSync(path.join(outside, 'dir'), path.join(vault.notesDir, 'LinkedDir'));
    indexAllFiles();
    assert.deepEqual(await search('LEAKED'), []);
    const recent = (await vault.get('/api/notes/recent', { query: { limit: 100 } })).data.map((note) => note.path);
    assert.ok(!recent.some((item) => /Linked/.test(item)));
    assert.ok(!JSON.stringify((await vault.get('/api/tree')).data).includes('Linked'));
    const book = await vault.get('/api/print/tree', q(''));
    assert.ok(!String(book.text).includes('LEAKED'));
    assert.equal((await vault.get('/api/file', q('notes/LinkedNote.md'))).status, 403);
    // An earlier row of a path that has since become a link is swept.
    fs.rmSync(path.join(vault.notesDir, 'LinkedNote.md'));
    vault.write('LinkedNote.md', 'real note\n');
    indexAllFiles();
    assert.ok((await search('real note')).includes('notes/LinkedNote.md'));
    fs.rmSync(path.join(vault.notesDir, 'LinkedNote.md'));
    fs.symlinkSync(path.join(outside, 'Leak.md'), path.join(vault.notesDir, 'LinkedNote.md'));
    indexAllFiles();
    assert.deepEqual(await search('real note'), [], 'a note that became a link left the index');
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('B11: a note that is not valid UTF-8 is read as it can be, flagged read-only, and never saved over', async () => {
  const bytes = Buffer.concat([Buffer.from('Привет '), Buffer.from([0xff, 0xfe, 0xfd]), Buffer.from(' конец\n')]);
  fs.writeFileSync(path.join(vault.notesDir, 'Latin1.md'), bytes);
  indexAllFiles();
  const read = await vault.get('/api/file', q('notes/Latin1.md'));
  assert.equal(read.status, 200);
  assert.equal(read.data.readOnly, true);
  assert.equal(read.data.code, 'not_utf8');
  const save = await vault.post('/api/file', { ...q('notes/Latin1.md'), body: { content: read.data.content } });
  assert.equal(save.status, 409);
  assert.equal(save.data.code, 'not_utf8');
  assert.ok(fs.readFileSync(path.join(vault.notesDir, 'Latin1.md')).equals(bytes), 'the bytes on disk are as they were');

  const withNul = Buffer.from('some text with one NUL byte \u0000 in the middle of the note\n');
  fs.writeFileSync(path.join(vault.notesDir, 'Nul.md'), withNul);
  const nulRead = await vault.get('/api/file', q('notes/Nul.md'));
  assert.equal(nulRead.data.readOnly, true);
  assert.equal(nulRead.data.code, 'nul_bytes');
  assert.equal((await vault.post('/api/file', { ...q('notes/Nul.md'), body: { content: 'x' } })).status, 409);
  assert.ok(fs.readFileSync(path.join(vault.notesDir, 'Nul.md')).equals(withNul));

  // Text that is fine is saved as before.
  assert.equal((await vault.post('/api/file', { ...q('notes/Body.md'), body: { content: 'changed' } })).status, 200);
  const clean = await vault.get('/api/file', q('notes/Body.md'));
  assert.equal(clean.data.readOnly, undefined);
});

test('B-J13: the board fields: a locked note says so without being opened, a conflicted one has no raw markers in its excerpt', async () => {
  vault.write('Sealed.md', '---\nmonos-locked: true\n---\n\n-----BEGIN MONOS LOCKED NOTE-----\nAAAA\n-----END MONOS LOCKED NOTE-----\n');
  vault.write('Clash.md', '# Clash\n\n<<<<<<< HEAD\nours line\n=======\ntheirs line\n>>>>>>> origin/main\n\nafter\n');
  vault.write('Plain.md', '# Plain\n\nsome text\n=======\n');
  indexAllFiles();
  const cards = (await vault.get('/api/notes/recent', { query: { limit: 100 } })).data;
  const byPath = Object.fromEntries(cards.map((card) => [card.path, card]));
  assert.equal(byPath['notes/Sealed.md'].locked, true);
  assert.equal(byPath['notes/Sealed.md'].excerpt, '');
  assert.equal(byPath['notes/Sealed.md'].conflict, false);
  assert.equal(byPath['notes/Clash.md'].conflict, true);
  assert.equal(byPath['notes/Clash.md'].locked, false);
  assert.doesNotMatch(byPath['notes/Clash.md'].excerpt, /<<<<<<<|>>>>>>>|=======|theirs line/);
  assert.match(byPath['notes/Clash.md'].excerpt, /ours line/);
  assert.equal(byPath['notes/Plain.md'].conflict, false, 'a Markdown underline of equals signs is not a conflict');
  assert.equal(byPath['notes/Body.md'].locked, false);
  for (const card of cards) assert.equal(typeof card.locked, 'boolean');
  // The same fields on the other list the page uses.
  const searched = (await vault.post('/api/search', { body: { query: 'Clash' } })).data;
  assert.ok(Array.isArray(searched));
});

test('B11: the other ways of rewriting a note (metadata, bulk tags, tag rename, duplicate) leave a damaged note alone too', async () => {
  const bytes = Buffer.concat([Buffer.from('---\ntags: ["damaged"]\n---\n\nтекст '), Buffer.from([0xc3, 0x28, 0xff]), Buffer.from(' конец\n')]);
  fs.writeFileSync(path.join(vault.notesDir, 'Damaged.md'), bytes);
  indexAllFiles();
  const metadata = await vault.put('/api/file/metadata', { ...q('notes/Damaged.md'), body: { pinned: true } });
  assert.equal(metadata.status, 409);
  assert.equal(metadata.data.code, 'not_utf8');
  const bulk = await vault.post('/api/notes/bulk-tag', { body: { paths: ['notes/Damaged.md'], tag: 'new' } });
  assert.deepEqual(bulk.data.changed, []);
  assert.equal((await vault.post('/api/tags/rename', { body: { from: 'damaged', to: 'renamed' } })).status, 200);
  assert.equal((await vault.post('/api/notes/duplicate', q('notes/Damaged.md'))).status, 409);
  assert.ok(fs.readFileSync(path.join(vault.notesDir, 'Damaged.md')).equals(bytes), 'not a byte of the note changed');
});
