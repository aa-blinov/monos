import test from 'node:test';
import assert from 'node:assert/strict';
import { findNoteLinks, notePathsOf } from './terminal-links.js';

const notes = new Set(['Работа/Планёрка 14 октября.md', 'Идеи.md', 'Plan.md', 'Work/Plan.md']);

test('путь с пробелами и кириллицей находится целиком', () => {
  const line = 'Updated Работа/Планёрка 14 октября.md and Идеи.md.';
  const links = findNoteLinks(line, notes);
  assert.deepEqual(links.map((l) => [line.slice(l.start, l.end), l.path]), [
    ['Работа/Планёрка 14 октября.md', 'notes/Работа/Планёрка 14 октября.md'],
    ['Идеи.md', 'notes/Идеи.md'],
  ]);
});

test('самое длинное совпадение и пути в кавычках, ./ и полные', () => {
  assert.equal(findNoteLinks('edit Work/Plan.md', notes)[0].path, 'notes/Work/Plan.md');
  assert.equal(findNoteLinks('wrote "./Идеи.md"', notes)[0].path, 'notes/Идеи.md');
  assert.equal(findNoteLinks('saved /Users/a/Notes/Work/Plan.md', notes, '/Users/a/Notes')[0].path, 'notes/Work/Plan.md');
});

test('не заметки и куски слов не становятся ссылками', () => {
  assert.deepEqual(findNoteLinks('README.md missing.md and Plan.mdx', notes), []);
  assert.deepEqual(findNoteLinks('no links here', notes), []);
});

test('пути заметок из дерева', () => {
  const tree = { path: 'notes', is_dir: true, children: [{ path: 'notes/Идеи.md', is_dir: false }, { path: 'notes/Work', is_dir: true, children: [{ path: 'notes/Work/Plan.md', is_dir: false }] }] };
  assert.deepEqual([...notePathsOf(tree)].sort(), ['Work/Plan.md', 'Идеи.md']);
});
