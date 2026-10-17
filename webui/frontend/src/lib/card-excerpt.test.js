import test from 'node:test';
import assert from 'node:assert/strict';
import { cardExcerpt } from './card-excerpt.js';

test('cardExcerpt: заголовки и пункты списка разделены, предложения идут через пробел', () => {
  assert.equal(cardExcerpt('# Цель\n\nВыпустить версию 2.0.\n\n## Шаги\n\n- [x] Собрать отзывы\n- [ ] Починить'), 'Цель: Выпустить версию 2.0. Шаги: Собрать отзывы, Починить');
  assert.equal(cardExcerpt('- [ ] молоко\n- [ ] хлеб\n- [x] кофе'), 'молоко, хлеб, кофе');
  assert.equal(cardExcerpt('1. «Мастер и Маргарита»\n2. «Пикник на обочине»'), '«Мастер и Маргарита», «Пикник на обочине»');
});

test('cardExcerpt: код, правило таблицы, выноска и шапка не попадают в карточку', () => {
  assert.equal(cardExcerpt('```js\nconst a = 1;\n```\n\n| Пункт | Статус |\n|---|---|\n| Тесты | ок |'), 'Пункт – Статус, Тесты – ок');
  assert.equal(cardExcerpt('Обсудили сроки.\n\n> [!note] Решение\n> Релиз в пятницу.'), 'Обсудили сроки. Решение, Релиз в пятницу.');
  assert.equal(cardExcerpt('---\ntitle: X\nstatus: ok\n---\nТекст'), 'Текст');
});

test('cardExcerpt: ссылки, выделение и картинки читаются как текст', () => {
  assert.equal(cardExcerpt('См. [[План запуска|план]] и [[Идеи#Блог]], **важно** и `код`. ![x](a.png)'), 'См. план и Идеи, важно и код.');
  assert.equal(cardExcerpt('snake_case_name stays'), 'snake_case_name stays');
});

test('cardExcerpt: длинный текст обрезается многоточием', () => {
  const result = cardExcerpt('слово '.repeat(100), 40);
  assert.ok(result.length <= 40);
  assert.ok(result.endsWith('…'));
});
