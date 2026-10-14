import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteWikiTargets } from './utils.js';

test('[[старое]] и [[старое|подпись]] указывают на новое имя, подпись остаётся', () => {
  assert.deepEqual(
    rewriteWikiTargets('Смотри [[Old]] и [[Old|подпись]].', 'Old', 'New'),
    { content: 'Смотри [[New]] и [[New|подпись]].', count: 2 },
  );
});

test('пробелы вокруг имени сохраняются', () => {
  assert.equal(rewriteWikiTargets('[[ Old |подпись]] [[Old ]]', 'Old', 'New').content, '[[ New |подпись]] [[New ]]');
});

test('другие заметки с похожим именем не трогаются', () => {
  const text = '[[Old Notes]] [[Older]] [[old]] [[Title Old]] [[Old#раздел]]';
  assert.deepEqual(rewriteWikiTargets(text, 'Old', 'New'), { content: text, count: 0 });
});

test('ссылки в коде не меняются, ссылка вне кода меняется', () => {
  const text = '`[[Old]]`\n\n```\n[[Old]]\n```\n\nтекст [[Old]]';
  assert.deepEqual(rewriteWikiTargets(text, 'Old', 'New'), {
    content: '`[[Old]]`\n\n```\n[[Old]]\n```\n\nтекст [[New]]',
    count: 1,
  });
});

test('ссылка с кодом в подписи переписывается, код в подписи не меняется', () => {
  assert.deepEqual(rewriteWikiTargets('[[Old|см. `код`]]', 'Old', 'New'), {
    content: '[[New|см. `код`]]',
    count: 1,
  });
});

test('ссылка внутри двойных обратных кавычек не меняется', () => {
  assert.deepEqual(rewriteWikiTargets('``[[Old]]`` и [[Old]]', 'Old', 'New'), {
    content: '``[[Old]]`` и [[New]]',
    count: 1,
  });
});

test('имя сравнивается по NFC: разложенный и сложённый вид совпадают', () => {
  const decomposed = `[[${'café'.normalize('NFD')}]]`;
  assert.deepEqual(rewriteWikiTargets(decomposed, 'café', 'Tea'), { content: '[[Tea]]', count: 1 });
});

test('без совпадений текст возвращается тем же', () => {
  assert.deepEqual(rewriteWikiTargets('ничего не ссылается', 'Old', 'New'), {
    content: 'ничего не ссылается',
    count: 0,
  });
});

test('отступ-код после пустой строки не переписывается, абзац после него переписывается', () => {
  assert.deepEqual(rewriteWikiTargets('Текст.\n\n    [[Old]]\n\nЕщё [[Old]].', 'Old', 'New'), {
    content: 'Текст.\n\n    [[Old]]\n\nЕщё [[New]].',
    count: 1,
  });
});

test('подпункт списка с отступом переписывается: это не код', () => {
  assert.deepEqual(rewriteWikiTargets('- пункт\n\n    [[Old]] в подпункте\n', 'Old', 'New'), {
    content: '- пункт\n\n    [[New]] в подпункте\n',
    count: 1,
  });
});

test('продолжение абзаца с отступом переписывается: без пустой строки это не код', () => {
  assert.deepEqual(rewriteWikiTargets('Абзац [[Old]]\n    продолжение [[Old]]', 'Old', 'New'), {
    content: 'Абзац [[New]]\n    продолжение [[New]]',
    count: 2,
  });
});

test('блок отступом целиком остаётся как есть', () => {
  const text = '\n    [[Old]]\n    [[Old]]\n';
  assert.deepEqual(rewriteWikiTargets(text, 'Old', 'New'), { content: text, count: 0 });
});
