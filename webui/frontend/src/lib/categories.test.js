import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalCategory, filterCategories, normalizeCategory } from './categories.js';

const SUGGESTIONS = [
  { name: 'Work', count: 12 },
  { name: 'Ideas', count: 5 },
  { name: 'Network', count: 2 },
  { name: 'Daily log', count: 1 },
];

test('normalizeCategory: убирает лишние пробелы по краям и внутри', () => {
  assert.equal(normalizeCategory('  Work   notes '), 'Work notes');
  assert.equal(normalizeCategory(null), '');
  assert.equal(normalizeCategory('   '), '');
});

test('canonicalCategory: регистр берётся из уже существующей категории', () => {
  assert.equal(canonicalCategory('work', SUGGESTIONS), 'Work');
  assert.equal(canonicalCategory('  IDEAS ', SUGGESTIONS), 'Ideas');
});

test('canonicalCategory: новое название сохраняется как введено, пустое — пустая строка', () => {
  assert.equal(canonicalCategory(' Reading  list ', SUGGESTIONS), 'Reading list');
  assert.equal(canonicalCategory('   ', SUGGESTIONS), '');
  assert.equal(canonicalCategory('Anything'), 'Anything');
});

test('filterCategories: пустой запрос даёт самые частые категории', () => {
  assert.deepEqual(filterCategories(SUGGESTIONS, '', 2).map((c) => c.name), ['Work', 'Ideas']);
});

test('filterCategories: совпадение в начале идёт раньше совпадения внутри', () => {
  // «wo» есть и в «Work» (начало), и в «Network» (внутри): «Work» первым.
  assert.deepEqual(filterCategories(SUGGESTIONS, 'wo').map((c) => c.name), ['Work', 'Network']);
});

test('filterCategories: регистр запроса не важен, лишнее отбрасывается', () => {
  assert.deepEqual(filterCategories(SUGGESTIONS, 'DAILY').map((c) => c.name), ['Daily log']);
  assert.deepEqual(filterCategories(SUGGESTIONS, 'zzz'), []);
});
