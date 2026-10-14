import test from 'node:test';
import assert from 'node:assert/strict';
import { isMarkdownBurst } from './markdown-burst.js';

test('одиночный символ и обычный текст не считаются разметкой', () => {
  assert.equal(isMarkdownBurst('a'), false);
  assert.equal(isMarkdownBurst(' '), false);
  assert.equal(isMarkdownBurst('обычная фраза без разметки'), false);
  assert.equal(isMarkdownBurst('snake_case_name и 5 * 3'), false);
});

test('заголовок, список, цитата и код в одной вставке распознаются', () => {
  assert.equal(isMarkdownBurst('# Heading one'), true);
  assert.equal(isMarkdownBurst('## Раздел'), true);
  assert.equal(isMarkdownBurst('- first item'), true);
  assert.equal(isMarkdownBurst('* second'), true);
  assert.equal(isMarkdownBurst('> quoted line'), true);
  assert.equal(isMarkdownBurst('```js\nconst a = 1;\n```'), true);
});

test('жирный, код и ссылка внутри строки распознаются', () => {
  assert.equal(isMarkdownBurst('это **важно** для релиза'), true);
  assert.equal(isMarkdownBurst('вызов `npm test` прошёл'), true);
  assert.equal(isMarkdownBurst('см. [сайт](https://example.com)'), true);
});

test('хэштег и дата без пробела после маркера не считаются разметкой', () => {
  assert.equal(isMarkdownBurst('#project'), false);
  assert.equal(isMarkdownBurst('2024. Отчёт'), false);
});

test('нумерованный список распознаётся только в многострочной вставке', () => {
  assert.equal(isMarkdownBurst('1. first\n2. second'), true);
  assert.equal(isMarkdownBurst('1. first'), false);
});
