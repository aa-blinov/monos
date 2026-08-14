import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, request, get, post, put, del } from './client.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

test('ApiError сохраняет status, body и message', () => {
  const error = new ApiError(404, { message: 'Not found' }, 'HTTP 404');

  assert.ok(error instanceof Error);
  assert.equal(error.name, 'ApiError');
  assert.equal(error.status, 404);
  assert.deepEqual(error.body, { message: 'Not found' });
  assert.equal(error.message, 'HTTP 404');
});

test('request возвращает распарсенный JSON при успешном ответе', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse(200, { ok: true, value: 42 });
  };

  const data = await request('/api/notes');

  assert.deepEqual(data, { ok: true, value: 42 });
  assert.equal(captured.url, '/api/notes');
  assert.equal(captured.init.method, 'GET');
});

test('request бросает ApiError с status и body при non-2xx', async () => {
  globalThis.fetch = async () => jsonResponse(404, { error: 'note not found' });

  await assert.rejects(
    request('/api/file?path=missing.md'),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 404);
      assert.deepEqual(err.body, { error: 'note not found' });
      return true;
    },
  );
});

test('request пробрасывает body как JSON для POST', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse(200, { saved: true });
  };

  await request('/api/file?path=note.md', {
    method: 'POST',
    body: JSON.stringify({ content: '# Hello' }),
  });

  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.body, JSON.stringify({ content: '# Hello' }));
});

test('get формирует query string через ? и метод GET', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse(200, { results: [] });
  };

  await get('/api/search', { q: 'rag agents', limit: 10 });

  assert.equal(captured.init.method, 'GET');
  assert.match(captured.url, /^\/api\/search\?/);
  assert.match(captured.url, /q=rag%20agents/);
  assert.match(captured.url, /limit=10/);
});

test('get не добавляет ? если params пустой', async () => {
  let captured;
  globalThis.fetch = async (url) => {
    captured = { url };
    return jsonResponse(200, []);
  };

  await get('/api/notes/recent');

  assert.equal(captured.url, '/api/notes/recent');
});

test('post сериализует JSON body и ставит Content-Type', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse(200, { id: 1 });
  };

  await post('/api/notes/create', { title: 'New', content: 'body' });

  assert.equal(captured.url, '/api/notes/create');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers['Content-Type'], 'application/json');
  assert.equal(captured.init.body, JSON.stringify({ title: 'New', content: 'body' }));
});

test('put сериализует JSON body и использует метод PUT', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse(200, { updated: true });
  };

  await put('/api/file/metadata?path=note.md', { color: 'red' });

  assert.equal(captured.init.method, 'PUT');
  assert.equal(captured.init.headers['Content-Type'], 'application/json');
  assert.equal(captured.init.body, JSON.stringify({ color: 'red' }));
});

test('del использует метод DELETE и не имеет body', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse(200, { deleted: true });
  };

  await del('/api/file?path=note.md');

  assert.equal(captured.url, '/api/file?path=note.md');
  assert.equal(captured.init.method, 'DELETE');
  assert.equal(captured.init.body, undefined);
});

test('post принимает FormData без Content-Type (браузер сам поставит boundary)', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse(200, { ok: true });
  };

  const form = new FormData();
  form.append('file', new Blob(['data']), 'note.md');

  await post('/api/attachments', form);

  assert.ok(captured.init.body instanceof FormData);
  assert.ok(!('Content-Type' in (captured.init.headers || {})));
});

test('request маппит network failure в ApiError со статусом 0', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('NetworkError: fetch failed');
  };

  await assert.rejects(
    request('/api/notes'),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 0);
      assert.match(err.message, /NetworkError/);
      return true;
    },
  );
});

test('post мерджит кастомные headers с дефолтным Content-Type', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse(200, { ok: true });
  };

  await post('/api/notes/create', { title: 'New' }, { headers: { 'X-Request-Id': 'abc-123' } });

  assert.equal(captured.init.headers['Content-Type'], 'application/json');
  assert.equal(captured.init.headers['X-Request-Id'], 'abc-123');
});

test('post с body=null не ставит body и Content-Type', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse(200, { ok: true });
  };

  await post('/api/notes/touch', null);

  assert.equal(captured.init.body, undefined);
  assert.ok(!('Content-Type' in (captured.init.headers || {})));
});

test('ApiError кодирует status в message для диагностики', () => {
  const err = new ApiError(500, null, 'Internal Server Error');

  assert.equal(err.status, 500);
  assert.equal(err.message, 'Internal Server Error');
  assert.equal(err.body, null);
});

test('get кодирует спецсимволы в query значении', async () => {
  let captured;
  globalThis.fetch = async (url) => {
    captured = { url };
    return jsonResponse(200, []);
  };

  await get('/api/search', { q: 'a&b=c d' });

  assert.equal(captured.url, '/api/search?q=a%26b%3Dc%20d');
});

test('post добавляет query в URL через options.query', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse(200, { ok: true });
  };

  await post('/api/notes/touch', null, { query: { path: 'note.md' } });

  assert.equal(captured.url, '/api/notes/touch?path=note.md');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.body, undefined);
});

test('put мерджит query с уже готовым ? в path', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse(200, { ok: true });
  };

  await put('/api/file/metadata?path=note.md', { color: 'red' });

  assert.equal(captured.url, '/api/file/metadata?path=note.md');
});

test('del с options.query формирует правильный URL', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse(200, { deleted: true });
  };

  await del('/api/file', { query: { path: 'note.md', permanent: 1 } });

  assert.equal(captured.url, '/api/file?path=note.md&permanent=1');
  assert.equal(captured.init.method, 'DELETE');
});

test('post с FormData и query', async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse(200, { ok: true });
  };

  const form = new FormData();
  form.append('file', new Blob(['data']), 'note.md');

  await post('/api/attachments', form, { query: { notePath: 'folder/note.md' } });

  assert.equal(captured.url, '/api/attachments?notePath=folder%2Fnote.md');
  assert.ok(captured.init.body instanceof FormData);
  assert.ok(!('Content-Type' in (captured.init.headers || {})));
});
