import test from 'node:test';
import assert from 'node:assert/strict';
import { wordStats, formatReadingTime } from './word-stats.js';

test('wordStats считает слова через пробелы и переносы', () => {
  const stats = wordStats('hello world foo bar');
  assert.equal(stats.words, 4);
});

test('wordStats пустая строка → нули', () => {
  assert.deepEqual(wordStats(''), { words: 0, chars: 0, charsNoSpaces: 0, readingMinutes: 0 });
});

test('wordStats null/undefined → нули', () => {
  assert.deepEqual(wordStats(null), { words: 0, chars: 0, charsNoSpaces: 0, readingMinutes: 0 });
  assert.deepEqual(wordStats(undefined), { words: 0, chars: 0, charsNoSpaces: 0, readingMinutes: 0 });
});

test('wordStats считает chars (с пробелами и без)', () => {
  const stats = wordStats('hi world');
  assert.equal(stats.chars, 8);
  assert.equal(stats.charsNoSpaces, 7);
});

test('wordStats игнорирует markdown-разметку для счёта слов (грубо)', () => {
  // # heading **bold** [link](url) → считаем по whitespace
  const stats = wordStats('# heading **bold** [link](url)');
  // 4 whitespace-separated tokens
  assert.equal(stats.words, 4);
});

test('readingMinutes: 200 слов = 1 минута', () => {
  const text = Array(200).fill('word').join(' ');
  const stats = wordStats(text);
  assert.equal(stats.readingMinutes, 1);
});

test('readingMinutes: 500 слов = 3 минуты (округление вверх)', () => {
  const text = Array(500).fill('word').join(' ');
  const stats = wordStats(text);
  assert.equal(stats.readingMinutes, 3);
});

test('readingMinutes: 50 слов → 1 минута (минимум)', () => {
  const text = Array(50).fill('word').join(' ');
  const stats = wordStats(text);
  assert.equal(stats.readingMinutes, 1);
});

test('readingMinutes: 0 слов → 0 минут', () => {
  const stats = wordStats('');
  assert.equal(stats.readingMinutes, 0);
});

test('formatReadingTime: < 1 мин → "< 1 min"', () => {
  assert.equal(formatReadingTime(0), '< 1 min');
  assert.equal(formatReadingTime(0.5), '< 1 min');
});

test('formatReadingTime: целые минуты', () => {
  assert.equal(formatReadingTime(1), '1 min read');
  assert.equal(formatReadingTime(5), '5 min read');
  assert.equal(formatReadingTime(120), '120 min read');
});
