import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import http from 'node:http';
import os from 'os';
import path from 'path';

// A real server on the network address, with access from other devices switched on before it starts.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-lan-server-'));
const TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

fs.mkdirSync(path.join(tempRoot, 'notes'), { recursive: true });
fs.writeFileSync(path.join(tempRoot, 'lan-access.json'), JSON.stringify({ enabled: true, token: TOKEN }));
process.env.NOTES_ROOT = tempRoot;

const { startServer, stopServer } = await import('./index.js');
const { networkUrls } = await import('./lan-access.js');

const lanAddress = Object.values(os.networkInterfaces())
  .flat()
  .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address;

const started = await startServer({ port: 0 });
const { port } = started;
after(() => stopServer());

// `host` picks this computer (127.0.0.1) or its network address (another device, as far as the server knows).
function send({ host = '127.0.0.1', method = 'GET', path: requestPath, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const request = http.request({
      host,
      port,
      method,
      path: requestPath,
      headers: {
        ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }),
        ...headers,
      },
    }, (response) => {
      let text = '';
      response.setEncoding('utf-8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text }));
    });
    request.on('error', reject);
    request.end(payload);
  });
}

const bearer = { authorization: `Bearer ${TOKEN}` };
const lanTest = lanAddress ? test : test.skip;

test('этот компьютер работает без токена', async () => {
  assert.equal((await send({ path: '/health' })).status, 200);
  assert.equal((await send({ path: '/api/lan' })).status, 200);
});

lanTest('другой компьютер без токена получает отказ: JSON для API и страницу с подсказкой для всего остального', async () => {
  const api = await send({ host: lanAddress, path: '/api/notes/recent' });
  assert.equal(api.status, 401);
  assert.equal(JSON.parse(api.text).detail, 'Access token required');
  const page = await send({ host: lanAddress, path: '/' });
  assert.equal(page.status, 401);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.text, /Телефон и другие устройства/);
});

lanTest('ссылка с токеном открывает главную: ставится cookie, адрес очищается, дальше cookie пускает', async () => {
  const link = await send({ host: lanAddress, path: `/?token=${TOKEN}` });
  assert.equal(link.status, 302);
  assert.equal(link.headers.location, '/');
  assert.match(link.headers['set-cookie'][0], new RegExp(`^monos_token=${TOKEN}; HttpOnly; SameSite=Strict; Path=/`));
  const withCookie = await send({ host: lanAddress, path: '/health', headers: { cookie: `monos_token=${TOKEN}` } });
  assert.equal(withCookie.status, 200);
});

lanTest('токен в адресе пускает только на главную; неверный токен и токен в адресе API не работают', async () => {
  assert.equal((await send({ host: lanAddress, path: `/health?token=${TOKEN}` })).status, 401);
  assert.equal((await send({ host: lanAddress, path: '/health', headers: { authorization: 'Bearer wrong-token' } })).status, 401);
  assert.equal((await send({ host: lanAddress, path: '/health', headers: { cookie: 'monos_token=wrong-token' } })).status, 401);
  assert.equal((await send({ host: lanAddress, path: '/health', headers: bearer })).status, 200);
});

lanTest('имя хоста из чужой сети отказывается, даже с токеном; настройки с другого компьютера не меняются', async () => {
  const foreignHost = await send({ host: lanAddress, path: '/health', headers: { ...bearer, host: 'evil.example.com' } });
  assert.equal(foreignHost.status, 403);
  const settingsFromNetwork = await send({ host: lanAddress, path: '/api/lan', headers: bearer });
  assert.equal(settingsFromNetwork.status, 403);
});

test('на этом компьютере настройка показывает токен и адреса сети, а перезапуск не нужен', async () => {
  const state = JSON.parse((await send({ path: '/api/lan' })).text);
  assert.equal(state.enabled, true);
  assert.equal(state.token, TOKEN);
  assert.equal(state.restartRequired, false);
  assert.deepEqual(state.urls, networkUrls(port, TOKEN));
});

lanTest('новый токен заменяет старый: прежний перестаёт пускать, новый пускает', async () => {
  const renewed = JSON.parse((await send({ method: 'POST', path: '/api/lan/token' })).text);
  assert.notEqual(renewed.token, TOKEN);
  assert.equal(renewed.enabled, true);
  assert.equal((await send({ host: lanAddress, path: '/health', headers: bearer })).status, 401);
  const withNew = await send({ host: lanAddress, path: '/health', headers: { authorization: `Bearer ${renewed.token}` } });
  assert.equal(withNew.status, 200);
});

test('переключатель принимает только true и false', async () => {
  const response = await send({ method: 'PUT', path: '/api/lan', body: { enabled: 'да' } });
  assert.equal(response.status, 400);
});

lanTest('выключение закрывает доступ с других устройств сразу, даже до перезапуска', async () => {
  const off = JSON.parse((await send({ method: 'PUT', path: '/api/lan', body: { enabled: false } })).text);
  assert.equal(off.enabled, false);
  assert.equal(off.token, null);
  assert.equal(off.restartRequired, true);
  const afterOff = await send({ host: lanAddress, path: '/health', headers: { cookie: `monos_token=${TOKEN}` } });
  assert.equal(afterOff.status, 403);
});
