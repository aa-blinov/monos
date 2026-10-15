import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchQuery, searchEntries } from './search.js';

const note = (name, properties) => ({
  path: `notes/${name}.md`,
  name: `${name}.md`,
  title: '',
  content: 'текст',
  tags: '[]',
  modified_at: '2026-10-01',
  props: properties === undefined ? '[]' : JSON.stringify(properties),
});

const entries = [
  note('alpha', [
    { key: 'status', type: 'text', value: 'done' },
    { key: 'priority', type: 'number', value: 3 },
    { key: 'due', type: 'date', value: '2026-11-01' },
    { key: 'done', type: 'checkbox', value: true },
    { key: 'owners', type: 'list', value: ['Ann', 'Bo'] },
  ]),
  note('beta', [
    { key: 'status', type: 'text', value: 'open' },
    { key: 'priority', type: 'number', value: 1 },
    { key: 'due', type: 'date', value: '2027-02-01' },
    { key: 'done', type: 'checkbox', value: false },
  ]),
  note('gamma', []),
  note('broken', undefined),
];

const found = (query) => searchEntries(entries, { query }).map((hit) => hit.path.split('/').pop()).sort();

test('prop: раскладывается в условия, в которых значение и исключения лежат раздельно', () => {
  assert.deepEqual(parseSearchQuery('prop:status=done -prop:owners=Ann').props, {
    values: ['status=done'],
    exclude: ['owners=ann'],
  });
});

test('равенство: текст без учёта регистра, число, флажок и элемент списка', () => {
  assert.deepEqual(found('prop:status=done'), ['alpha.md']);
  assert.deepEqual(found('prop:status=OPEN'), ['beta.md']);
  assert.deepEqual(found('prop:priority=1'), ['beta.md']);
  assert.deepEqual(found('prop:done=true'), ['alpha.md']);
  assert.deepEqual(found('prop:done=no'), ['beta.md']);
  assert.deepEqual(found('prop:owners=ann'), ['alpha.md']);
});

test('сравнение: числа по величине, даты по календарю', () => {
  assert.deepEqual(found('prop:priority>=3'), ['alpha.md']);
  assert.deepEqual(found('prop:priority<2'), ['beta.md']);
  assert.deepEqual(found('prop:due<2026-12-01'), ['alpha.md']);
  assert.deepEqual(found('prop:due>2026-12-01'), ['beta.md']);
  // Текст не сравнивается по величине: у него нет «больше».
  assert.deepEqual(found('prop:status>a'), []);
});

test('одно слово без знака равенства: свойство есть, и только оно', () => {
  assert.deepEqual(found('prop:status'), ['alpha.md', 'beta.md']);
  assert.deepEqual(found('prop:unknown'), []);
});

test('исключение и сочетание условий: все включающие держатся, ни одно исключающее', () => {
  assert.deepEqual(found('-prop:status=done'), ['beta.md', 'broken.md', 'gamma.md']);
  assert.deepEqual(found('prop:status=open prop:priority>0'), ['beta.md']);
  assert.deepEqual(found('prop:status prop:priority>5'), []);
});

test('испорченная колонка свойств не роняет поиск: у заметки свойств нет', () => {
  const broken = { ...note('broken', undefined), props: '{bad' };
  assert.deepEqual(searchEntries([broken], { query: 'prop:status' }), []);
  assert.deepEqual(searchEntries([broken], { query: '-prop:status' }).map((hit) => hit.path), ['notes/broken.md']);
});
