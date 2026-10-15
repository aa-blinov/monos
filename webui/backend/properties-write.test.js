import test from 'node:test';
import assert from 'node:assert/strict';
import { setFrontmatterProperty } from './frontmatter.js';
import {
  normalizePropertyKey,
  normalizePropertyType,
  normalizePropertyValue,
  parseStoredProperties,
  readProperties,
} from './properties.js';

test('новое свойство дописывается в шапку, остальные строки и тело не меняются', () => {
  const content = '---\ntitle: X\nstatus: draft\n---\n\nТело\n';
  assert.equal(
    setFrontmatterProperty(content, 'priority', { type: 'number', value: 3 }),
    '---\ntitle: X\nstatus: draft\npriority: 3\n---\n\nТело\n',
  );
});

test('существующее свойство заменяется на месте, его блочный список уходит вместе с ним', () => {
  const content = '---\nowners:\n  - Ann\n  - Bo\nstatus: draft\n---\n\nТело\n';
  assert.equal(
    setFrontmatterProperty(content, 'owners', { type: 'list', value: ['Cy'] }),
    '---\nowners: ["Cy"]\nstatus: draft\n---\n\nТело\n',
  );
});

test('удаление убирает ключ вместе со списком, остальное остаётся', () => {
  const content = '---\nowners:\n  - Ann\nstatus: draft\n---\n\nТело\n';
  assert.equal(setFrontmatterProperty(content, 'owners', null), '---\nstatus: draft\n---\n\nТело\n');
});

test('удаление несуществующего свойства не меняет файл', () => {
  const content = '---\ntitle: X\n---\n\nТело\n';
  assert.equal(setFrontmatterProperty(content, 'status', null), content);
});

test('у заметки без шапки она появляется, текст остаётся', () => {
  assert.equal(
    setFrontmatterProperty('Просто текст\n', 'done', { type: 'checkbox', value: true }),
    '---\ndone: true\n---\n\nПросто текст\n',
  );
});

test('BOM и CRLF остаются как были', () => {
  const content = '﻿---\r\ntitle: X\r\n---\r\n\r\nТело\r\n';
  assert.equal(
    setFrontmatterProperty(content, 'status', { type: 'text', value: 'open' }),
    '﻿---\r\ntitle: X\r\nstatus: "open"\r\n---\r\n\r\nТело\r\n',
  );
});

test('записанное свойство читается обратно с тем же типом и значением', () => {
  let content = '---\ntitle: X\n---\n\nТело\n';
  content = setFrontmatterProperty(content, 'due', { type: 'date', value: '2026-12-01' });
  content = setFrontmatterProperty(content, 'owners', { type: 'list', value: ['Ann', 'Bo, Jr'] });
  content = setFrontmatterProperty(content, 'done', { type: 'checkbox', value: false });
  assert.deepEqual(readProperties(content), [
    { key: 'due', type: 'date', value: '2026-12-01' },
    { key: 'owners', type: 'list', value: ['Ann', 'Bo, Jr'] },
    { key: 'done', type: 'checkbox', value: false },
  ]);
});

test('имя свойства: управляемые ключи и знаки, которые ломают YAML, не принимаются', () => {
  assert.equal(normalizePropertyKey('  due   date '), 'due date');
  assert.equal(normalizePropertyKey('Status'), 'Status');
  assert.equal(normalizePropertyKey('title'), null);
  assert.equal(normalizePropertyKey('Tags'), null);
  assert.equal(normalizePropertyKey('a:b'), null);
  assert.equal(normalizePropertyKey('"quoted"'), null);
  assert.equal(normalizePropertyKey(''), null);
  assert.equal(normalizePropertyKey(undefined), null);
});

test('тип и значение проверяются по типу', () => {
  assert.equal(normalizePropertyType('number'), 'number');
  assert.equal(normalizePropertyType('url'), null);
  assert.equal(normalizePropertyValue('number', 'abc'), null);
  assert.equal(normalizePropertyValue('number', '4.5'), 4.5);
  assert.equal(normalizePropertyValue('date', '2026-02-30'), null);
  assert.equal(normalizePropertyValue('date', '2026-02-28'), '2026-02-28');
  assert.equal(normalizePropertyValue('checkbox', 'yes'), true);
  assert.equal(normalizePropertyValue('checkbox', 'maybe'), null);
  assert.deepEqual(normalizePropertyValue('list', 'a, b,, c'), ['a', 'b', 'c']);
  assert.equal(normalizePropertyValue('text', 'one\ntwo'), 'one two');
});

test('сохранённые свойства читаются из колонки индекса, испорченная колонка даёт пусто', () => {
  assert.deepEqual(parseStoredProperties('[{"key":"a","type":"text","value":"b"}]'), [{ key: 'a', type: 'text', value: 'b' }]);
  assert.deepEqual(parseStoredProperties('{bad'), []);
  assert.deepEqual(parseStoredProperties(null), []);
});
