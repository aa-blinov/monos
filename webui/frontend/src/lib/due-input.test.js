import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDueInput, formatDueInput } from './due-input.js';

test('пустое поле означает «без срока»', () => {
  assert.deepEqual(parseDueInput(''), { ok: true, due: '' });
  assert.deepEqual(parseDueInput('   '), { ok: true, due: '' });
});

test('ISO и точечная запись приводятся к YYYY-MM-DD', () => {
  assert.deepEqual(parseDueInput('2026-12-24'), { ok: true, due: '2026-12-24' });
  assert.deepEqual(parseDueInput('2026-1-5'), { ok: true, due: '2026-01-05' });
  assert.deepEqual(parseDueInput('24.12.2026'), { ok: true, due: '2026-12-24' });
  assert.deepEqual(parseDueInput('24/12/2026'), { ok: true, due: '2026-12-24' });
  assert.deepEqual(parseDueInput('05.01.26'), { ok: true, due: '2026-01-05' });
});

test('несуществующие и бессмысленные даты отклоняются, а не угадываются', () => {
  assert.deepEqual(parseDueInput('31.02.2026'), { ok: false });
  assert.deepEqual(parseDueInput('2026-13-01'), { ok: false });
  assert.deepEqual(parseDueInput('00.12.2026'), { ok: false });
  assert.deepEqual(parseDueInput('2026-02-29'), { ok: false });
  assert.deepEqual(parseDueInput('завтра'), { ok: false });
});

test('29 февраля принимается в високосный год', () => {
  assert.deepEqual(parseDueInput('2028-02-29'), { ok: true, due: '2028-02-29' });
});

test('в поле показывается точечная запись для русского и ISO для остальных языков', () => {
  assert.equal(formatDueInput('2026-12-24', 'ru'), '24.12.2026');
  assert.equal(formatDueInput('2026-12-24', 'en'), '2026-12-24');
  assert.equal(formatDueInput('', 'ru'), '');
});

test('значение, которое не является датой, показывается как есть', () => {
  assert.equal(formatDueInput('someday', 'en'), 'someday');
});
