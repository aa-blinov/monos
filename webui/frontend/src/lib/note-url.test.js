import test from 'node:test';
import assert from 'node:assert/strict';
import { noteRoute, repairPercentEncoding, safeDecode } from './note-url.js';

test('noteRoute encodes each segment and keeps the folder slashes', () => {
  assert.equal(noteRoute('notes/C# notes.md'), '/notes/C%23%20notes.md');
  assert.equal(noteRoute('notes/100% done.md'), '/notes/100%25%20done.md');
  assert.equal(noteRoute('notes/Work/what? yes.md'), '/notes/Work/what%3F%20yes.md');
  assert.equal(noteRoute('notes/a%2Fb.md'), '/notes/a%252Fb.md');
  assert.equal(noteRoute('notes/x&y.md'), '/notes/x%26y.md');
  assert.equal(noteRoute('notes/#hash start.md'), '/notes/%23hash%20start.md');
});

test('noteRoute round-trips through a URL parse', () => {
  for (const name of ['C# notes.md', '100% done.md', 'a%2Fb.md', '#hash.md', 'what? yes.md', 'x&y.md', 'ü ё 😀.md']) {
    const url = new URL(noteRoute(`notes/Folder/${name}`), 'http://x.test');
    assert.equal(url.hash, '');
    assert.equal(url.search, '');
    const decoded = url.pathname.slice('/notes/'.length).split('/').map(decodeURIComponent).join('/');
    assert.equal(decoded, `Folder/${name}`);
  }
});

test('repairPercentEncoding makes a malformed address decodable', () => {
  const fixed = repairPercentEncoding('/notes/100%%20done.md');
  assert.equal(fixed, '/notes/100%25%20done.md');
  assert.equal(decodeURIComponent(fixed), '/notes/100% done.md');
  assert.equal(repairPercentEncoding('/notes/ok%20name.md'), '/notes/ok%20name.md');
  assert.equal(repairPercentEncoding('/notes/tail%'), '/notes/tail%25');
});

test('safeDecode never throws', () => {
  assert.equal(safeDecode('100%%20done'), '100%%20done');
  assert.equal(safeDecode('a%20b'), 'a b');
});
