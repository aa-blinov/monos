import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractWikiLinks, writeFileAtomic } from './utils.js';

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

test('writeFileAtomic: при сбое записи старый текст остаётся на месте', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-atomic-'));
  try {
    const file = path.join(dir, 'Заметка.md');
    fs.writeFileSync(file, 'старый текст', 'utf-8');
    // A folder under the temporary file's name makes the write fail every time, without filling a disk.
    fs.mkdirSync(`${file}.tmp`);
    assert.throws(
      () => writeFileAtomic(file, 'новый текст', 'utf-8'),
      (error) => ['EISDIR', 'EPERM'].includes(error.code),
    );
    assert.equal(fs.readFileSync(file, 'utf-8'), 'старый текст');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
