import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bootVault } from './support/vault.js';

// B18 (case-only rename), B-J10 (the word of a copy), B-J13 (links through a folder when the name is shared),
// B20 (wiki-link extraction takes linear time).
const vault = await bootVault({
  files: {
    'Welcome.md': '---\ntitle: "Welcome"\n---\n\nHello\n',
    'Rn3.md': '# Rn3\n',
    'A/Same.md': '# A same\n',
    'B/Same.md': '# B same\n',
    'Linker.md': 'Folder form [[A/Same]] and bare [[Same]] and other folder [[B/Same]].\n',
  },
});
after(() => vault.stop());

const { extractWikiLinks, wikiLinkSpans } = await import('./utils.js');
const q = (relative) => ({ query: { path: relative } });

test('B18: a rename that only changes the case is not a clash with itself', async () => {
  const renamed = await vault.post('/api/file/rename', { ...q('notes/Rn3.md'), body: { new_name: 'rn3.md' } });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
  assert.equal(renamed.data.path, 'notes/rn3.md');
  assert.ok(fs.readdirSync(vault.notesDir).includes('rn3.md'), 'the file has the new spelling');
  assert.equal((await vault.get('/api/file', q('notes/rn3.md'))).status, 200);
  // A different note that really has the name is still a clash.
  vault.write('Other.md', '# o\n');
  await vault.post('/api/directory/create', q('Scratch'));
  const clash = await vault.post('/api/file/rename', { ...q('notes/Other.md'), body: { new_name: 'rn3.md' } });
  assert.equal(clash.status, 409);
  assert.equal(clash.data.code, 'exists');
});

test('B-J10: a copy is named in English unless the page sends its own word', async () => {
  const defaults = await vault.post('/api/notes/duplicate', q('notes/Welcome.md'));
  assert.equal(defaults.status, 200);
  assert.equal(defaults.data.name, 'Welcome copy.md');
  assert.match(vault.read('Welcome copy.md'), /title: "Welcome copy"/);
  const again = await vault.post('/api/notes/duplicate', q('notes/Welcome.md'));
  assert.equal(again.data.name, 'Welcome copy 2.md');

  const russian = await vault.post('/api/notes/duplicate', { ...q('notes/Welcome.md'), body: { suffix: 'копия' } });
  assert.equal(russian.data.name, 'Welcome копия.md');
  assert.match(vault.read('Welcome копия.md'), /title: "Welcome копия"/);
  assert.ok(!defaults.data.name.includes('копия'));
});

test('B-J10: the suffix is checked like any name', async () => {
  for (const suffix of [{ a: 1 }, 5, 'a/b', 'x'.repeat(60), 'ba?d']) {
    const response = await vault.post('/api/notes/duplicate', { ...q('notes/Welcome.md'), body: { suffix } });
    assert.equal(response.status, 400, JSON.stringify(suffix).slice(0, 30));
    assert.equal(typeof response.data.code, 'string');
  }
  const asQuery = await vault.post('/api/notes/duplicate', { query: { path: 'notes/Welcome.md', suffix: 'dup' } });
  assert.equal(asQuery.data.name, 'Welcome dup.md', 'the suffix may also come in the query');
});

test('B-J13: renaming a note whose name another note shares still moves the links that name its folder', async () => {
  const renamed = await vault.post('/api/file/rename', { ...q('notes/A/Same.md'), body: { new_name: 'Renamed.md' } });
  assert.equal(renamed.status, 200);
  const text = vault.read('Linker.md');
  assert.match(text, /\[\[A\/Renamed\]\]/, 'the link through the folder followed the note');
  assert.match(text, /\[\[Same\]\]/, 'the bare link may mean the other note, so it stays');
  assert.match(text, /\[\[B\/Same\]\]/, 'the other folder is not touched');
  assert.equal(renamed.data.updatedLinks, 1);
});

test('B20: the one-pass scanner finds exactly what the regular expression found', () => {
  const alphabet = ['[', '[', ']', ']', 'a', 'b', '|', '#', '\n', ' ', '`'];
  let seed = 12345;
  const next = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
  for (let round = 0; round < 3000; round += 1) {
    let text = '';
    const length = next() % 40;
    for (let index = 0; index < length; index += 1) text += alphabet[next() % alphabet.length];
    const expected = [...text.matchAll(/\[\[(.*?)\]\]/g)].map((match) => ({ index: match.index, inner: match[1] }));
    const actual = [...wikiLinkSpans(text)].map((span) => ({ index: span.index, inner: span.inner }));
    assert.deepEqual(actual, expected, JSON.stringify(text));
  }
  assert.deepEqual(extractWikiLinks('x [[Note#h|alias]] y [[#self]] z `[[code]]`'), ['Note#h']);
});

test('B20: a long line of opening brackets saves quickly instead of in half a minute', async () => {
  for (const unit of ['[[', '[[a]']) {
    const content = unit.repeat(Math.ceil(400_000 / unit.length));
    const started = Date.now();
    const saved = await vault.post('/api/file', { query: { path: 'notes/Brackets.md', create: '1' }, body: { content } });
    const took = Date.now() - started;
    assert.equal(saved.status, 200);
    assert.ok(took < 3000, `${unit} x ${content.length / unit.length} took ${took} ms`);
  }
});
