import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatterMetadata, searchEntries, parseSearchQuery } from './search.js';

test('parseFrontmatterMetadata достает title и tags из YAML-шапки', () => {
  const content = `---
title: "Агенты и LLM"
category: "Research/AI"
tags: ["LLM", "агенты"]
status: published
---

# Агенты
`;

  assert.deepEqual(parseFrontmatterMetadata(content), {
    title: 'Агенты и LLM',
    tags: ['LLM', 'агенты'],
    category: 'Research/AI',
    // Закрепление — часть метаданных заметки, поэтому парсер его тоже отдаёт.
    pinned: false,
  });
});

test('searchEntries предпочитает точное совпадение в title совпадению только в content', () => {
  const entries = [
    {
      path: 'notes/a.md',
      name: 'a.md',
      title: 'RAG система',
      content: 'Краткая заметка',
      tags: '[]',
      last_opened: '2026-01-01T10:00:00.000Z',
    },
    {
      path: 'notes/b.md',
      name: 'b.md',
      title: 'Заметка',
      content: 'Эта RAG система описана глубоко и подробно.',
      tags: '[]',
      last_opened: '2026-05-01T10:00:00.000Z',
    },
  ];

  const results = searchEntries(entries, {
    query: 'rag система',
    searchContent: true,
  });

  assert.equal(results[0].path, 'notes/a.md');
  assert.equal(results[0].name, 'RAG система');
});

test('searchEntries не ищет только по content, если searchContent выключен', () => {
  const entries = [
    {
      path: 'notes/rag.md',
      name: 'rag.md',
      title: '',
      content: 'Поиск по контексту и чанкам документов',
      tags: '[]',
      last_opened: '2026-05-01T10:00:00.000Z',
    },
  ];

  assert.deepEqual(searchEntries(entries, {
    query: 'чанкам',
    searchContent: false,
  }), []);

  const results = searchEntries(entries, {
    query: 'чанкам',
    searchContent: true,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].path, 'notes/rag.md');
});

