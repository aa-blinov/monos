import test from 'node:test';
import assert from 'node:assert/strict';
import { getSearchTerms, highlightExcerpt } from './search.js';

test('getSearchTerms убирает #, дубликаты и пустые части', () => {
  assert.deepEqual(getSearchTerms('#RAG   rag  агенты '), ['агенты', 'rag']);
});

test('highlightExcerpt подсвечивает каждое слово запроса', () => {
  const result = highlightExcerpt('RAG система и агенты', 'rag агенты');

  assert.match(result, /<mark[^>]*>RAG<\/mark>/);
  assert.match(result, /<mark[^>]*>агенты<\/mark>/);
});

test('highlightExcerpt экранирует HTML перед подсветкой', () => {
  const result = highlightExcerpt('<b>RAG</b> система', 'rag');

  assert.match(result, /&lt;b&gt;/);
  assert.doesNotMatch(result, /<b>/);
  assert.match(result, /<mark[^>]*>RAG<\/mark>/);
});
