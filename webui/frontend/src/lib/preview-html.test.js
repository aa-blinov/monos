import test from 'node:test';
import assert from 'node:assert/strict';
import { stripFrontmatter } from './preview-html.js';

// sanitizePreviewHtml и renderMarkdownPreview требуют DOM (document.createElement),
// их покрывает vitest suite. Здесь тестируем только stripFrontmatter — pure функцию.

test('stripFrontmatter убирает YAML frontmatter в начале', () => {
  const md = `---
title: Test
tags: [a, b]
---
# Body
content`;
  assert.equal(stripFrontmatter(md), '# Body\ncontent');
});

test('stripFrontmatter возвращает текст как есть если frontmatter нет', () => {
  assert.equal(stripFrontmatter('just text'), 'just text');
  assert.equal(stripFrontmatter('# heading\ntext'), '# heading\ntext');
});

test('stripFrontmatter толерантен к CRLF и пустому вводу', () => {
  const md = '---\r\ntitle: X\r\n---\r\nbody';
  assert.equal(stripFrontmatter(md), 'body');
  assert.equal(stripFrontmatter(''), '');
  assert.equal(stripFrontmatter(null), '');
  assert.equal(stripFrontmatter(undefined), '');
});
