import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFileName, fileNameProblem, safePathName, toSafeFileName } from './utils.js';

test('обычные имена, в том числе по-русски и с пробелами, проходят', () => {
  for (const name of ['Заметка про чай', 'Plan Q4', 'a.b.md', 'Daily 2026-10-14 08-40-12.md', 'Пункт (1) & [2]']) {
    assert.equal(fileNameProblem(name), null, name);
  }
});

test('символы, которых нет в Windows, не проходят', () => {
  for (const name of ['Plan: Q4', 'a/b', 'a\\b', 'what?', 'star*', 'pipe|x', 'lt<gt>', 'quote"x', 'ctrl\u0001']) {
    assert.equal(fileNameProblem(name), 'forbidden-characters', name);
  }
});

test('точка и пробел в конце не проходят, в середине — можно', () => {
  assert.equal(fileNameProblem('Plan.'), 'edge-dot-or-space');
  assert.equal(fileNameProblem('Plan '), 'edge-dot-or-space');
  assert.equal(fileNameProblem('Plan.v2'), null);
});

test('зарезервированные имена Windows не проходят, даже с расширением', () => {
  for (const name of ['CON', 'con', 'NUL.md', 'com1', 'LPT9.txt']) {
    assert.equal(fileNameProblem(name), 'reserved', name);
  }
  assert.equal(fileNameProblem('Console'), null);
});

test('длина считается в байтах UTF-8: кириллица весит два байта', () => {
  assert.equal(fileNameProblem('а'.repeat(100)), null, '200 байт — ещё можно');
  assert.equal(fileNameProblem('а'.repeat(101)), 'too-long');
  assert.equal(fileNameProblem('a'.repeat(200)), null);
  assert.equal(fileNameProblem('a'.repeat(201)), 'too-long');
});

test('пустое имя не проходит', () => {
  assert.equal(fileNameProblem('   '), 'empty');
  assert.equal(fileNameProblem(''), 'empty');
});

test('assertFileName отдаёт 400 с понятным текстом', () => {
  assert.throws(
    () => assertFileName('Plan: Q4'),
    (error) => error.statusCode === 400 && /must not contain these characters/.test(error.message),
  );
  assert.equal(assertFileName('Plan Q4'), 'Plan Q4');
});

test('toSafeFileName заменяет запрещённое и не даёт пустого имени', () => {
  assert.equal(toSafeFileName('Plan: Q4 / draft?'), 'Plan_ Q4 _ draft_');
  assert.equal(toSafeFileName('  Plan.  '), 'Plan');
  assert.equal(toSafeFileName(':::'), '___');
  assert.equal(toSafeFileName('', 'clip'), 'clip');
});

test('safePathName сохраняет прежние проверки и добавляет правило символов', () => {
  assert.throws(() => safePathName('a/b'), (error) => error.statusCode === 400);
  assert.throws(() => safePathName('Plan: Q4'), (error) => error.statusCode === 400);
  assert.equal(safePathName('Plan Q4.md'), 'Plan Q4.md');
});