test('searchEntries использует title как отображаемое имя и ищет по тегам', () => {
  const entries = [
    {
      path: 'notes/README.md',
      name: 'README.md',
      title: 'Агенты и LLM',
      content: 'Полный обзор',
      tags: JSON.stringify(['LLM', 'агенты']),
      color: '#8ec07c',
      category: 'Research',
      last_opened: '2026-05-01T10:00:00.000Z',
    },
  ];

  const results = searchEntries(entries, {
    query: '#LLM',
    searchContent: true,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'Агенты и LLM');
  assert.equal(results[0].excerpt, '#LLM #агенты');
  assert.equal(results[0].color, '#8ec07c');
  assert.equal(results[0].category, 'Research');
  assert.deepEqual(results[0].tags, ['LLM', 'агенты']);
});

test('parseSearchQuery раскладывает текст и операторы', () => {
  const parsed = parseSearchQuery('report body:quarterly updated:2026-10');
  assert.deepEqual(parsed.text, ['report']);
  assert.deepEqual(parsed.body, { terms: ['quarterly'], negated: false });
  assert.deepEqual(parsed.updated, { values: ['2026-10'], negated: false });
});

test('body: собирает следующие слова в тело, а не в свободный текст', () => {
  const parsed = parseSearchQuery('body:cost centre');
  assert.deepEqual(parsed.text, []);
  assert.deepEqual(parsed.body.terms, ['cost', 'centre']);
});

test('body:"точная фраза" сохраняет фразу целиком', () => {
  assert.deepEqual(parseSearchQuery('body:"cost centre"').body.terms, ['cost centre']);
});

test('оператор обрывается на следующем операторе', () => {
  const parsed = parseSearchQuery('body:cost updated:2026-10 note');
  assert.deepEqual(parsed.body.terms, ['cost']);
  assert.deepEqual(parsed.updated.values, ['2026-10']);
  assert.deepEqual(parsed.text, ['note']);
});

test('отрицание оператора помечается, а не теряется', () => {
  const parsed = parseSearchQuery('-body:draft');
  assert.deepEqual(parsed.body, { terms: ['draft'], negated: true });
  assert.deepEqual(parseSearchQuery('-updated:2026-01').updated, { values: ['2026-01'], negated: true });
});

test('body: ищет внутри заметки даже без search_content', () => {
  const entries = [
    {
      path: 'notes/a.md',
      name: 'a.md',
      title: 'Отчёт',
      content: 'Квартальные метрики по отделу',
      tags: '[]',
      modified_at: '2026-10-05T10:00:00.000Z',
    },
    {
      path: 'notes/b.md',
      name: 'b.md',
      title: 'План',
      content: 'Ничего подходящего',
      tags: '[]',
      modified_at: '2026-10-06T10:00:00.000Z',
    },
  ];

  const found = searchEntries(entries, { query: 'body:квартальные' });
  assert.deepEqual(found.map(r => r.path), ['notes/a.md']);
});

test('body: находит фразу целиком, а не по кускам', () => {
  const entries = [
    {
      path: 'notes/a.md', name: 'a.md', title: 'A',
      content: 'cost centre was mentioned', tags: '[]', modified_at: '2026-10-05T10:00:00.000Z',
    },
    {
      path: 'notes/b.md', name: 'b.md', title: 'B',
      content: 'nothing relevant here', tags: '[]', modified_at: '2026-10-05T10:00:00.000Z',
    },
  ];

  assert.deepEqual(searchEntries(entries, { query: 'body:"cost centre"' }).map(r => r.path), ['notes/a.md']);
  assert.deepEqual(searchEntries(entries, { query: 'body:"centre cost"' }).map(r => r.path), []);
});

test('-body: исключает заметки, где слово есть', () => {
  const entries = [
    {
      path: 'notes/a.md', name: 'a.md', title: 'A',
      content: 'черновик версии два', tags: '[]', modified_at: '2026-10-05T10:00:00.000Z',
    },
    {
      path: 'notes/b.md', name: 'b.md', title: 'B',
      content: 'финальная версия', tags: '[]', modified_at: '2026-10-05T10:00:00.000Z',
    },
  ];

  assert.deepEqual(searchEntries(entries, { query: '-body:черновик' }).map(r => r.path), ['notes/b.md']);
});

test('updated: отбирает по префиксу даты изменения', () => {
  const entries = [
    { path: 'notes/oct.md', name: 'oct.md', title: 'A', content: 'x', tags: '[]', modified_at: '2026-10-05T10:00:00.000Z' },
    { path: 'notes/nov.md', name: 'nov.md', title: 'B', content: 'x', tags: '[]', modified_at: '2026-11-05T10:00:00.000Z' },
    { path: 'notes/old.md', name: 'old.md', title: 'C', content: 'x', tags: '[]', modified_at: '2025-03-01T10:00:00.000Z' },
  ];

  assert.deepEqual(searchEntries(entries, { query: 'updated:2026-10' }).map(r => r.path), ['notes/oct.md']);
  assert.deepEqual(searchEntries(entries, { query: 'updated:2026' }).map(r => r.path).sort(), ['notes/nov.md', 'notes/oct.md']);
});

test('updated: не выкидывает заметку без даты изменения, если фильтр отрицательный', () => {
  const entries = [
    { path: 'notes/with.md', name: 'with.md', title: 'A', content: 'x', tags: '[]', modified_at: '2026-10-05T10:00:00.000Z' },
    { path: 'notes/without.md', name: 'without.md', title: 'B', content: 'x', tags: '[]', modified_at: null },
  ];

  assert.deepEqual(searchEntries(entries, { query: '-updated:2026-10' }).map(r => r.path), ['notes/without.md']);
});

test('body: и updated: работают вместе', () => {
  const entries = [
    { path: 'notes/hit.md', name: 'hit.md', title: 'A', content: 'бюджет на 2027 год', tags: '[]', modified_at: '2026-10-05T10:00:00.000Z' },
    { path: 'notes/stale.md', name: 'stale.md', title: 'B', content: 'бюджет на 2027 год', tags: '[]', modified_at: '2025-01-05T10:00:00.000Z' },
    { path: 'notes/other.md', name: 'other.md', title: 'C', content: 'совсем другое', tags: '[]', modified_at: '2026-10-05T10:00:00.000Z' },
  ];

  const found = searchEntries(entries, { query: 'body:бюджет updated:2026-10' }).map(r => r.path);
  assert.deepEqual(found, ['notes/hit.md']);
});

test('body: без свободного текста показывает отрывок вокруг совпадения', () => {
  const entries = [{
    path: 'notes/a.md', name: 'a.md', title: 'A',
    content: `${'предыстория '.repeat(40)}ИСКОМОЕ СЛОВО${' хвост'.repeat(40)}`,
    tags: '[]', modified_at: '2026-10-05T10:00:00.000Z',
  }];

  const [result] = searchEntries(entries, { query: 'body:искомое' });
  assert.match(result.excerpt, /ИСКОМОЕ СЛОВО/);
});

test('запрос без операторов и без текста не возвращает всё подряд', () => {
  const entries = [
    { path: 'notes/a.md', name: 'a.md', title: 'A', content: 'x', tags: '[]', modified_at: '2026-10-05T10:00:00.000Z' },
  ];
  assert.deepEqual(searchEntries(entries, { query: '' }), []);
  assert.deepEqual(searchEntries(entries, { query: '   ' }), []);
});

test('теги и обычный текст продолжают работать как раньше', () => {
  const entries = [
    { path: 'notes/a.md', name: 'a.md', title: 'RAG', content: 'поиск', tags: '["llm"]', modified_at: '2026-10-05T10:00:00.000Z' },
    { path: 'notes/b.md', name: 'b.md', title: 'Другое', content: 'ничего', tags: '[]', modified_at: '2026-10-05T10:00:00.000Z' },
  ];

  assert.deepEqual(searchEntries(entries, { query: 'RAG' }).map(r => r.path), ['notes/a.md']);
  assert.deepEqual(searchEntries(entries, { query: '#llm' }).map(r => r.path), ['notes/a.md']);
});

test('в отрывке нет markdown-разметки: галочки, формулы, ссылки, заголовки', () => {
  const entries = [{
    path: 'notes/m.md', name: 'm.md', title: 'Заметка',
    content: [
      '# Заголовок раздела',
      '',
      'Обычный текст заметки для поиска.',
      '',
      '- [x] Сделать отчёт',
      '- [ ] Разослать его команде',
      '',
      'Формула $E = mc^2$ и блок $$a + b$$.',
      '',
      'Ссылка [текст](https://example.com) и [[Другая заметка]].',
      '',
      '```js',
      'const a = 1;',
      '```',
    ].join('\n'),
    tags: '[]', modified_at: '2026-10-01T00:00:00.000Z',
  }];

  const [result] = searchEntries(entries, { query: 'отчёт', searchContent: true });
  const excerpt = result.excerpt;

  assert.ok(excerpt, 'отрывок должен быть непустым');
  assert.ok(!excerpt.includes('# Заголовок'), `остался заголовок: ${excerpt}`);
  assert.ok(!excerpt.includes('[ ]') && !excerpt.includes('[x]'), `остались галочки: ${excerpt}`);
  assert.ok(!excerpt.includes('$$') && !excerpt.includes('$E'), `осталась формула: ${excerpt}`);
  assert.ok(!excerpt.includes('https://example.com'), `осталась ссылка: ${excerpt}`);
  assert.ok(!excerpt.includes('const a = 1'), `остался код: ${excerpt}`);
  assert.ok(excerpt.includes('Разослать'), `потерялся текст задачи: ${excerpt}`);
});
