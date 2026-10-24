import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeInline } from './markdown-fidelity.js';

test('brackets, tildes and angle brackets stay as written when nothing reads them as syntax', () => {
  assert.equal(escapeInline('Text[^1] and [[Wiki]] and Array[0]'), 'Text[^1] and [[Wiki]] and Array[0]');
  assert.equal(escapeInline('H~2~O and ~maybe~'), 'H~2~O and ~maybe~');
  assert.equal(escapeInline('a < b > c & d, <br>'), 'a < b > c & d, <br>');
  assert.equal(escapeInline('C:\\Users\\me'), 'C:\\Users\\me');
  assert.equal(escapeInline('2 * 3 and snake_case'), '2 * 3 and snake_case');
});

test('what would read back as something else is escaped', () => {
  assert.equal(escapeInline('~~not struck~~'), '\\~\\~not struck\\~\\~');
  assert.equal(escapeInline('[a](http://x) and [b][c]'), '\\[a\\](http://x) and \\[b\\]\\[c\\]');
  assert.equal(escapeInline('a*b*c'), 'a\\*b\\*c');
  assert.equal(escapeInline('use `code` here'), 'use \\`code\\` here');
  assert.equal(escapeInline('&amp; stays literal'), '&amp;amp; stays literal');
  assert.equal(escapeInline('end\\'), 'end\\\\');
  assert.equal(escapeInline('\\* star'), '\\\\\\* star');
});

test('the start of a line is guarded against lists, headings, quotes and task markers', () => {
  const line = { startOfLine: true };
  assert.equal(escapeInline('- item', line), '\\- item');
  assert.equal(escapeInline('# heading', line), '\\# heading');
  assert.equal(escapeInline('> quote', line), '\\> quote');
  assert.equal(escapeInline('1. one', line), '1\\. one');
  assert.equal(escapeInline('7) seven', line), '7\\) seven');
  assert.equal(escapeInline('[x] done', line), '\\[x] done');
  assert.equal(escapeInline('[^1]: The note.', line), '[^1]: The note.');
  assert.equal(escapeInline('[ref]: https://example.com', line), '\\[ref]: https://example.com');
  assert.equal(escapeInline('mid # line', line), 'mid # line');
});

test('a pipe in a table cell is escaped, and only there', () => {
  assert.equal(escapeInline('x | y', { inTable: true }), 'x \\| y');
  assert.equal(escapeInline('x | y'), 'x | y');
});
