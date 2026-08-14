import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveQuickNoteRename } from './quick-note-rename.js';

test('возвращает null если имя не изменилось (без учёта расширения)', () => {
  assert.equal(resolveQuickNoteRename('15-08-26-00-05-53', '15-08-26-00-05-53'), null);
  assert.equal(resolveQuickNoteRename('15-08-26-00-05-53.md', '15-08-26-00-05-53'), null);
  assert.equal(resolveQuickNoteRename('15-08-26-00-05-53', '15-08-26-00-05-53.md'), null);
});

test('возвращает null если новое имя пустое или только пробелы', () => {
  assert.equal(resolveQuickNoteRename('foo', ''), null);
  assert.equal(resolveQuickNoteRename('foo', '   '), null);
  assert.equal(resolveQuickNoteRename('foo', null), null);
  assert.equal(resolveQuickNoteRename('foo', undefined), null);
});

test('возвращает null для пустого текущего имени', () => {
  assert.equal(resolveQuickNoteRename('', 'something'), null);
  assert.equal(resolveQuickNoteRename(null, 'something'), null);
});

test('возвращает новое имя с расширением если оно изменилось', () => {
  assert.equal(resolveQuickNoteRename('foo', 'bar'), 'bar.md');
  assert.equal(resolveQuickNoteRename('foo', 'bar.md'), 'bar.md');
});

test('trim пробелов вокруг нового имени', () => {
  assert.equal(resolveQuickNoteRename('foo', '  bar  '), 'bar.md');
});

test('сравнение case-insensitive — Foo и foo считаются одинаковыми', () => {
  assert.equal(resolveQuickNoteRename('Foo', 'foo'), null);
  assert.equal(resolveQuickNoteRename('FOO', 'foo'), null);
});

test('поддерживает кастомное расширение', () => {
  assert.equal(resolveQuickNoteRename('foo', 'bar', '.txt'), 'bar.txt');
  assert.equal(resolveQuickNoteRename('foo.md', 'bar', '.md'), 'bar.md');
});

test('не дублирует расширение если оно уже есть (в любом регистре)', () => {
  // расширение нормализуется в lowercase, чтобы избежать Foo.MD и foo.md
  // на одной машине (файловые системы case-insensitive на macOS/Windows)
  assert.equal(resolveQuickNoteRename('foo', 'bar.MD'), 'bar.md');
  assert.equal(resolveQuickNoteRename('foo', 'bar.md', '.md'), 'bar.md');
});
