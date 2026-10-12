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

// --- extended operators -------------------------------------------------

const notes = [
  { name: 'Weekly Review', path: 'notes/base/Review.md', tags: ['work', 'habit'], metadata: { category: 'Journal', date: '2026-10-05' } },
  { name: 'Список дел', path: 'notes/base/Tasks.md', tags: ['work'], metadata: { category: 'Tasks', date: '2026-09-12' } },
  { name: 'Old Draft', path: 'notes/archive/2025/Draft.md', tags: ['archive'], metadata: { category: 'Journal', date: '2025-12-30' } },
];

test('tag: фильтрует по реальным тегам', () => {
  const hits = rankQuickSwitcherResults('tag:work', notes);
  assert.equal(hits.length, 2);
  assert.deepEqual(hits.map((h) => h.item.name).sort(), ['Weekly Review', 'Список дел']);
});

test('tag: без свободного термина всё равно возвращает результаты', () => {
  assert.equal(rankQuickSwitcherResults('tag:archive', notes).length, 1);
});

test('отсутствие тегов исключает заметку из tag:', () => {
  assert.equal(rankQuickSwitcherResults('tag:nothing', notes).length, 0);
});

test('повтор оператора расширяет выборку', () => {
  const parsed = parseQuickSwitcherQuery('tag:work tag:archive');
  assert.deepEqual(parsed.filters.tag, ['work', 'archive']);
  assert.equal(rankQuickSwitcherResults('tag:work tag:archive', notes).length, 3);
});

test('отрицание -tag: исключает', () => {
  const hits = rankQuickSwitcherResults('-tag:archive', notes);
  assert.equal(hits.length, 2);
  assert.ok(hits.every((h) => !h.item.tags.includes('archive')));
});

test('отрицание сочетается с положительным фильтром', () => {
  const hits = rankQuickSwitcherResults('tag:work -tag:archive', notes);
  assert.deepEqual(hits.map((h) => h.item.name), ['Weekly Review', 'Список дел']);
});

test('folder: ищет по папке, а не по имени файла', () => {
  const hits = rankQuickSwitcherResults('folder:archive', notes);
  assert.deepEqual(hits.map((h) => h.item.name), ['Old Draft']);
  assert.equal(rankQuickSwitcherResults('folder:base', notes).length, 2);
});

test('title: ищет по заголовку заметки', () => {
  assert.deepEqual(rankQuickSwitcherResults('title:Weekly', notes).map((h) => h.item.name), ['Weekly Review']);
});

test('category: читает категорию из метаданных', () => {
  assert.equal(rankQuickSwitcherResults('category:Journal', notes).length, 2);
  assert.deepEqual(rankQuickSwitcherResults('category:Tasks', notes).map((h) => h.item.name), ['Список дел']);
});

test('created: сравнивает по префиксу даты', () => {
  assert.deepEqual(rankQuickSwitcherResults('created:2026', notes).map((h) => h.item.name).sort(), ['Weekly Review', 'Список дел']);
  assert.deepEqual(rankQuickSwitcherResults('created:2026-10', notes).map((h) => h.item.name), ['Weekly Review']);
  assert.deepEqual(rankQuickSwitcherResults('created:2025', notes).map((h) => h.item.name), ['Old Draft']);
});

test('created: -created: как отрицание по префиксу', () => {
  assert.equal(rankQuickSwitcherResults('-created:2025', notes).length, 2);
});

test('неизвестный оператор остаётся поисковым термином', () => {
  const parsed = parseQuickSwitcherQuery('author:me draft');
  assert.equal(parsed.term, 'author:me draft');
  assert.deepEqual(parsed.filters, {});
});

test('термин соединяется с фильтрами', () => {
  const hits = rankQuickSwitcherResults('tag:work weekly', notes);
  assert.deepEqual(hits.map((h) => h.item.name), ['Weekly Review']);
});

test('теги читаются из metadata, когда item.tags отсутствует', () => {
  const item = { name: 'X', path: 'notes/x.md', metadata: { tags: ['from-meta'] } };
  assert.equal(rankQuickSwitcherResults('tag:from-meta', [item]).length, 1);
});
