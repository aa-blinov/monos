import test from 'node:test';
import assert from 'node:assert/strict';
import { autoPull, isPullInFlight, setBusyCheck, startAutoPull, stopAutoPull } from './git-sync.js';

const originalFetch = globalThis.fetch;

// git-sync.js deliberately knows nothing about stores.js — the unsaved-note
// check is injected. Default to "nothing is busy" so these tests stay pure.
setBusyCheck(() => false);

test('autoPull отправляет POST на /api/git/pull', async () => {
  let called = 0;
  globalThis.fetch = async (url, init) => {
    called += 1;
    assert.equal(String(url).endsWith('/api/git/pull'), true);
    assert.equal(init.method, 'POST');
    return { ok: true, async json() { return { received: 2, conflicts: false, inSync: true }; } };
  };
  try {
    const result = await autoPull();
    assert.equal(called, 1);
    assert.equal(result.ok, true);
    assert.equal(result.received, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('autoPull молчит, когда git не подключён (400) — это не ошибка', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 400, async json() { return { detail: 'Git not initialized' }; } });
  try {
    const result = await autoPull();
    assert.equal(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('autoPull не падает без сети', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    assert.equal(await autoPull(), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('autoPull возвращает детали при настоящей ошибке', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 500, async json() { return { detail: 'push rejected' }; } });
  try {
    const result = await autoPull();
    assert.equal(result.ok, false);
    assert.equal(result.detail, 'push rejected');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('два одновременных autoPull не запускают два запроса', async () => {
  let inFlightNow = false;
  let maxConcurrent = 0;
  let concurrent = 0;
  globalThis.fetch = async () => {
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await new Promise((r) => setTimeout(r, 30));
    concurrent -= 1;
    return { ok: true, async json() { return { received: 0, conflicts: false }; } };
  };
  try {
    await Promise.all([autoPull(), autoPull(), autoPull()]);
    assert.equal(maxConcurrent, 1, 'за один раз должен идти ровно один pull');
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(isPullInFlight(), false, 'флаг должен сбрасываться');
  void inFlightNow;
});

test('startAutoPull тянет сразу и останавливается корректно', async () => {
  let pulls = 0;
  globalThis.fetch = async () => {
    pulls += 1;
    return { ok: true, async json() { return { received: 0, conflicts: false }; } };
  };
  try {
    stopAutoPull();
    startAutoPull({ intervalMs: 30 });
    await new Promise((r) => setTimeout(r, 120));
    stopAutoPull();
    const seen = pulls;
    assert.ok(seen >= 1, 'первый pull должен произойти сразу при старте');
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(pulls, seen, 'после stop таймер не должен продолжать дёргать сеть');
  } finally {
    globalThis.fetch = originalFetch;
    stopAutoPull();
  }
});