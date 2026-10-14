import test from 'node:test';
import assert from 'node:assert/strict';
import { wordStats } from './word-stats.js';

test('frontmatter не входит в счётчик слов и времени чтения', () => {
  const stats = wordStats('---\ntitle: "Новая заметка"\ntags: []\n---\n\n');
  assert.equal(stats.words, 0);
  assert.equal(stats.readingMinutes, 0);
});

test('текст после frontmatter считается', () => {
  assert.equal(wordStats('---\ntitle: "X"\n---\n\nдва слова').words, 2);
});

test('заметка без frontmatter считается целиком', () => {
  assert.equal(wordStats('один два три').words, 3);
});
