import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDarkMode, normalizeNotePath } from './app-shell.js';

test('normalizeNotePath убирает лидирующий notes/ и ведущий слэш', () => {
  assert.equal(normalizeNotePath('notes/Foo/Bar.md'), 'Foo/Bar.md');
  assert.equal(normalizeNotePath('Foo/Bar.md'), 'Foo/Bar.md');
  assert.equal(normalizeNotePath('/Foo.md'), 'Foo.md');
  // пустая строка возвращается как есть (реальный API не проверяет на null)
  assert.equal(normalizeNotePath(''), '');
});

test('detectDarkMode возвращает true для dark и false для light', () => {
  // node:test без window/matchMedia, проверяем только явные режимы
  assert.equal(detectDarkMode('light'), false);
  assert.equal(detectDarkMode('dark'), true);
});
