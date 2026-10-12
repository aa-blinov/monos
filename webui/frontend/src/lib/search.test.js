import test from 'node:test';
import assert from 'node:assert/strict';
import { getSearchTerms, highlightExcerpt, searchSnippet } from './search.js';

test('getSearchTerms убирает #, дубликаты и пустые части', () => {
  assert.deepEqual(getSearchTerms('#RAG   rag  агенты '), ['агенты', 'rag']);
});

test('getSearchTerms предпочитает полную фразу отдельным словам', () => {
  assert.deepEqual(getSearchTerms('предложение по дем'), ['предложение по дем', 'предложение', 'дем', 'по']);
});

test('highlightExcerpt подсвечивает каждое слово запроса', () => {
  const result = highlightExcerpt('RAG система и агенты', 'rag агенты');

  assert.match(result, /<mark[^>]*>RAG<\/mark>/);
  assert.match(result, /<mark[^>]*>агенты<\/mark>/);
});

test('highlightExcerpt подсвечивает полную фразу запроса', () => {
  const result = highlightExcerpt('Предложение по демо-стенду', 'предложение по дем');

  assert.match(result, /<mark[^>]*>Предложение по дем<\/mark>о-стенду/);
});

test('highlightExcerpt экранирует HTML перед подсветкой', () => {
  const result = highlightExcerpt('<b>RAG</b> система', 'rag');

  assert.match(result, /&lt;b&gt;/);
  assert.doesNotMatch(result, /<b>/);
  assert.match(result, /<mark[^>]*>RAG<\/mark>/);
});

test('searchSnippet показывает контекст вокруг совпадения', () => {
  const result = searchSnippet('Начало заметки без совпадений, потом много вводного текста, и только ближе к концу появляется release marker.', 'release', 64);

  assert.match(result, /release marker/);
  assert.doesNotMatch(result, /^Начало заметки/);
  assert.match(result, /^…/);
});


test('getSearchTerms убирает значение оператора updated:', () => {
  assert.deepEqual(getSearchTerms('updated:2026-10 план'), ['план']);
  assert.deepEqual(getSearchTerms('-body:черновик план'), ['черновик план', 'черновик', 'план']);
});

test('body: называет поле, а не слово — подсвечиваем его содержимое', () => {
  assert.deepEqual(getSearchTerms('body:квартальные отчёт'), ['квартальные отчёт', 'квартальные', 'отчёт']);
  assert.deepEqual(getSearchTerms('отчёт body:"cost centre"'), ['отчёт cost centre', 'centre', 'отчёт', 'cost']);
});

test('запрос только из операторов не подсвечивает ничего', () => {
  assert.deepEqual(getSearchTerms('body:квартальные'), ['квартальные']);
  assert.deepEqual(getSearchTerms('updated:2026-10'), []);
  assert.deepEqual(getSearchTerms(''), []);
});

test('обычный запрос не меняется', () => {
  assert.deepEqual(getSearchTerms('отчёт по продажам'), ['отчёт по продажам', 'продажам', 'отчёт', 'по']);
});
