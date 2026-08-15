import test from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyScore, parseQuickSwitcherQuery, rankQuickSwitcherResults } from './quick-switcher.js';

test('fuzzyScore: exact match → самый высокий score', () => {
  const exact = fuzzyScore('hello', 'hello');
  const partial = fuzzyScore('hello', 'hell');
  const unrelated = fuzzyScore('hello', 'world');
  assert.ok(exact > partial);
  assert.ok(partial > unrelated);
});

test('fuzzyScore: пустая query → 0', () => {
  assert.equal(fuzzyScore('', 'hello'), 0);
});

test('fuzzyScore: пустая target → 0', () => {
  assert.equal(fuzzyScore('hello', ''), 0);
  assert.equal(fuzzyScore('hello', null), 0);
});

test('fuzzyScore: chars должны идти в правильном порядке', () => {
  const ok = fuzzyScore('abc', 'aXbXc');
  const wrong = fuzzyScore('abc', 'cba');
  assert.ok(ok > wrong, 'правильный порядок должен дать более высокий score');
});

test('fuzzyScore: case-insensitive', () => {
  const a = fuzzyScore('Hello', 'hello world');
  const b = fuzzyScore('hello', 'Hello World');
  assert.equal(a, b);
});

test('fuzzyScore: bonus за начало слова', () => {
  const start = fuzzyScore('pro', 'Project Brief');
  const middle = fuzzyScore('pro', 'My Project Brief');
  assert.ok(start > middle);
});

test('parseQuickSwitcherQuery: пустой ввод', () => {
  assert.deepEqual(parseQuickSwitcherQuery(''), { term: '', filters: {} });
  assert.deepEqual(parseQuickSwitcherQuery(null), { term: '', filters: {} });
});

test('parseQuickSwitcherQuery: простой текст', () => {
  const r = parseQuickSwitcherQuery('project brief');
  assert.equal(r.term, 'project brief');
  assert.deepEqual(r.filters, {});
});

test('parseQuickSwitcherQuery: фильтр по tag', () => {
  const r = parseQuickSwitcherQuery('tag:work project');
  assert.equal(r.term, 'project');
  assert.deepEqual(r.filters.tag, 'work');
});

test('parseQuickSwitcherQuery: фильтр по path', () => {
  const r = parseQuickSwitcherQuery('path:Projects/2026 brief');
  assert.equal(r.term, 'brief');
  assert.equal(r.filters.path, 'Projects/2026');
});

test('parseQuickSwitcherQuery: несколько фильтров', () => {
  const r = parseQuickSwitcherQuery('tag:work path:Daily task');
  assert.equal(r.term, 'task');
  assert.equal(r.filters.tag, 'work');
  assert.equal(r.filters.path, 'Daily');
});

test('parseQuickSwitcherQuery: quoted term', () => {
  const r = parseQuickSwitcherQuery('"exact phrase" tag:work');
  assert.equal(r.term, 'exact phrase');
  assert.equal(r.filters.tag, 'work');
});

test('rankQuickSwitcherResults: сортирует по score desc', () => {
  const notes = [
    { name: 'Daily Note', path: 'notes/Daily.md' },
    { name: 'Project Brief', path: 'notes/Project.md' },
    { name: 'Some Other', path: 'notes/Other.md' },
  ];
  const ranked = rankQuickSwitcherResults('project', notes);
  assert.ok(ranked[0].item.name === 'Project Brief');
  // "Daily Note" и "Some Other" не должны быть выше
  assert.ok(ranked[0].score > 0);
});

test('rankQuickSwitcherResults: пустой query → все с score 0', () => {
  const notes = [
    { name: 'A', path: 'a' },
    { name: 'B', path: 'b' },
  ];
  const ranked = rankQuickSwitcherResults('', notes);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].score, 0);
  assert.equal(ranked[1].score, 0);
});

test('rankQuickSwitcherResults: respects tag filter', () => {
  const notes = [
    { name: 'Daily Note', path: 'a', tags: ['daily'] },
    { name: 'Project Brief', path: 'b', tags: ['project'] },
  ];
  const ranked = rankQuickSwitcherResults('tag:project', notes);
  // "Project Brief" matches the filter, "Daily Note" doesn't
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].item.name, 'Project Brief');
});

test('rankQuickSwitcherResults: respects path filter', () => {
  const notes = [
    { name: 'Daily Note', path: 'notes/Daily/Note.md' },
    { name: 'Project Brief', path: 'notes/Project/Brief.md' },
  ];
  const ranked = rankQuickSwitcherResults('path:Project', notes);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].item.name, 'Project Brief');
});
