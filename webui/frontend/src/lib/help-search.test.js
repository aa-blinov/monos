import test from 'node:test';
import assert from 'node:assert/strict';
import { plainText, searchHelp } from './help-search.js';

const sections = [
  { id: 'sync', title: 'Синхронизация', items: [
    { id: 'conflicts', title: 'Конфликты', body: 'Если **заметку** изменили на двух устройствах, Monos покажет обе версии.' },
    { id: 'github', title: 'Подключение GitHub', body: 'Нужен токен и приватный репозиторий. Конфликты разбираются в заметке.' },
  ] },
  { id: 'agent', title: 'Агент', items: [
    { id: 'terminal', title: 'Терминал', body: 'Откройте `⌘J`, запустите агента. Его ёлки и правки видны сразу.' },
  ] },
];

test('все слова запроса, совпадение в заголовке выше', () => {
  const results = searchHelp(sections, 'конфликты');
  assert.deepEqual(results.map((r) => r.itemId), ['conflicts', 'github']);
  assert.deepEqual(searchHelp(sections, 'конфликты токен').map((r) => r.itemId), ['github']);
});

test('ё читается как е, разметка не мешает, есть отрывок вокруг совпадения', () => {
  const [result] = searchHelp(sections, 'елки');
  assert.equal(result.itemId, 'terminal');
  assert.match(result.excerpt, /ёлки/);
  assert.equal(searchHelp(sections, 'заметку обе')[0].itemId, 'conflicts');
  assert.equal(plainText('Откройте `⌘J` и **агента**'), 'Откройте ⌘J и агента');
});

test('пустой запрос и ничего не найдено', () => {
  assert.deepEqual(searchHelp(sections, '   '), []);
  assert.deepEqual(searchHelp(sections, 'квантовый'), []);
});
