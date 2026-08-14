import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from './paths.js';

test('slugify lowercases ASCII text', () => {
  assert.equal(slugify('My Note'), 'my-note');
});

test('slugify заменяет пробелы на дефисы', () => {
  assert.equal(slugify('hello world'), 'hello-world');
});

test('slugify заменяет спецсимволы на дефисы', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
});

test('slugify сохраняет кириллицу', () => {
  assert.equal(slugify('Привет мир'), 'привет-мир');
});

test('slugify collapse множественных дефисов в один', () => {
  assert.equal(slugify('a   b'), 'a-b');
  assert.equal(slugify('a---b'), 'a-b');
  assert.equal(slugify('a - b'), 'a-b');
});

test('slugify тримит дефисы с краёв', () => {
  assert.equal(slugify('  hello  '), 'hello');
  assert.equal(slugify('---hello---'), 'hello');
  assert.equal(slugify('!@#hello!@#'), 'hello');
});

test('slugify сохраняет цифры', () => {
  assert.equal(slugify('Note 42'), 'note-42');
  assert.equal(slugify('2024 goals'), '2024-goals');
});

test('slugify сохраняет дефис внутри строки', () => {
  assert.equal(slugify('foo-bar'), 'foo-bar');
  assert.equal(slugify('foo - bar'), 'foo-bar');
});

test('slugify возвращает пустую строку для ввода без alphanumeric', () => {
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify('---'), '');
  assert.equal(slugify(''), '');
});

test('slugify безопасно обрабатывает не-строки', () => {
  assert.equal(slugify(null), '');
  assert.equal(slugify(undefined), '');
  assert.equal(slugify(123), '123');
});

test('slugify сохраняет camelCase границы (не разбивает)', () => {
  // camelCase не разбивается — это не задача slugify, только separator normalization
  assert.equal(slugify('myNoteName'), 'mynotename');
});

test('slugify смешанный cyrillic+latin+digits', () => {
  assert.equal(slugify('Документ #42 — Final'), 'документ-42-final');
});

test('slugify нормализует tabs и newlines как разделители', () => {
  assert.equal(slugify('foo\tbar\nbaz'), 'foo-bar-baz');
  assert.equal(slugify('a\n\n\nb'), 'a-b');
});

test('slugify idempotent: повторный вызов не меняет результат', () => {
  const once = slugify('My Note Name!');
  const twice = slugify(once);
  assert.equal(once, twice);
  assert.equal(once, 'my-note-name');
});

test('slugify не падает на длинной строке', () => {
  const long = 'word '.repeat(1000);
  const result = slugify(long);
  assert.ok(result.length > 0);
  assert.ok(result.endsWith('word'));
  assert.ok(!result.endsWith('-'));
  assert.ok(!result.startsWith('-'));
});
