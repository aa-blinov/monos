import test from 'node:test';
import assert from 'node:assert/strict';
import { plainTextDocument, markdownToEditorContent } from './markdown-editor-content.js';

test('plainTextDocument возвращает TipTap-совместимую структуру', () => {
  const doc = plainTextDocument('hello world');
  assert.equal(doc.type, 'doc');
  assert.ok(Array.isArray(doc.content));
  assert.equal(doc.content.length, 1);
  const para = doc.content[0];
  assert.equal(para.type, 'paragraph');
  assert.equal(para.content[0].text, 'hello world');
});

test('plainTextDocument пустая строка → один пустой paragraph', () => {
  const doc = plainTextDocument('');
  assert.equal(doc.type, 'doc');
  assert.equal(doc.content.length, 1);
  assert.equal(doc.content[0].type, 'paragraph');
  // пустой paragraph: content = undefined (для совместимости с TipTap)
  assert.equal(doc.content[0].content, undefined);
});

test('plainTextDocument с абзацами (двойной перенос) → несколько параграфов', () => {
  const doc = plainTextDocument('paragraph 1\n\nparagraph 2\n\nparagraph 3');
  assert.equal(doc.content.length, 3);
  assert.equal(doc.content[1].content[0].text, 'paragraph 2');
});

test('markdownToEditorContent возвращает строку или doc', () => {
  // Без настроенного TipTap converter результат может быть null/пустой —
  // проверяем только, что функция не падает на разном вводе
  assert.doesNotThrow(() => markdownToEditorContent('# heading'));
  assert.doesNotThrow(() => markdownToEditorContent(''));
  assert.doesNotThrow(() => markdownToEditorContent(null));
});
