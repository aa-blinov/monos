import test from 'node:test';
import assert from 'node:assert/strict';
import { searchEntries } from './search.js';

const entry = (content) => ({
  path: 'notes/card.md',
  name: 'card.md',
  title: 'Card',
  content,
  tags: '[]',
  modified_at: '2026-10-05T10:00:00.000Z',
});

test('отрывок не показывает frontmatter, только текст заметки', () => {
  const [result] = searchEntries(
    [entry('---\ntitle: "Card"\ntags: [a]\n---\n\nТекст заметки о бюджете.')],
    { query: 'body:бюджете' },
  );
  assert.ok(result, 'заметка должна найтись');
  assert.doesNotMatch(result.excerpt, /title:|tags:|---/);
  assert.match(result.excerpt, /бюджете/);
});

test('таблица и чекбоксы в отрывке становятся обычным текстом', () => {
  const [result] = searchEntries(
    [entry('| Task | Owner |\n| --- | :-: |\n| [x] Report | Ivan |')],
    { query: 'body:report' },
  );
  assert.ok(result, 'заметка должна найтись');
  assert.doesNotMatch(result.excerpt, /\||\[x\]|---/);
  assert.match(result.excerpt, /Report/);
});
