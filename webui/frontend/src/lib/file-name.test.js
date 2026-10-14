import test from 'node:test';
import assert from 'node:assert/strict';
import { fileNameProblem } from './file-name.js';

test('обычные имена проходят, в том числе по-русски', () => {
  for (const name of ['Заметка про чай', 'Plan Q4', 'Daily 14.10.2026 08-40-12', 'Пункт (1) & [2]']) {
    assert.equal(fileNameProblem(name), null, name);
  }
});

test('символы, которых нет в Windows, не проходят', () => {
  for (const name of ['Plan: Q4', 'a/b', 'a\\b', 'what?', 'star*', 'pipe|x', 'lt<gt>', 'quote"x']) {
    assert.equal(fileNameProblem(name), 'forbidden-characters', name);
  }
});

test('точка и пробел в конце не проходят', () => {
  assert.equal(fileNameProblem('Plan.'), 'edge-dot-or-space');
  assert.equal(fileNameProblem('Plan '), 'edge-dot-or-space');
  assert.equal(fileNameProblem('Plan.v2'), null);
});

test('зарезервированные имена Windows не проходят', () => {
  assert.equal(fileNameProblem('CON'), 'reserved');
  assert.equal(fileNameProblem('lpt1'), 'reserved');
  assert.equal(fileNameProblem('Console'), null);
});

test('длина в байтах UTF-8, как на сервере', () => {
  assert.equal(fileNameProblem('а'.repeat(100)), null);
  assert.equal(fileNameProblem('а'.repeat(101)), 'too-long');
});

test('пустое имя', () => {
  assert.equal(fileNameProblem('   '), 'empty');
  assert.equal(fileNameProblem(undefined), 'empty');
});
