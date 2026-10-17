import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SYNC_MINUTES,
  isSyncInFlight,
  normalizeSyncMinutes,
  runSyncRound,
  setAutoSyncPolicy,
  setBusyCheck,
  startAutoSync,
  stopAutoSync,
} from './git-sync.js';

const originalFetch = globalThis.fetch;

// git-sync.js deliberately knows nothing about stores.js — the unsaved-note
// check is injected. Default to "nothing is busy" so these tests stay pure.
setBusyCheck(() => false);

function answer(status, body) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

test('без отправки раунд только получает: POST на /api/git/pull', async () => {
  setAutoSyncPolicy({ upload: false });
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push([String(url), init.method]);
    return answer(200, { received: 2, conflicts: false, inSync: true });
  };
  try {
    const result = await runSyncRound();
    assert.deepEqual(seen, [['/api/git/pull?auto=1', 'POST']]);
    assert.equal(result.ok, true);
    assert.equal(result.received, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('с отправкой раунд коммитит, получает и отправляет: POST на /api/git/sync, полученное — поле pulled', async () => {
  setAutoSyncPolicy({ upload: true });
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    return answer(200, { conflicts: false, committed: true, pushed: ['Alpha.md'], pulled: 3, inSync: true });
  };
  try {
    const result = await runSyncRound();
    assert.deepEqual(seen, ['/api/git/sync?auto=1']);
    assert.equal(result.received, 3);
    assert.deepEqual(result.pushed, ['Alpha.md']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('git не подключён (400) — раунд пропускается без ошибки', async () => {
  globalThis.fetch = async () => answer(400, { detail: 'Git not initialized' });
  try {
    assert.equal(await runSyncRound(), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('git не подключён — сервер отвечает skipped, раунд пропускается без ошибки', async () => {
  globalThis.fetch = async () => answer(200, { skipped: 'not-connected' });
  try {
    assert.equal(await runSyncRound(), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('без сети раунд не падает', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    assert.equal(await runSyncRound(), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('настоящая ошибка возвращает детали', async () => {
  globalThis.fetch = async () => answer(500, { detail: 'push rejected' });
  try {
    const result = await runSyncRound();
    assert.equal(result.ok, false);
    assert.equal(result.detail, 'push rejected');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('два одновременных раунда не запускают два запроса', async () => {
  let concurrent = 0;
  let maxConcurrent = 0;
  globalThis.fetch = async () => {
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await new Promise((r) => setTimeout(r, 30));
    concurrent -= 1;
    return answer(200, { received: 0, conflicts: false });
  };
  try {
    await Promise.all([runSyncRound(), runSyncRound(), runSyncRound()]);
    assert.equal(maxConcurrent, 1, 'за один раз должен идти ровно один раунд');
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(isSyncInFlight(), false, 'флаг должен сбрасываться');
});

test('минуты: по умолчанию 15; пустое и непонятное значит 15; границы от 1 до 1440', () => {
  assert.equal(DEFAULT_SYNC_MINUTES, 15);
  assert.equal(normalizeSyncMinutes(undefined), 15);
  assert.equal(normalizeSyncMinutes(null), 15);
  assert.equal(normalizeSyncMinutes(''), 15);
  assert.equal(normalizeSyncMinutes('много'), 15);
  assert.equal(normalizeSyncMinutes('30'), 30);
  assert.equal(normalizeSyncMinutes(7.4), 7);
  assert.equal(normalizeSyncMinutes(0), 1);
  assert.equal(normalizeSyncMinutes(5000), 1440);
});

test('startAutoSync сразу делает раунд и останавливается корректно', async () => {
  let rounds = 0;
  globalThis.fetch = async () => {
    rounds += 1;
    return answer(200, { received: 0, conflicts: false });
  };
  try {
    setAutoSyncPolicy({ upload: false });
    stopAutoSync();
    startAutoSync({ intervalMs: 30 });
    await new Promise((r) => setTimeout(r, 120));
    stopAutoSync();
    const seen = rounds;
    assert.ok(seen >= 1, 'первый раунд должен произойти сразу при старте');
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(rounds, seen, 'после stop таймер не должен продолжать дёргать сеть');
  } finally {
    globalThis.fetch = originalFetch;
    stopAutoSync();
  }
});

test('startAutoSync передаёт результат раунда в onResult', async () => {
  const results = [];
  globalThis.fetch = async () => answer(200, { received: 4, conflicts: false });
  try {
    setAutoSyncPolicy({ upload: false });
    stopAutoSync();
    startAutoSync({ intervalMs: 10_000, onResult: (result) => results.push(result) });
    await new Promise((r) => setTimeout(r, 30));
    stopAutoSync();
    assert.equal(results.length, 1);
    assert.equal(results[0].received, 4);
  } finally {
    globalThis.fetch = originalFetch;
    stopAutoSync();
  }
});

test('раунд, остановленный из-за непроверенных правок агента, сообщает файлы приложению', async () => {
  setAutoSyncPolicy({ upload: true });
  const results = [];
  globalThis.fetch = async () => answer(409, { reason: 'agent-review', files: ['План.md'] });
  try {
    startAutoSync({ onResult: (result) => results.push(result), intervalMs: 3_600_000 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(results, [{ ok: false, reviewBlocked: ['План.md'] }]);
  } finally {
    stopAutoSync();
    globalThis.fetch = originalFetch;
  }
});
