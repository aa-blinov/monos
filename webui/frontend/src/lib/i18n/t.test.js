import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from './t.js';

const en = {
  app: {
    board: {
      title: 'Notes',
      welcome: 'Hello, {name}!',
    },
  },
  simple: 'A plain string',
};

const ru = {
  app: {
    board: {
      title: 'Заметки',
      welcome: 'Привет, {name}!',
    },
  },
  simple: 'Простая строка',
};

const dictionaries = { en, ru };

test('t() возвращает перевод по dot-path ключу', () => {
  const t = createTranslator(dictionaries, 'en');
  assert.equal(t('app.board.title'), 'Notes');
});

test('t() подставляет другой словарь по locale', () => {
  const t = createTranslator(dictionaries, 'ru');
  assert.equal(t('app.board.title'), 'Заметки');
});

test('t() принимает ключ массивом сегментов', () => {
  const t = createTranslator(dictionaries, 'en');
  assert.equal(t(['app', 'board', 'title']), 'Notes');
});

test('t() возвращает исходный ключ, если перевод отсутствует', () => {
  const t = createTranslator(dictionaries, 'en');
  assert.equal(t('app.missing.deep'), 'app.missing.deep');
});

test('t() возвращает исходный ключ, если словарь не содержит язык', () => {
  const t = createTranslator(dictionaries, 'de');
  assert.equal(t('app.board.title'), 'app.board.title');
});

test('t() интерполирует {name} из params', () => {
  const t = createTranslator(dictionaries, 'en');
  assert.equal(t('app.board.welcome', { name: 'Alex' }), 'Hello, Alex!');
});

test('t() не ломается без params, если в строке есть placeholder', () => {
  const t = createTranslator(dictionaries, 'en');
  assert.equal(t('app.board.welcome'), 'Hello, {name}!');
});

test('t() поддерживает несколько placeholders', () => {
  const dict = { msg: '{greet}, {name}! You have {count} items.' };
  const t = createTranslator({ en: dict }, 'en');
  assert.equal(t('msg', { greet: 'Hi', name: 'Sam', count: 3 }), 'Hi, Sam! You have 3 items.');
});

test('t() числовые params корректно подставляются', () => {
  const dict = { count: 'Total: {n}' };
  const t = createTranslator({ en: dict }, 'en');
  assert.equal(t('count', { n: 42 }), 'Total: 42');
});

test('t() возврат листового значения, не объекта', () => {
  const t = createTranslator(dictionaries, 'en');
  const result = t('simple');
  assert.equal(typeof result, 'string');
  assert.equal(result, 'A plain string');
});

test('t() работает с вложенной структурой через массив ключей', () => {
  const dict = { a: { b: { c: { d: 'deep' } } } };
  const t = createTranslator({ en: dict }, 'en');
  assert.equal(t(['a', 'b', 'c', 'd']), 'deep');
  assert.equal(t(['a', 'b', 'c', 'missing']), 'a.b.c.missing');
});

test('t() пустой ключ возвращает пустую строку fallback', () => {
  const t = createTranslator(dictionaries, 'en');
  assert.equal(t(''), '');
});

test('createTranslator использует fallback locale, если запрошенный отсутствует', () => {
  const t = createTranslator({ en }, 'fr', { fallbackLocale: 'en' });
  assert.equal(t('app.board.title'), 'Notes');
});

test('createTranslator возвращает функцию с зафиксированным locale', () => {
  const t = createTranslator(dictionaries, 'en');
  assert.equal(t('simple'), 'A plain string');
});

test('t() безопасно обрабатывает null/undefined key', () => {
  const t = createTranslator(dictionaries, 'en');
  assert.equal(t(null), 'null');
  assert.equal(t(undefined), 'undefined');
});

test('t() подставляет 0 и false как обычные значения', () => {
  const dict = { n: 'count: {n}', b: 'flag: {b}' };
  const t = createTranslator({ en: dict }, 'en');
  assert.equal(t('n', { n: 0 }), 'count: 0');
  assert.equal(t('b', { b: false }), 'flag: false');
});

test('t() не падает на пустой строке в params', () => {
  const dict = { msg: 'Hi, {name}!' };
  const t = createTranslator({ en: dict }, 'en');
  assert.equal(t('msg', { name: '' }), 'Hi, !');
});

test('t() не подставляет placeholder, если param не передан', () => {
  const dict = { msg: 'Hi, {name}! You have {count} items.' };
  const t = createTranslator({ en: dict }, 'en');
  assert.equal(t('msg', { name: 'Sam' }), 'Hi, Sam! You have {count} items.');
});
