import test from 'node:test';
import assert from 'node:assert/strict';
import { translations, uiText } from './strings.js';
import { createTranslator } from './i18n/t.js';

function flatten(obj, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(obj || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.push({ path, value });
    else if (typeof value === 'function') out.push({ path, value });
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...flatten(value, path));
    } else if (Array.isArray(value)) {
      out.push({ path, value });
    }
  }
  return out;
}

const enText = translations.en;
const ruText = translations.ru;

test('translations содержит en и ru', () => {
  assert.ok(translations.en);
  assert.ok(translations.ru);
});

test('flatten собирает все строковые ключи', () => {
  const keys = flatten(enText);
  assert.ok(keys.length > 100, `expected many keys, got ${keys.length}`);
});

test('enText и ruText имеют одинаковую структуру ключей', () => {
  const enKeys = flatten(enText).map((k) => k.path).sort();
  const ruKeys = flatten(ruText).map((k) => k.path).sort();
  const onlyEn = enKeys.filter((k) => !ruKeys.includes(k));
  const onlyRu = ruKeys.filter((k) => !enKeys.includes(k));
  if (onlyEn.length || onlyRu.length) {
    console.error('Keys only in enText:', onlyEn);
    console.error('Keys only in ruText:', onlyRu);
  }
  assert.equal(onlyEn.length, 0, `enText has ${onlyEn.length} keys missing in ruText`);
  assert.equal(onlyRu.length, 0, `ruText has ${onlyRu.length} keys missing in enText`);
});

test('enText не имеет пустых строк', () => {
  const empties = flatten(enText).filter((k) => k.value === '').map((k) => k.path);
  assert.deepEqual(empties, []);
});

test('ruText не имеет пустых строк', () => {
  const empties = flatten(ruText).filter((k) => k.value === '').map((k) => k.path);
  assert.deepEqual(empties, []);
});

test('createTranslator работает с реальными enText/ruText (en)', () => {
  const t = createTranslator({ en: enText, ru: ruText }, 'en');
  assert.equal(t('app.board.title'), 'Notes');
  assert.equal(t('header.search'), 'Search');
});

test('createTranslator работает с реальными enText/ruText (ru)', () => {
  const t = createTranslator({ en: enText, ru: ruText }, 'ru');
  assert.equal(t('app.board.title'), 'Заметки');
  assert.equal(t('header.search'), 'Поиск');
});

test('createTranslator возвращает fallback для отсутствующих функций', () => {
  const t = createTranslator({ en: enText, ru: ruText }, 'en');
  // Функции в strings.js сейчас не поддерживаются t() (используется $localizedText derived store)
  assert.equal(t('searchResults.matches', { count: 1, query: 'foo' }), 'searchResults.matches');
});

test('отсутствующий ключ в обеих локалях возвращает fallback', () => {
  const t = createTranslator({ en: enText, ru: ruText }, 'en');
  assert.equal(t('totally.missing.key'), 'totally.missing.key');
});
