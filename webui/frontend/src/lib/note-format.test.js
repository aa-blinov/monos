import test from 'node:test';
import assert from 'node:assert/strict';
import { displayNoteName, recentPathLabel } from './note-format.js';

test('displayNoteName берёт name без .md', () => {
  assert.equal(displayNoteName({ name: 'Inbox.md', path: 'notes/Inbox.md' }), 'Inbox');
});

test('displayNoteName вытаскивает из path если name нет', () => {
  assert.equal(displayNoteName({ path: 'folder/Work.md' }), 'Work');
});

test('displayNoteName безопасен для null/undefined', () => {
  assert.equal(displayNoteName(null), '');
  assert.equal(displayNoteName(undefined), '');
  assert.equal(displayNoteName({}), '');
});

test('recentPathLabel убирает notes/ префикс и .md', () => {
  assert.equal(recentPathLabel({ path: 'notes/Work/Project.md' }, '/'), 'Work');
});

test('recentPathLabel возвращает fallback для пустого/root', () => {
  assert.equal(recentPathLabel({ path: 'notes/root.md' }, 'root'), 'root');
  assert.equal(recentPathLabel({ path: '' }, 'fallback'), 'fallback');
});

test('recentPathLabel безопасен для null', () => {
  assert.equal(recentPathLabel(null, 'fb'), 'fb');
});
