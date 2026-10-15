import test from 'node:test';
import assert from 'node:assert/strict';
import { findConflictCopies } from './conflict-copies.js';

const note = (path, content = `text of ${path}`) => ({ path, content });

test('копия Dropbox и копия Syncthing находятся рядом с оригиналом и ссылаются на него', () => {
  const copies = findConflictCopies([
    note('notes/Plan.md'),
    note('notes/Plan (conflicted copy 2026-10-15 MacBook).md'),
    note('notes/Work/Ideas.md'),
    note('notes/Work/Ideas.sync-conflict-20261015-123456-ABCDEFG.md'),
  ]);
  assert.deepEqual(copies, [
    { path: 'notes/Plan (conflicted copy 2026-10-15 MacBook).md', original: 'notes/Plan.md', kind: 'conflict' },
    { path: 'notes/Work/Ideas.sync-conflict-20261015-123456-ABCDEFG.md', original: 'notes/Work/Ideas.md', kind: 'conflict' },
  ]);
});

test('без оригинала рядом копия не распознаётся, и обычная заметка с похожим именем тоже', () => {
  const copies = findConflictCopies([
    note('notes/Plan (conflicted copy 2026-10-15 MacBook).md'),
    note('notes/Work-notes.md'),
    note('notes/Work.md'),
    note('notes/Chapter 2.md'),
    note('notes/Chapter.md', 'other text'),
  ]);
  assert.deepEqual(copies, []);
});

test('копия OneDrive с именем компьютера находится, а слово с маленькими буквами — нет', () => {
  const copies = findConflictCopies([
    note('notes/Plan.md'),
    note('notes/Plan-DESKTOP-AB12CD.md'),
    note('notes/Project-Plan.md'),
    note('notes/Project-Plan-DESKTOP-AB12.md'),
    note('notes/Plan-notes.md'),
  ]);
  assert.deepEqual(copies.map((copy) => copy.path), [
    'notes/Plan-DESKTOP-AB12CD.md',
    'notes/Project-Plan-DESKTOP-AB12.md',
  ]);
  assert.equal(copies[1].original, 'notes/Project-Plan.md');
});

test('копия iCloud «Plan 2» считается дубликатом только при том же тексте', () => {
  const same = findConflictCopies([note('notes/Plan.md', 'одно'), note('notes/Plan 2.md', 'одно')]);
  assert.deepEqual(same, [{ path: 'notes/Plan 2.md', original: 'notes/Plan.md', kind: 'duplicate' }]);
  const different = findConflictCopies([note('notes/Plan.md', 'одно'), note('notes/Plan 2.md', 'другое')]);
  assert.deepEqual(different, []);
});

test('заблокированные заметки (текст не читается) не сравниваются по тексту', () => {
  const copies = findConflictCopies([note('notes/Plan.md', ''), note('notes/Plan 2.md', '')]);
  assert.deepEqual(copies, []);
});

test('копия ищет оригинал только в своей папке', () => {
  const copies = findConflictCopies([
    note('notes/Plan.md'),
    note('notes/Work/Plan (conflicted copy 2026-10-15).md'),
  ]);
  assert.deepEqual(copies, []);
});
