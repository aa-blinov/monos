import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { noteHistoryRequest, noteRevisionRequest, restoreNoteRevisionRequest } from './git-history.js';

const realFetch = globalThis.fetch;

// Records every call and answers with the given body.
function stubFetch(body, status = 200) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

test('история заметки кодирует путь в query-строке', async () => {
  const calls = stubFetch({ revisions: [], tracked: true });
  await noteHistoryRequest('notes/Work & Play/Alpha.md');
  assert.equal(calls[0].url, '/api/git/history?path=notes%2FWork%20%26%20Play%2FAlpha.md');
});

test('версия заметки передаёт путь и sha коммита', async () => {
  const calls = stubFetch({ content: '', diff: '' });
  await noteRevisionRequest('notes/A.md', 'abc123');
  assert.equal(calls[0].url, '/api/git/history/content?path=notes%2FA.md&sha=abc123');
});

test('восстановление версии отправляет POST с путём и sha в JSON', async () => {
  const calls = stubFetch({ message: 'Restored' });
  await restoreNoteRevisionRequest('notes/A.md', 'abc123');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { path: 'notes/A.md', sha: 'abc123' });
});

test('ошибка сервера становится исключением с текстом detail', async () => {
  stubFetch({ detail: 'Нет истории' }, 404);
  await assert.rejects(noteHistoryRequest('notes/A.md'), /Нет истории/);
});
