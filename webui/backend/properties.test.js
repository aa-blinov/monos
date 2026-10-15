import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPropertyValue, isCustomPropertyKey, propertyText, readProperties } from './properties.js';

const sample = [
  '---',
  'title: Заголовок',
  'tags: [a]',
  'status: "draft"',
  'priority: 3',
  'due: 2026-12-01',
  'done: yes',
  'owners: [Ann, "Bo, Jr"]',
  'links:',
  '  - one',
  '  - "two"',
  'note: Plain words',
  '---',
  '',
  'Текст: priority: 9',
].join('\n');

test('readProperties читает типы значений и пропускает управляемые ключи', () => {
  assert.deepEqual(readProperties(sample), [
    { key: 'status', type: 'text', value: 'draft' },
    { key: 'priority', type: 'number', value: 3 },
    { key: 'due', type: 'date', value: '2026-12-01' },
    { key: 'done', type: 'checkbox', value: true },
    { key: 'owners', type: 'list', value: ['Ann', 'Bo, Jr'] },
    { key: 'links', type: 'list', value: ['one', 'two'] },
    { key: 'note', type: 'text', value: 'Plain words' },
  ]);
});

test('кавычки делают значение текстом: "yes" остаётся словом, а не флажком', () => {
  assert.deepEqual(readProperties('---\nflag: "yes"\n---\n'), [{ key: 'flag', type: 'text', value: 'yes' }]);
});

test('без шапки свойств нет', () => {
  assert.deepEqual(readProperties('просто текст\nstatus: draft'), []);
});

test('список, текст и число переживают запись и чтение обратно', () => {
  const owners = ['a, b', 'c"d'];
  const text = 'say "hi": ok';
  const content = [
    '---',
    `owners: ${formatPropertyValue('list', owners)}`,
    `note: ${formatPropertyValue('text', text)}`,
    `score: ${formatPropertyValue('number', '4.5')}`,
    '---',
    '',
  ].join('\n');
  const found = Object.fromEntries(readProperties(content).map((item) => [item.key, item.value]));
  assert.deepEqual(found.owners, owners);
  assert.equal(found.note, text);
  assert.equal(found.score, 4.5);
});

test('форматирование: число и флажок пишутся голыми, число-мусор и дата-мусор остаются текстом', () => {
  assert.equal(formatPropertyValue('number', '12'), '12');
  assert.equal(formatPropertyValue('number', 'много'), '"много"');
  assert.equal(formatPropertyValue('checkbox', true), 'true');
  assert.equal(formatPropertyValue('checkbox', false), 'false');
  assert.equal(formatPropertyValue('date', '2026-12-01'), '2026-12-01');
  assert.equal(formatPropertyValue('date', 'завтра'), '"завтра"');
  assert.equal(formatPropertyValue('list', 'x, , y'), '["x", "y"]');
});

test('значение для поиска: список через запятую, флажок словом', () => {
  assert.equal(propertyText({ type: 'list', value: ['a', 'b'] }), 'a, b');
  assert.equal(propertyText({ type: 'checkbox', value: false }), 'false');
  assert.equal(propertyText({ type: 'number', value: 7 }), '7');
});

test('управляемые ключи не считаются свойствами', () => {
  assert.equal(isCustomPropertyKey('Status'), true);
  assert.equal(isCustomPropertyKey('Title'), false);
  assert.equal(isCustomPropertyKey('aliases'), false);
  assert.equal(isCustomPropertyKey(''), false);
});
