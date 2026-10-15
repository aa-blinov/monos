import test from 'node:test';
import assert from 'node:assert/strict';
import { localeFromLanguages } from './strings.js';

test('язык системы по-русски даёт русский интерфейс при первом запуске', () => {
  assert.equal(localeFromLanguages(['ru-RU', 'en-US']), 'ru');
  assert.equal(localeFromLanguages(['ru']), 'ru');
});

test('системный язык не русский или не указан — английский интерфейс', () => {
  assert.equal(localeFromLanguages(['en-US']), 'en');
  assert.equal(localeFromLanguages(['de-DE', 'fr-FR']), 'en');
  assert.equal(localeFromLanguages([]), 'en');
});

test('похожие коды не принимаются за русский: «rust» и «ruby» — не русский', () => {
  assert.equal(localeFromLanguages(['rust']), 'en');
  assert.equal(localeFromLanguages(['ruby-DE']), 'en');
});
