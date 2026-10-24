import test from 'node:test';
import assert from 'node:assert/strict';
import { loadShellSettings } from './shell-settings.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const themes = { gruvbox: {}, nord: {}, solarized: {} };

test('loadShellSettings возвращает theme/themeMode при успехе', async () => {
  globalThis.fetch = async () => jsonResponse(200, { theme: 'nord', themeMode: 'dark' });

  const result = await loadShellSettings(themes);

  assert.deepEqual({ ...result, all: undefined }, { ...{ theme: 'nord', themeMode: 'dark' }, all: undefined });
});

test('loadShellSettings отбрасывает невалидный theme', async () => {
  globalThis.fetch = async () => jsonResponse(200, { theme: 'unknown', themeMode: 'light' });

  const result = await loadShellSettings(themes);

  assert.deepEqual({ ...result, all: undefined }, { ...{ themeMode: 'light' }, all: undefined });
});

test('loadShellSettings отбрасывает невалидный themeMode', async () => {
  globalThis.fetch = async () => jsonResponse(200, { theme: 'nord', themeMode: 'foo' });

  const result = await loadShellSettings(themes);

  assert.deepEqual({ ...result, all: undefined }, { ...{ theme: 'nord' }, all: undefined });
});

test('loadShellSettings возвращает null на HTTP error', async () => {
  globalThis.fetch = async () => jsonResponse(500, { error: 'oops' });

  const result = await loadShellSettings(themes);

  assert.equal(result, null);
});

test('loadShellSettings возвращает null на network error', async () => {
  globalThis.fetch = async () => { throw new TypeError('failed'); };

  const result = await loadShellSettings(themes);

  assert.equal(result, null);
});

test('loadShellSettings возвращает null на не-объект response', async () => {
  globalThis.fetch = async () => jsonResponse(200, 'just a string');

  const result = await loadShellSettings(themes);

  assert.equal(result, null);
});

test('loadShellSettings без themes map валидирует только themeMode', async () => {
  globalThis.fetch = async () => jsonResponse(200, { theme: 'unknown', themeMode: 'light' });

  const result = await loadShellSettings(null);

  assert.deepEqual({ ...result, all: undefined }, { ...{ themeMode: 'light' }, all: undefined });
});

test('loadShellSettings отдаёт и весь объект настроек: из него читаются обычные предпочтения', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ theme: 'nord', contentWidth: 'wide' }) });
  try {
    const result = await loadShellSettings({ nord: {} });
    assert.equal(result.all.contentWidth, 'wide');
  } finally {
    globalThis.fetch = original;
  }
});
