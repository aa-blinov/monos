import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceTabs, normalizeTabsSetting } from './tabs.js';

test('replaceTabs: выключено — текст не меняется', () => {
  assert.equal(replaceTabs('\t- a', 'off'), '\t- a');
  assert.equal(replaceTabs('\t- a', undefined), '\t- a');
});

test('replaceTabs: отступы списка и табы внутри строки идут до ближайшей позиции табуляции', () => {
  assert.equal(replaceTabs('- a\n\t- b\n\t\t- c', '4'), '- a\n    - b\n        - c');
  assert.equal(replaceTabs('\t- b', '2'), '  - b');
  assert.equal(replaceTabs('ab\tc', '4'), 'ab  c');
  assert.equal(replaceTabs('abcd\te', '4'), 'abcd    e');
});

test('replaceTabs: код в ограждении остаётся с табами', () => {
  const text = '\ta\n```make\nall:\n\tgo build\n```\n\tb\n~~~\n\tx\n~~~';
  assert.equal(replaceTabs(text, '4'), '    a\n```make\nall:\n\tgo build\n```\n    b\n~~~\n\tx\n~~~');
});

test('normalizeTabsSetting: неизвестное значение — выключено', () => {
  assert.equal(normalizeTabsSetting('8'), 'off');
  assert.equal(normalizeTabsSetting('4'), '4');
});

test('saveFileContent: при включённой настройке в файл уходят пробелы', async () => {
  const { saveFileContent } = await import('./editor-api.js');
  const { tabsToSpaces } = await import('./tabs.js');
  const realFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (url, options) => {
    bodies.push(JSON.parse(options.body));
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    tabsToSpaces.set('4');
    await saveFileContent('a.md', '\t- x');
    tabsToSpaces.set('off');
    await saveFileContent('a.md', '\t- x');
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(bodies[0].content, '    - x');
  assert.equal(bodies[1].content, '\t- x');
});
