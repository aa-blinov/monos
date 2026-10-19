import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('в en нет русских строк', () => {
  // Русский блок, вставленный в enText, тихо перетирает английский ключ.
  // Обратное (английская строка в ru) допустимо: названия операторов, пути,
  // термины вроде Personal Access Token — это техтекст, а не недосмотр.
  const cyrillic = /[Ѐ-ӿ]/;
  const collect = (obj, prefix = '') =>
    Object.entries(obj).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object') return collect(value, path);
      return typeof value === 'string' ? [`${path} → ${value}`] : [];
    });

  const cyrillicInEn = collect(translations.en).filter((entry) => cyrillic.test(entry));
  assert.deepEqual(cyrillicInEn, [], `русский текст в en: ${cyrillicInEn.join(' | ')}`);
});

test('в strings.js нет повторяющихся ключей', () => {
  // Дубль ключа молча перетирает предыдущее значение: english-строка исчезает,
  // а кнопка рисует [object Object]. Проверяем исходник, а не собранный объект.
  const source = readFileSync(new URL('./strings.js', import.meta.url), 'utf8');

  const skipString = (text, start) => {
    const quote = text[start];
    let index = start + 1;
    while (index < text.length && text[index] !== quote) {
      if (text[index] === '\\') index += 1;
      index += 1;
    }
    return index;
  };

  // Тело литерала `const <name> = { … };` — по балансу скобок, без учёта строк и комментариев.
  const literalBounds = (text, name) => {
    const marker = `const ${name} = {`;
    const start = text.indexOf(marker);
    if (start === -1) return null;
    let depth = 0;
    let index = start + marker.length - 1;
    while (index < text.length) {
      const char = text[index];
      if (char === '/' && text[index + 1] === '/') {
        index = text.indexOf('\n', index);
        if (index === -1) return null;
        continue;
      }
      if (char === "'" || char === '"' || char === '`') {
        index = skipString(text, index) + 1;
        continue;
      }
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) return { start: start + marker.length - 1, end: index };
      }
      index += 1;
    }
    return null;
  };

  const scanDuplicates = (text, name) => {
    const bounds = literalBounds(text, name);
    if (!bounds) return [];
    const duplicates = [];
    const frames = [{ keys: new Set(), names: [] }];
    let index = bounds.start;
    while (index < bounds.end) {
      const char = text[index];
      if (char === '/' && text[index + 1] === '/') {
        index = text.indexOf('\n', index);
        if (index === -1) break;
        continue;
      }
      if (char === "'" || char === '"' || char === '`') {
        index = skipString(text, index) + 1;
        continue;
      }
      if (char === '{') {
        const parent = frames[frames.length - 1];
        frames.push({ keys: new Set(), path: parent ? parent.current : null });
        index += 1;
        continue;
      }
      if (char === '}') {
        frames.pop();
        index += 1;
        continue;
      }
      const match = /^[A-Za-z_$][\w$]*/.exec(text.slice(index, index + 60));
      if (!match) {
        index += 1;
        continue;
      }
      const key = match[0];
      let after = index + key.length;
      while (after < bounds.end && /\s/.test(text[after])) after += 1;
      if (text[after] === '(') {
        // Метод: тело пропускаем, ключи там не живут.
        let cursor = after;
        let parens = 0;
        while (cursor < bounds.end) {
          if (text[cursor] === '(') parens += 1;
          else if (text[cursor] === ')') {
            parens -= 1;
            if (parens === 0) {
              cursor += 1;
              break;
            }
          }
          cursor += 1;
        }
        while (cursor < bounds.end && text[cursor] !== '{' && text[cursor] !== ',') cursor += 1;
        if (text[cursor] === '{') {
          let depth = 0;
          while (cursor < bounds.end) {
            if (text[cursor] === '{') depth += 1;
            else if (text[cursor] === '}') {
              depth -= 1;
              if (depth === 0) {
                cursor += 1;
                break;
              }
            }
            cursor += 1;
          }
        }
        index = cursor;
        continue;
      }
      if (text[after] === ':') {
        const frame = frames[frames.length - 1];
        if (frame.keys.has(key)) {
          const trail = frames.slice(1).map((f) => f.path).filter(Boolean);
          duplicates.push(`${name}: ${[...trail, key].join('.')}`);
        }
        frame.keys.add(key);
        frame.current = key;
        index = after + 1;
        continue;
      }
      index += 1;
    }
    return duplicates;
  };

  const duplicates = ['enText', 'ruText'].flatMap((name) => scanDuplicates(source, name));
  assert.deepEqual(duplicates, [], `повторяющиеся ключи: ${duplicates.join(', ')}`);
});

// Русский счёт требует падежа: без него «1 мин чтения» читается как «мин» в записи сокращения.
test('ru склоняет слово, минуты и колонки по числу', () => {
  const { stats } = translations.ru.editorHeader;
  const { columns } = translations.ru.app.board;
  assert.equal(stats.words(1), '1 слово');
  assert.equal(stats.words(3), '3 слова');
  assert.equal(stats.words(11), '11 слов');
  assert.equal(stats.words(21), '21 слово');

  assert.equal(stats.readingMinutes(1), '1 минута чтения');
  assert.equal(stats.readingMinutes(3), '3 минуты чтения');
  assert.equal(stats.readingMinutes(11), '11 минут чтения');
  assert.equal(stats.readingMinutes(21), '21 минута чтения');
  assert.equal(stats.readingMinutes(0), '0 минут чтения');

  assert.equal(columns(1), '1 колонка');
  assert.equal(columns(2), '2 колонки');
  assert.equal(columns(5), '5 колонок');
  assert.equal(columns(11), '11 колонок');
  assert.equal(columns(21), '21 колонка');
});

test('ru склоняет «Тег для N заметки» — «для» требует родительного', () => {
  const { tagSelected } = translations.ru.sidebar.context;
  assert.equal(tagSelected(1), 'Тег для 1 заметки');
  assert.equal(tagSelected(3), 'Тег для 3 заметки');
  assert.equal(tagSelected(5), 'Тег для 5 заметок');
  assert.equal(tagSelected(11), 'Тег для 11 заметок');
  assert.equal(tagSelected(21), 'Тег для 21 заметки');
});
