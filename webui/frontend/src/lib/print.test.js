import test from 'node:test';
import assert from 'node:assert/strict';

const jsonResponse = (data, ok = true) => ({ ok, async json() { return data; } });

const withFetch = async (impl, fn) => {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = original; }
};

test('printNoteToPdf отправляет scope=note и путь', async () => {
  await withFetch(async (url, init) => {
    assert.match(String(url), /\/api\/print\/pdf$/);
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { scope: 'note', path: 'notes/a.md' });
    return jsonResponse({ filePath: '/tmp/a.pdf' });
  }, async () => {
    const { printNoteToPdf } = await import('./print.js');
    const result = await printNoteToPdf('notes/a.md');
    assert.equal(result.filePath, '/tmp/a.pdf');
  });
});

test('printTreeToPdf по умолчанию печатает всё дерево', async () => {
  await withFetch(async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body), { scope: 'tree', path: '' });
    return jsonResponse({ filePath: '/tmp/all.pdf' });
  }, async () => {
    const { printTreeToPdf } = await import('./print.js');
    assert.equal((await printTreeToPdf()).filePath, '/tmp/all.pdf');
  });
});

test('печать сообщает, что PDF доступен только в десктопном приложении', async () => {
  await withFetch(async () => jsonResponse({ detail: 'PDF export needs the desktop app' }, false), async () => {
    const { printNoteToPdf } = await import('./print.js');
    await assert.rejects(() => printNoteToPdf('notes/a.md'), /desktop app/);
  });
});

test('openPrintView собирает корректный адрес для обоих режимов', async () => {
  await withFetch(async () => jsonResponse({}), async () => {
    const { openPrintView } = await import('./print.js');
    // node:test has no window; the printer only uses window.open.
    const seen = [];
    const originalWindow = globalThis.window;
    globalThis.window = { open: (url) => { seen.push(url); return {}; } };
    try {
      openPrintView({ scope: 'note', path: 'notes/a b.md' });
      openPrintView({ scope: 'tree', path: 'base/Topic' });
      openPrintView({ scope: 'tree' });
    } finally {
      globalThis.window = originalWindow;
    }
    assert.equal(seen[0], '/api/print/note?path=notes%2Fa%20b.md');
    assert.equal(seen[1], '/api/print/tree?path=base%2FTopic');
    assert.equal(seen[2], '/api/print/tree');
  });
});