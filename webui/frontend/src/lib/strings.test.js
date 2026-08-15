import test from 'node:test';
import assert from 'node:assert/strict';
import { translations, defaultLocale, isSupportedLocale, localeOptions } from './strings.js';

test('translations содержит en и ru', () => {
  assert.ok(translations.en);
  assert.ok(translations.ru);
});

test('defaultLocale — en', () => {
  assert.equal(defaultLocale, 'en');
});

test('isSupportedLocale принимает известные локали', () => {
  assert.equal(isSupportedLocale('en'), true);
  assert.equal(isSupportedLocale('ru'), true);
  assert.equal(isSupportedLocale('de'), false);
  assert.equal(isSupportedLocale(null), false);
  assert.equal(isSupportedLocale(undefined), false);
});

test('en и ru имеют одинаковый набор ключей', () => {
  function flattenKeys(obj, prefix = '') {
    if (obj === null || obj === undefined) return [];
    if (typeof obj !== 'object') return [prefix];
    return Object.entries(obj).flatMap(([k, v]) => flattenKeys(v, prefix ? `${prefix}.${k}` : k));
  }
  const enKeys = new Set(flattenKeys(translations.en));
  const ruKeys = new Set(flattenKeys(translations.ru));
  const missingInRu = [...enKeys].filter((k) => !ruKeys.has(k));
  const missingInEn = [...ruKeys].filter((k) => !enKeys.has(k));
  assert.deepEqual(missingInRu, [], `отсутствуют в ru: ${missingInRu.join(', ')}`);
  assert.deepEqual(missingInEn, [], `отсутствуют в en: ${missingInEn.join(', ')}`);
});

test('localeOptions — массив объектов { value, label }', () => {
  assert.ok(Array.isArray(localeOptions));
  for (const opt of localeOptions) {
    assert.ok(opt.value);
    assert.ok(opt.label);
  }
  assert.ok(localeOptions.some((o) => o.value === 'en'));
  assert.ok(localeOptions.some((o) => o.value === 'ru'));
});
