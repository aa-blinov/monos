import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { noteHistoryRequest, noteRevisionRequest, restoreNoteRevisionRequest, revisionTitle, groupRevisionsByDay, relativeDay } from './git-history.js';

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

test('заголовки версий на языке интерфейса', () => {
  const words = { agent: 'Правки агента', synced: 'Синхронизация', savedBeforePull: 'Правки перед синхронизацией', connected: 'Подключена', resolved: 'Разобран конфликт', merged: 'Объединены правки' };
  assert.equal(revisionTitle('Auto-sync from Ноутбук', words), 'Синхронизация');
  assert.equal(revisionTitle('Auto-sync from Monos (pending pull)', words), 'Правки перед синхронизацией');
  assert.equal(revisionTitle('Init from Телефон', words), 'Подключена');
  assert.equal(revisionTitle('Resolve conflict in Покупки.md', words), 'Разобран конфликт');
  assert.equal(revisionTitle("Merge branch 'master' of https://github.com/x/y", words), 'Объединены правки');
  assert.equal(revisionTitle('Agent edits on Ноутбук', words), 'Правки агента');
  assert.equal(revisionTitle('Своё сообщение', words), 'Своё сообщение');
});

test('groupRevisionsByDay: версии одного дня идут в одной группе, порядок сохраняется', () => {
  const at = (day, hour) => ({ sha: `${day}${hour}`, date: new Date(2026, 9, day, hour).toISOString() });
  const groups = groupRevisionsByDay([at(18, 14), at(18, 9), at(17, 20), at(10, 8)]);
  assert.deepEqual(groups.map((g) => g.revisions.length), [2, 1, 1]);
  assert.equal(groups[0].revisions[0].sha, '1814');
  assert.deepEqual(groupRevisionsByDay(null), []);
});

test('relativeDay: сегодня, вчера или ничего', () => {
  const now = new Date(2026, 9, 18, 12);
  assert.equal(relativeDay(new Date(2026, 9, 18, 1), now), 'today');
  assert.equal(relativeDay(new Date(2026, 9, 17, 23), now), 'yesterday');
  assert.equal(relativeDay(new Date(2026, 9, 10), now), null);
});
