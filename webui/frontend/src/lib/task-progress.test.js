import test from 'node:test';
import assert from 'node:assert/strict';
import { taskProgress, formatTaskProgress } from './task-progress.js';

test('пустая заметка не показывает прогресс', () => {
  assert.deepEqual(taskProgress(''), { total: 0, done: 0, percent: 0, isComplete: false });
  assert.deepEqual(taskProgress(null), { total: 0, done: 0, percent: 0, isComplete: false });
  assert.equal(formatTaskProgress(taskProgress('просто текст'), {}), '');
});

test('считает выполненные и общие задачи', () => {
  const md = ['- [x] первая', '- [ ] вторая', '- [x] третья'].join('\n');
  assert.deepEqual(taskProgress(md), { total: 3, done: 2, percent: 67, isComplete: false });
});

test('понимает заглавную X и вложенность', () => {
  const md = ['- [X] верхняя', '  - [ ] вложенная', '    - [x] глубокая'].join('\n');
  assert.deepEqual(taskProgress(md), { total: 3, done: 2, percent: 67, isComplete: false });
});

test('понимает нумерованные и зачёркнутые маркеры', () => {
  const md = ['1. [ ] раз', '* [x] два', '+ [ ] три'].join('\n');
  assert.deepEqual(taskProgress(md), { total: 3, done: 1, percent: 33, isComplete: false });
});

test('считает задачи в цитате', () => {
  const md = ['> - [ ] из цитаты', '> - [x] тоже из цитаты'].join('\n');
  assert.deepEqual(taskProgress(md), { total: 2, done: 1, percent: 50, isComplete: false });
});

test('не путает обычный список с задачей', () => {
  const md = ['- пункт без галочки', '- [ ] а вот задача', '[x] без маркера списка'].join('\n');
  assert.deepEqual(taskProgress(md), { total: 1, done: 0, percent: 0, isComplete: false });
});

test('не считает задачи внутри блока кода', () => {
  const md = ['- [ ] настоящая', '', '```md', '- [x] пример из документации', '- [ ] ещё пример', '```'].join('\n');
  assert.deepEqual(taskProgress(md), { total: 1, done: 0, percent: 0, isComplete: false });
});

test('полностью выполненный список помечается завершённым', () => {
  const md = ['- [x] одна', '- [X] две'].join('\n');
  assert.deepEqual(taskProgress(md), { total: 2, done: 2, percent: 100, isComplete: true });
});

test('процент округляется к целому', () => {
  const md = ['- [x] a', '- [ ] b', '- [ ] c'].join('\n');
  assert.equal(taskProgress(md).percent, 33);
});

test('формат строки собирает долю и проценты', () => {
  const strings = { percent: (value) => `${value}%` };
  assert.equal(formatTaskProgress(taskProgress('- [x] a\n- [ ] b'), strings), '1/2 · 50%');
  assert.equal(formatTaskProgress(taskProgress('- [ ] a'), strings), '0/1 · 0%');
});