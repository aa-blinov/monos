import test from 'node:test';
import assert from 'node:assert/strict';
import { exportFileName, fetchNoteHtml, markdownToPlainText } from './note-export.js';

const withFetch = async (impl, fn) => {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = original; }
};

test('имя файла берётся из заголовка и не содержит запрещённых символов', () => {
  assert.equal(exportFileName('Plan: Q4 / draft?', 'md'), 'Plan_ Q4 _ draft_.md');
  assert.equal(exportFileName('  ..hidden  ', 'txt'), 'hidden.txt');
  assert.equal(exportFileName('Заметка про чай.', 'html'), 'Заметка про чай.html');
  assert.equal(exportFileName('', 'pdf'), 'note.pdf');
});

test('plain text keeps the words and drops the markup', () => {
  const text = markdownToPlainText([
    '# Title',
    '',
    'Some **bold** and *soft* text with a [link](https://example.com) and `code`.',
    '',
    '- first item',
    '- [x] done task',
    '',
    '1. one',
    '2. two',
    '',
    '> quoted line',
    '',
    '```',
    'const a = 1;',
    '```',
    '',
    '| Name | Value |',
    '| --- | --- |',
    '| Alpha | 42 |',
  ].join('\n'));

  assert.match(text, /^Title\n\nSome bold and soft text with a link and code\.\n/);
  assert.ok(text.includes('- first item'));
  assert.ok(text.includes('- [x] done task'));
  assert.ok(text.includes('1. one\n2. two'));
  assert.ok(text.includes('quoted line'));
  assert.ok(text.includes('const a = 1;'));
  assert.ok(text.includes('Name\tValue'));
  assert.ok(text.includes('Alpha\t42'));
  assert.doesNotMatch(text, /\*\*|\[link\]|https:\/\/|`|^#/m);
  assert.ok(text.endsWith('\n'));
});

test('empty Markdown gives an empty text file, not a stray newline run', () => {
  assert.equal(markdownToPlainText(''), '\n');
  assert.equal(markdownToPlainText(undefined), '\n');
});

test('fetchNoteHtml asks the print view for the note and returns its document', async () => {
  const calls = [];
  const html = await withFetch(async (url) => {
    calls.push(url);
    return { ok: true, async text() { return '<!doctype html><title>Note</title>'; } };
  }, () => fetchNoteHtml('notes/work/a b.md'));

  assert.equal(calls[0], '/api/print/note?path=notes%2Fwork%2Fa%20b.md');
  assert.match(html, /<title>Note<\/title>/);
});

test('fetchNoteHtml reports the backend message when the note is missing', async () => {
  await withFetch(async () => ({
    ok: false,
    status: 404,
    async json() { return { detail: 'Note not found' }; },
  }), async () => {
    await assert.rejects(() => fetchNoteHtml('notes/missing.md'), /Note not found/);
  });
});
