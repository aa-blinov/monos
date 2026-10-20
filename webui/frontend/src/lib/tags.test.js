import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTagStats } from './tags.js';

const stats = [
  { tag: 'общий', count: 2 },
  { tag: 'работа', count: 1 },
  { tag: 'срочно', count: 1 },
];

test('без фильтра показываются все теги в исходном порядке', () => {
  assert.deepEqual(filterTagStats(stats, ''), stats);
  assert.deepEqual(filterTagStats(stats, '   '), stats);
});

test('фильтр ищет подстроку в любом регистре', () => {
  assert.deepEqual(filterTagStats(stats, 'СРО'), [{ tag: 'срочно', count: 1 }]);
  assert.deepEqual(filterTagStats(stats, 'общ'), [{ tag: 'общий', count: 2 }]);
});

test('фильтр ловит начало слова — так ищут по русским тегам', () => {
  assert.deepEqual(filterTagStats(stats, 'ра'), [{ tag: 'работа', count: 1 }]);
});

test('под фильтр ничего не подошёл — пустой список, а не весь', () => {
  assert.deepEqual(filterTagStats(stats, 'нет-такого'), []);
});

test('пустой и битый вход не ломают фильтр', () => {
  assert.deepEqual(filterTagStats(null, 'x'), []);
  assert.deepEqual(filterTagStats(undefined, ''), []);
});
