import test from 'node:test';
import assert from 'node:assert/strict';

const jsonResponse = (data, ok = true) => ({ ok, async json() { return data; } });
const blobResponse = (body, ok = true, headers = {}) => ({
  ok,
  headers: { get: (name) => headers[name] ?? null },
  async blob() { return body; },
});

// node:test runs without a DOM, so the two APIs the download path touches are
// stubbed: an anchor we can observe, and object-URL plumbing.
const withFetch = async (impl, fn) => {
  const original = {
    fetch: globalThis.fetch,
    document: globalThis.document,
    URLCreate: globalThis.URL?.createObjectURL,
    URLRevoke: globalThis.URL?.revokeObjectURL,
  };
  const anchors = [];
  const revoked = [];
  globalThis.document = {
    createElement: () => {
      const el = { dataset: {}, removed: false, click() { el.dataset.clicked = '1'; }, remove() { el.removed = true; } };
      anchors.push(el);
      return el;
    },
    body: { appendChild() {}, },
  };
  globalThis.URL.createObjectURL = () => 'blob:test';
  globalThis.URL.revokeObjectURL = (u) => revoked.push(u);
  globalThis.fetch = impl;
  try {
    return await fn({ anchors, revoked });
  } finally {
    globalThis.fetch = original.fetch;
    globalThis.URL.createObjectURL = original.URLCreate;
    globalThis.URL.revokeObjectURL = original.URLRevoke;
    if (original.document) globalThis.document = original.document;
    else delete globalThis.document;
  }
};

test('exportNotesArchive скачивает архив с именем из заголовка', async () => {
  await withFetch(async () => blobResponse(new Blob(['zip']), true, {
    'Content-Disposition': 'attachment; filename="monos-notes-2026-10-11.zip"',
  }), async ({ anchors, revoked }) => {
    const { exportNotesArchive } = await import('./backup.js');
    const name = await exportNotesArchive();
    assert.equal(name, 'monos-notes-2026-10-11.zip');
    assert.equal(anchors[0].dataset.clicked, '1', 'the download link must be clicked');
    assert.deepEqual(revoked, ['blob:test'], 'the object URL must be released');
    assert.equal(anchors[0].removed, true, 'the temporary link must be removed');
  });
});

test('exportNotesArchive отдаёт ошибку вместо исключения', async () => {
  await withFetch(async () => jsonResponse({ detail: 'nope' }, false), async () => {
    const { exportNotesArchive } = await import('./backup.js');
    let captured = '';
    const name = await exportNotesArchive({ onError: (m) => { captured = m; } });
    assert.equal(name, null);
    assert.equal(captured, 'nope');
  });
});

test('importNotesArchive отправляет файл и разбирает summary', async () => {
  await withFetch(async (_url, init) => {
    assert.equal(init.method, 'POST');
    assert.ok(init.body instanceof FormData);
    assert.equal(init.body.get('archive').name, 'notes.zip');
    return jsonResponse({ files: 3, notes: 2 });
  }, async () => {
    const { importNotesArchive } = await import('./backup.js');
    const result = await importNotesArchive(new File(['x'], 'notes.zip', { type: 'application/zip' }));
    assert.equal(result.ok, true);
    assert.equal(result.data.notes, 2);
  });
});

test('importNotesArchive возвращает detail при ошибке', async () => {
  await withFetch(async () => jsonResponse({ detail: 'Archive file required' }, false), async () => {
    const { importNotesArchive } = await import('./backup.js');
    const result = await importNotesArchive(new File(['x'], 'notes.zip'));
    assert.equal(result.ok, false);
    assert.equal(result.detail, 'Archive file required');
  });
});

test('importNotesArchive без файла ничего не делает', async () => {
  const { importNotesArchive } = await import('./backup.js');
  assert.deepEqual(await importNotesArchive(null), { ok: false });
});