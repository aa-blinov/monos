import test from 'node:test';
import assert from 'node:assert/strict';
import { extractWikiLinks } from './utils.js';

test('extractWikiLinks находит обычные ссылки', () => {
  assert.deepEqual(
    extractWikiLinks('См. [[Настоящая заметка]] и [[Вторая, с алиасом]].'),
    ['Настоящая заметка', 'Вторая, с алиасом'],
  );
});

test('extractWikiLinks обрезает якорь и алиас', () => {
  assert.deepEqual(extractWikiLinks('[[Заметка#Раздел]]'), ['Заметка#Раздел']);
  assert.deepEqual(extractWikiLinks('[[Заметка|показать]]'), ['Заметка']);
});

test('extractWikiLinks игнорирует [[ ]] внутри блока кода', () => {
  const content = [
    'Обычный текст со ссылкой [[Настоящая заметка]].',
    '',
    '```bash',
    'if [[ -n "$BACKUP_TIMESTAMP" ]]; then',
    '  echo "[[Это не ссылка]]"',
    'fi',
    '```',
    '',
    'И ещё [[Вторая заметка]].',
  ].join('\n');
  assert.deepEqual(extractWikiLinks(content), ['Настоящая заметка', 'Вторая заметка']);
});

test('extractWikiLinks игнорирует [[ ]] в тильдовом блоке кода', () => {
  assert.deepEqual(extractWikiLinks('~~~\n[[не ссылка]]\n~~~\n[[ссылка]]'), ['ссылка']);
});

test('extractWikiLinks игнорирует [[ ]] в инлайн-коде', () => {
  assert.deepEqual(extractWikiLinks('Проверка `[[ -n "$X" ]]` прошла, см. [[Заметка]]'), ['Заметка']);
});

test('extractWikiLinks сохраняет обычные квадратные скобки', () => {
  assert.deepEqual(extractWikiLinks('Массив `a[0]` и [[Тут]]'), ['Тут']);
});

test('extractWikiLinks находит ссылку сразу за блоком кода', () => {
  const content = ['```', '[[скрыто]]', '```', '[[видно]]'].join('\n');
  assert.deepEqual(extractWikiLinks(content), ['видно']);
});

test('extractWikiLinks не теряет ссылки вокруг inline-кода', () => {
  assert.deepEqual(
    extractWikiLinks('До [[Раз]] `[[ -n "$X" ]]` после [[Два]]'),
    ['Раз', 'Два'],
  );
});