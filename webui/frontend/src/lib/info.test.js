import test from 'node:test';
import assert from 'node:assert/strict';

const jsonResponse = (data, ok = true) => ({ ok, async json() { return data; } });

test('fetchNotesDir возвращает путь к папке заметок', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/api\/info$/);
    return jsonResponse({ notesDir: '/home/me/notes' });
  };
  try {
    const { fetchNotesDir } = await import('./info.js');
    assert.equal(await fetchNotesDir(), '/home/me/notes');
  } finally {
    globalThis.fetch = original;
  }
});

test('fetchNotesDir пробрасывает detail при отказе', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({ detail: 'nope' }, false);
  try {
    const { fetchNotesDir } = await import('./info.js');
    await assert.rejects(() => fetchNotesDir(), /nope/);
  } finally {
    globalThis.fetch = original;
  }
});