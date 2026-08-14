import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWikiLink, formatWikiLink, findWikiLinks } from './wiki-links.js';

test('parseWikiLink извлекает target без alias', () => {
  assert.deepEqual(parseWikiLink('[[Note Name]]'), { target: 'Note Name', alias: null });
});

test('parseWikiLink извлекает target и alias, разделённые |', () => {
  assert.deepEqual(parseWikiLink('[[Note Name|Display Text]]'), { target: 'Note Name', alias: 'Display Text' });
});

test('parseWikiLink возвращает null для обычного текста', () => {
  assert.equal(parseWikiLink('plain text without brackets'), null);
});

test('parseWikiLink возвращает null для незакрытого link', () => {
  assert.equal(parseWikiLink('[[unclosed'), null);
});

test('parseWikiLink возвращает null для пустого target', () => {
  assert.equal(parseWikiLink('[[]]'), null);
  assert.equal(parseWikiLink('[[  ]]'), null);
});

test('parseWikiLink возвращает null для закрывающих скобок без открывающих', () => {
  assert.equal(parseWikiLink('text ]]'), null);
});

test('parseWikiLink тримит пробелы вокруг target и alias', () => {
  assert.deepEqual(parseWikiLink('[[  Note Name  ]]'), { target: 'Note Name', alias: null });
  assert.deepEqual(parseWikiLink('[[ Note | Display ]]'), { target: 'Note', alias: 'Display' });
});

test('parseWikiLink сохраняет пробелы внутри target и alias', () => {
  assert.deepEqual(parseWikiLink('[[My Note Name]]'), { target: 'My Note Name', alias: null });
});

test('parseWikiLink разделяет только по первой |', () => {
  assert.deepEqual(parseWikiLink('[[Path|to|something]]'), { target: 'Path', alias: 'to|something' });
});

test('parseWikiLink работает с путями', () => {
  assert.deepEqual(parseWikiLink('[[folder/note.md]]'), { target: 'folder/note.md', alias: null });
});

test('formatWikiLink создаёт [[Target]]', () => {
  assert.equal(formatWikiLink('Note Name'), '[[Note Name]]');
});

test('formatWikiLink создаёт [[Target|Alias]]', () => {
  assert.equal(formatWikiLink('Note Name', 'Display'), '[[Note Name|Display]]');
});

test('formatWikiLink не добавляет alias=null как пустую строку', () => {
  assert.equal(formatWikiLink('Note', null), '[[Note]]');
  assert.equal(formatWikiLink('Note', ''), '[[Note]]');
});

test('parseWikiLink и formatWikiLink round-trip', () => {
  const original = '[[My Note]]';
  const parsed = parseWikiLink(original);
  assert.equal(formatWikiLink(parsed.target, parsed.alias), original);

  const withAlias = '[[Path|Display]]';
  const parsedAlias = parseWikiLink(withAlias);
  assert.equal(formatWikiLink(parsedAlias.target, parsedAlias.alias), withAlias);
});

test('parseWikiLink возвращает null для не-строк', () => {
  assert.equal(parseWikiLink(null), null);
  assert.equal(parseWikiLink(undefined), null);
  assert.equal(parseWikiLink(123), null);
});

test('parseWikiLink обрабатывает несколько link подряд', () => {
  const text = 'See [[One]] and [[Two|Display]] and [[Three]].';
  assert.deepEqual(parseWikiLink('[[One]]'), { target: 'One', alias: null });
  assert.deepEqual(parseWikiLink('[[Two|Display]]'), { target: 'Two', alias: 'Display' });
  assert.deepEqual(parseWikiLink('[[Three]]'), { target: 'Three', alias: null });
});

test('findWikiLinks находит все wiki-link в тексте', () => {
  const text = 'See [[One]] and [[Two|Display]] and [[Three]].';
  assert.deepEqual(findWikiLinks(text), [
    { target: 'One', alias: null },
    { target: 'Two', alias: 'Display' },
    { target: 'Three', alias: null },
  ]);
});

test('findWikiLinks возвращает пустой массив, если link нет', () => {
  assert.deepEqual(findWikiLinks('plain text'), []);
  assert.deepEqual(findWikiLinks(''), []);
});

test('findWikiLinks пропускает невалидные link (пустой target, незакрытые)', () => {
  const text = '[[Good]] and [[]] and [[Bad|Alias]] and [[Unclosed';
  assert.deepEqual(findWikiLinks(text), [
    { target: 'Good', alias: null },
    { target: 'Bad', alias: 'Alias' },
  ]);
});

test('findWikiLinks дедуплицирует одинаковые target', () => {
  const text = '[[Note]] and [[Note]] and [[Note|Display]].';
  assert.deepEqual(findWikiLinks(text), [
    { target: 'Note', alias: null },
    { target: 'Note', alias: 'Display' },
  ]);
});
