import test from 'node:test';
import assert from 'node:assert/strict';
import { localeDate, localeMonth, localeStamp } from './date-format.js';

const day = new Date(2026, 9, 14, 8, 40, 12);

test('Russian dates are day first with dots', () => {
  assert.equal(localeDate(day, 'ru'), '14.10.2026');
  assert.equal(localeDate(new Date(2026, 0, 5), 'ru'), '05.01.2026');
});

test('other languages use ISO dates', () => {
  assert.equal(localeDate(day, 'en'), '2026-10-14');
  assert.equal(localeDate(new Date(2026, 0, 5), 'en'), '2026-01-05');
  assert.equal(localeDate(day), '2026-10-14', 'English is the default');
});

test('months follow the same split', () => {
  assert.equal(localeMonth(day, 'ru'), '10.2026');
  assert.equal(localeMonth(day, 'en'), '2026-10');
});

test('note stamp keeps the time with dashes and the seconds', () => {
  assert.equal(localeStamp(day, 'en'), '2026-10-14 08-40-12');
  assert.equal(localeStamp(day, 'ru'), '14.10.2026 08-40-12');
});

test('no colons in the stamp, because file names cannot hold them', () => {
  assert.doesNotMatch(localeStamp(day, 'ru'), /:/);
  assert.doesNotMatch(localeStamp(day, 'en'), /:/);
});

test('relativeDay: сегодня и вчера словами, в этом году без года, раньше — с годом', async () => {
  const { relativeDay } = await import('./date-format.js');
  const words = { today: 'Сегодня', yesterday: 'Вчера' };
  const now = new Date(2026, 9, 16, 12, 0);
  assert.equal(relativeDay(new Date(2026, 9, 16, 7, 54), 'ru', words, now), 'Сегодня, 07:54');
  assert.equal(relativeDay(new Date(2026, 9, 15, 18, 10), 'ru', words, now), 'Вчера, 18:10');
  assert.match(relativeDay(new Date(2026, 9, 12, 9, 0), 'ru', words, now), /^12 окт\.?$/);
  assert.match(relativeDay(new Date(2025, 2, 3), 'ru', words, now), /^3 мар\.? 2025/);
  assert.equal(relativeDay('', 'ru', words, now), '');
});
