import test from 'node:test';
import assert from 'node:assert/strict';
import { shortcutLabel } from './shortcut-label.js';

test('вне macOS подпись остаётся как написана', () => {
  assert.equal(shortcutLabel('Ctrl+K', false), 'Ctrl+K');
  assert.equal(shortcutLabel('Ctrl+Shift+F', false), 'Ctrl+Shift+F');
});

test('на macOS Ctrl становится ⌘, Shift становится ⇧', () => {
  assert.equal(shortcutLabel('Ctrl+K', true), '⌘K');
  assert.equal(shortcutLabel('Ctrl+Shift+F', true), '⌘⇧F');
  assert.equal(shortcutLabel('Ctrl+S', true), '⌘S');
});

test('пустое значение не падает', () => {
  assert.equal(shortcutLabel('', true), '');
  assert.equal(shortcutLabel(undefined, false), '');
});
