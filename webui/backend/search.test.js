import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatterMetadata, searchEntries } from './search.js';

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
