import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSameOrDescendant,
  basename,
  parentPath,
  displayNoteName,
  renameInputName,
  fileExtension,
  replacePathPrefix,
} from './sidebar-utils.js';

test('isSameOrDescendant exact match', () => {
  assert.equal(isSameOrDescendant('a/b', 'a/b'), true);
});

test('isSameOrDescendant descendant', () => {
  assert.equal(isSameOrDescendant('a/b/c', 'a/b'), true);
});

test('isSameOrDescendant sibling not match', () => {
  assert.equal(isSameOrDescendant('a/c', 'a/b'), false);
});

test('basename возвращает последний сегмент', () => {
  assert.equal(basename('folder/note.md'), 'note.md');
  assert.equal(basename('note.md'), 'note.md');
  assert.equal(basename(''), '');
});

test('parentPath возвращает всё кроме последнего', () => {
  assert.equal(parentPath('a/b/c.md'), 'a/b');
  assert.equal(parentPath('a/b'), 'a');
  assert.equal(parentPath('a'), '');
});

test('displayNoteName убирает .md', () => {
  assert.equal(displayNoteName('Inbox.md'), 'Inbox');
  assert.equal(displayNoteName('README.MD'), 'README');
  assert.equal(displayNoteName('plain'), 'plain');
});

test('renameInputName убирает .md только для файлов', () => {
  assert.equal(renameInputName('note.md', false), 'note');
  assert.equal(renameInputName('folder', true), 'folder');
});

test('fileExtension возвращает последнее расширение', () => {
  assert.equal(fileExtension('note.md'), '.md');
  assert.equal(fileExtension('archive.tar.gz'), '.gz');
  assert.equal(fileExtension('plain'), '');
});

test('replacePathPrefix exact match', () => {
  assert.equal(replacePathPrefix('old', 'old', 'new'), 'new');
});

test('replacePathPrefix descendant', () => {
  assert.equal(replacePathPrefix('old/sub/note.md', 'old', 'new'), 'new/sub/note.md');
});

test('replacePathPrefix unrelated path', () => {
  assert.equal(replacePathPrefix('other/path', 'old', 'new'), 'other/path');
});
