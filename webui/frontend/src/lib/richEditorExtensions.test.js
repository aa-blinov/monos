import test from 'node:test';
import assert from 'node:assert/strict';
import { createRichEditorExtensions } from './richEditorExtensions.js';

test('createRichEditorExtensions возвращает массив extensions', () => {
  const exts = createRichEditorExtensions('Type here...');
  assert.ok(Array.isArray(exts));
  assert.ok(exts.length > 0);
});

test('createRichEditorExtensions поддерживает кастомный placeholder', () => {
  const exts = createRichEditorExtensions('Custom placeholder');
  // Placeholder хранится в одном из extensions; проверим, что функция не падает
  // на разных значениях
  assert.ok(Array.isArray(exts));
});

test('createRichEditorExtensions поддерживает опции (editable, autofocus)', () => {
  const a = createRichEditorExtensions('p', { editable: true });
  const b = createRichEditorExtensions('p', { editable: false, autofocus: true });
  assert.ok(Array.isArray(a));
  assert.ok(Array.isArray(b));
});
