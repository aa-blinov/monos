import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readSavedSearches, writeSavedSearches } from './saved-searches.js';

// Тесты работают в своей временной папке: конфиг приложения не трогаем.
const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-saved-searches-'));
const savedFile = () => path.join(baseDir, '.monos', 'saved-searches.json');

test.after(() => {
  fs.rmSync(baseDir, { recursive: true, force: true });
});

test('пусто, пока файл не создан', () => {
  assert.deepEqual(readSavedSearches(baseDir), []);
});

test('список переживает перезапуск: лежит на диске, а не в памяти', () => {
  writeSavedSearches([
    { name: 'Встречи', query: 'встреча' },
    { name: 'Дедлайны', query: 'updated:2026-10' },
  ], baseDir);

  assert.ok(fs.existsSync(savedFile()), 'файл должен лежать рядом с заметками');
  const reloaded = readSavedSearches(baseDir);
  assert.equal(reloaded.length, 2);
  assert.equal(reloaded[0].name, 'Встречи');
  assert.equal(reloaded[1].query, 'updated:2026-10');
  assert.ok(reloaded[0].id, 'у поиска должен быть идентификатор');
});

test('поиск без запроса не сохраняется', () => {
  const result = writeSavedSearches([
    { name: 'Пустой', query: '   ' },
    { name: 'Нормальный', query: 'текст' },
  ], baseDir);
  assert.equal(result.length, 1);
  assert.equal(result[0].query, 'текст');
});

test('поиск без имени берёт имя из запроса', () => {
  const result = writeSavedSearches([{ query: 'body:бюджет' }], baseDir);
  assert.equal(result[0].name, 'body:бюджет');
});

test('длинный запрос обрезается', () => {
  const result = writeSavedSearches([{ name: 'Длинный', query: 'x'.repeat(2000) }], baseDir);
  assert.equal(result[0].query.length, 500);
  assert.equal(readSavedSearches(baseDir)[0].query.length, 500);
});

test('поддержан и объект со списком, и голый массив', () => {
  writeSavedSearches({ searches: [{ name: 'Из объекта', query: 'проверка' }] }, baseDir);
  assert.equal(readSavedSearches(baseDir)[0].name, 'Из объекта');

  fs.writeFileSync(savedFile(), JSON.stringify([{ name: 'Из массива', query: 'проверка2' }]), 'utf-8');
  assert.equal(readSavedSearches(baseDir)[0].name, 'Из массива');
});

test('битый файл не роняет чтение', () => {
  fs.writeFileSync(savedFile(), '{ это не json', 'utf-8');
  assert.deepEqual(readSavedSearches(baseDir), []);

  fs.writeFileSync(savedFile(), JSON.stringify({ nonsense: true }), 'utf-8');
  assert.deepEqual(readSavedSearches(baseDir), []);
});

test('спецсимволы в названии не ломают файл', () => {
  const result = writeSavedSearches([{ name: 'Кавычки "и" \\ слэши', query: 'x' }], baseDir);
  assert.equal(readSavedSearches(baseDir)[0].name, 'Кавычки "и" \\ слэши');
  assert.equal(result[0].name, 'Кавычки "и" \\ слэши');
});

test('запись атомарна: временный файл не остаётся', () => {
  writeSavedSearches([{ name: 'А', query: 'a' }], baseDir);
  assert.ok(!fs.existsSync(`${savedFile()}.tmp`), 'временный файл должен быть переименован, а не оставлен');
});
