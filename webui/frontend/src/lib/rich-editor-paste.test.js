import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownTextFromClipboard } from './rich-editor-paste.js';

function makeDt(types) {
  return {
    types: Object.freeze(types),
    getData: (type) => (types.includes(type) ? `payload-for-${type}` : ''),
  };
}

test('markdownTextFromClipboard: text/markdown имеет наивысший приоритет', () => {
  const dt = makeDt(['text/markdown', 'text/plain']);
  assert.equal(markdownTextFromClipboard(dt), 'payload-for-text/markdown');
});

test('markdownTextFromClipboard: text/plain с markdown-паттерном принимается', () => {
  // text/html отсутствует, text/plain содержит markdown-маркеры
  const dt = makeDt(['text/plain']);
  dt.getData = (type) => (type === 'text/plain' ? '# heading\n- list item' : '');
  const result = markdownTextFromClipboard(dt);
  assert.match(result, /# heading/);
});

test('markdownTextFromClipboard: text/html в типах → пустая строка (rich paste)', () => {
  const dt = makeDt(['text/html', 'text/plain']);
  dt.getData = (type) => (type === 'text/plain' ? '# markdown' : '');
  // text/html присутствует → rich paste, markdownTextFromClipboard возвращает ''
  assert.equal(markdownTextFromClipboard(dt), '');
});

test('markdownTextFromClipboard: толерантен к null/undefined', () => {
  assert.equal(markdownTextFromClipboard(null), '');
  assert.equal(markdownTextFromClipboard(undefined), '');
});

test('markdownTextFromClipboard: text/plain без markdown-маркеров → пустая строка', () => {
  const dt = makeDt(['text/plain']);
  dt.getData = (type) => (type === 'text/plain' ? 'just plain text' : '');
  assert.equal(markdownTextFromClipboard(dt), '');
});
