import test from 'node:test';
import assert from 'node:assert/strict';

const jsonResponse = (data, ok = true) => ({ ok, async json() { return data; } });

test('fetchClipperToken возвращает токен', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/api\/clip\/token$/);
    return jsonResponse({ token: 'abc123' });
  };
  try {
    const { fetchClipperToken } = await import('./clipper.js');
    assert.equal(await fetchClipperToken(), 'abc123');
  } finally {
    globalThis.fetch = original;
  }
});

test('fetchClipperToken пробрасывает detail при отказе', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({ detail: 'Token is only visible inside the app' }, false);
  try {
    const { fetchClipperToken } = await import('./clipper.js');
    await assert.rejects(() => fetchClipperToken(), /Token is only visible inside the app/);
  } finally {
    globalThis.fetch = original;
  }
});
