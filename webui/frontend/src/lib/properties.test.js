import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCalendarDate,
  propertyInputText,
  propertyInputType,
  propertyName,
  propertyValueFrom,
} from './properties.js';

test('имя свойства: пробелы сворачиваются, управляемые ключи и знаки YAML отбрасываются', () => {
  assert.equal(propertyName('  due   date '), 'due date');
  assert.equal(propertyName('Status'), 'Status');
  assert.equal(propertyName('Title'), null);
  assert.equal(propertyName('aliases'), null);
  assert.equal(propertyName('a:b'), null);
  assert.equal(propertyName('-start'), null);
  assert.equal(propertyName('   '), null);
});

test('календарная дата: 2026-02-28 есть, 2026-02-30 нет', () => {
  assert.equal(isCalendarDate('2026-02-28'), true);
  assert.equal(isCalendarDate('2026-02-30'), false);
  assert.equal(isCalendarDate('2026-1-05'), false);
});

test('значение по типу из формы: число, дата, флажок, список и текст', () => {
  assert.equal(propertyValueFrom('number', ' 4.5 '), 4.5);
  assert.equal(propertyValueFrom('number', 'много'), null);
  assert.equal(propertyValueFrom('date', '2026-12-01'), '2026-12-01');
  assert.equal(propertyValueFrom('date', '2026-02-30'), null);
  assert.equal(propertyValueFrom('checkbox', 'yes'), true);
  assert.equal(propertyValueFrom('checkbox', true), true);
  assert.equal(propertyValueFrom('checkbox', 'maybe'), null);
  assert.deepEqual(propertyValueFrom('list', 'Ann, , Bo'), ['Ann', 'Bo']);
  assert.equal(propertyValueFrom('text', 'one\ntwo  '), 'one two');
});

test('текст в поле: список через запятую, остальное как есть', () => {
  assert.equal(propertyInputText({ type: 'list', value: ['Ann', 'Bo'] }), 'Ann, Bo');
  assert.equal(propertyInputText({ type: 'number', value: 3 }), '3');
  assert.equal(propertyInputText(null), '');
});

test('тип поля ввода: число и дата получают свой ввод, остальное текст', () => {
  assert.equal(propertyInputType('number'), 'number');
  assert.equal(propertyInputType('date'), 'date');
  assert.equal(propertyInputType('list'), 'text');
  assert.equal(propertyInputType('text'), 'text');
});
