import test from 'node:test';
import assert from 'node:assert/strict';
import { wordDiff } from './word-diff.js';

const marked = (pieces) => pieces.filter((piece) => piece.changed).map((piece) => piece.text.trim());
const text = (pieces) => pieces.map((piece) => piece.text).join('');

test('отмечает только изменившиеся слова', () => {
  const diff = wordDiff('Выезд: суббота, 9:00.', 'Выезд: пятница, 6:30.');
  assert.deepEqual(marked(diff.ours), ['суббота, 9:00.']);
  assert.deepEqual(marked(diff.theirs), ['пятница, 6:30.']);
});

test('текст собирается обратно без потерь, со всеми пробелами и переносами', () => {
  const ours = '- зарядку\n- плед\n\nПоследняя  строка';
  const theirs = '- зарядку\n- термос\n\nПоследняя  строка';
  const diff = wordDiff(ours, theirs);
  assert.equal(text(diff.ours), ours);
  assert.equal(text(diff.theirs), theirs);
  assert.deepEqual(marked(diff.ours), ['плед']);
});

test('одинаковые версии и пустая сторона', () => {
  assert.deepEqual(marked(wordDiff('а б', 'а б').ours), []);
  const diff = wordDiff('', 'новая строка');
  assert.deepEqual(diff.ours, []);
  assert.deepEqual(marked(diff.theirs), ['новая строка']);
});

test('очень длинные версии показываются без отметок', () => {
  const long = Array.from({ length: 800 }, (_, i) => `слово${i}`).join(' ');
  const diff = wordDiff(long, `${long} хвост`);
  assert.deepEqual(marked(diff.theirs), []);
  assert.equal(text(diff.theirs), `${long} хвост`);
});
