import test from 'node:test';
import assert from 'node:assert/strict';
import { describeProperties, frontmatterEnd, mergeProperties, propertyEntries } from './conflict-properties.js';

const names = { tags: 'Теги', due: 'Срок' };

test('конец блока свойств находится и с метками конфликта внутри', () => {
  const text = '---\ntitle: "Покупки"\n<<<<<<< HEAD\ntags: ["магазин"]\n=======\ntags: ["дом"]\n>>>>>>> x\n---\n\n- хлеб\n';
  assert.equal(text.slice(frontmatterEnd(text)), '\n- хлеб\n');
  assert.equal(frontmatterEnd('Просто текст\n---\n'), 0);
});

test('свойства показываются по-человечески', () => {
  assert.equal(describeProperties('tags: ["магазин", "еда"]\ndue: 2026-10-20', names), 'Теги: магазин, еда\nСрок: 2026-10-20');
  assert.equal(describeProperties('aliases:\n  - один\n  - "два"', names), 'aliases: один, два');
});

test('«обе» объединяет теги без повторов и сохраняет ключи одной стороны', () => {
  assert.equal(
    mergeProperties('tags: ["магазин", "еда"]\ncolor: red', 'tags: ["дом", "еда"]\npinned: true'),
    'tags: ["магазин", "еда", "дом"]\ncolor: red\npinned: true',
  );
  assert.deepEqual(propertyEntries(mergeProperties('tags: [a]', 'tags: [b]'))[0].items, ['a', 'b']);
});

test('два разных значения одного ключа объединить нельзя', () => {
  assert.equal(mergeProperties('tags: ["a"]\ndue: 2026-10-20', 'tags: ["b"]\ndue: 2026-10-18'), null);
  assert.equal(mergeProperties('due: 2026-10-20', 'due: 2026-10-20'), 'due: 2026-10-20');
});
