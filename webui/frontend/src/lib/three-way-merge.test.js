import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeThreeWay } from './three-way-merge.js';
import { parseConflictRegions } from './conflict-markers.js';

const base = 'Заголовок\n\nПервый абзац.\n\nВторой абзац.\n\nТретий абзац.\n';

test('правки в разных местах сводятся без конфликта', () => {
  const ours = base.replace('Первый абзац.', 'Первый абзац, дополненный здесь.');
  const theirs = base.replace('Третий абзац.', 'Третий абзац с телефона.');
  const merged = mergeThreeWay(base, ours, theirs);
  assert.equal(merged.conflicts, 0);
  assert.equal(merged.text, 'Заголовок\n\nПервый абзац, дополненный здесь.\n\nВторой абзац.\n\nТретий абзац с телефона.\n');
});

test('дописанное в конец на одной стороне и правка в середине на другой', () => {
  const ours = `${base}Новая строка в конце.\n`;
  const theirs = base.replace('Второй абзац.', 'Второй абзац, исправленный.');
  const merged = mergeThreeWay(base, ours, theirs);
  assert.equal(merged.conflicts, 0);
  assert.match(merged.text, /исправленный[\s\S]*Новая строка в конце/);
});

test('разные правки одного места дают конфликт, который читает экран разбора', () => {
  const ours = base.replace('Второй абзац.', 'Второй абзац — моя версия.');
  const theirs = base.replace('Второй абзац.', 'Второй абзац — версия телефона.');
  const merged = mergeThreeWay(base, ours, theirs, { ours: 'Ноутбук', theirs: 'Телефон' });
  assert.equal(merged.conflicts, 1);
  const [region] = parseConflictRegions(merged.text);
  assert.equal(region.ours, 'Второй абзац — моя версия.');
  assert.equal(region.theirs, 'Второй абзац — версия телефона.');
  assert.equal(region.base, 'Второй абзац.');
  assert.match(merged.text, /^Заголовок\n\nПервый абзац\.\n\n<{7} Ноутбук\n/);
});

test('одинаковая правка на обеих сторонах берётся один раз', () => {
  const edited = base.replace('Первый', 'Самый первый');
  assert.deepEqual(mergeThreeWay(base, edited, edited), { text: edited, conflicts: 0 });
});

test('ничего не изменилось у одной стороны — берётся другая целиком', () => {
  const theirs = 'Совсем другой текст.\n';
  assert.deepEqual(mergeThreeWay(base, base, theirs), { text: theirs, conflicts: 0 });
});
