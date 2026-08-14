import test from 'node:test';
import assert from 'node:assert/strict';
import { getTreeItemAccentStyle } from './tree-accent.js';

test('возвращает пустые переменные, когда цвет не задан', () => {
  assert.equal(
    getTreeItemAccentStyle({ color: null }),
    '--tree-accent: transparent; --tree-text: ;'
  );
});

test('возвращает пустые переменные, когда color пустая строка', () => {
  assert.equal(
    getTreeItemAccentStyle({ color: '' }),
    '--tree-accent: transparent; --tree-text: ;'
  );
});

test('применяет переданный цвет к accent и text', () => {
  assert.equal(
    getTreeItemAccentStyle({ color: '#8ec07c' }),
    '--tree-accent: #8ec07c; --tree-text: #8ec07c;'
  );
});

test('использует кастомный fallback, если передан', () => {
  assert.equal(
    getTreeItemAccentStyle({ color: null, fallback: 'red' }),
    '--tree-accent: red; --tree-text: ;'
  );
});

test('игнорирует не-строковые значения color', () => {
  assert.equal(
    getTreeItemAccentStyle({ color: 0 }),
    '--tree-accent: transparent; --tree-text: ;'
  );
  assert.equal(
    getTreeItemAccentStyle({ color: undefined }),
    '--tree-accent: transparent; --tree-text: ;'
  );
});
