import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

// A backend on a vault of its own, for the tests of one file (the backend keeps its folder in module state, so a
// file gets one vault). `files` is `{ 'Folder/Note.md': 'text' }` written before the server starts; `lan` switches
// access from other devices on, with `lanToken`, so a request from this machine's network address is "another device".
export const lanToken = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

export const lanAddress = Object.values(os.networkInterfaces())
  .flat()
  .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address;

export async function bootVault({ files = {}, lan = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-qa-'));
  const notesDir = path.join(root, 'notes');
  fs.mkdirSync(notesDir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(notesDir, name)), { recursive: true });
    fs.writeFileSync(path.join(notesDir, name), text);
  }
  if (lan) fs.writeFileSync(path.join(root, 'lan-access.json'), JSON.stringify({ enabled: true, token: lanToken }));
  process.env.NOTES_ROOT = root;

  const server = await import('../index.js');
  const started = await server.startServer({ port: 0 });
  const port = started.port;

  // `host` is where the request comes from as far as the server can tell: 127.0.0.1 is this computer, the network
  // address of this machine is another device.
  function call(method, url, { query = {}, body, headers = {}, host = '127.0.0.1', raw } = {}) {
    const search = new URLSearchParams(query).toString();
    const payload = raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const request = http.request({
        host,
        port,
        method,
        path: search ? `${url}?${search}` : url,
        headers: {
          ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }),
          ...headers,
        },
      }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const text = buffer.toString('utf-8');
          let data = text;
          try { data = JSON.parse(text); } catch { /* not JSON */ }
          resolve({ status: response.statusCode, headers: response.headers, data, text, buffer });
        });
      });
      request.on('error', reject);
      request.end(payload);
    });
  }

  const vault = {
    root,
    notesDir,
    port,
    base: `http://127.0.0.1:${port}`,
    call,
    get: (url, options) => call('GET', url, options),
    post: (url, options) => call('POST', url, options),
    put: (url, options) => call('PUT', url, options),
    del: (url, options) => call('DELETE', url, options),
    file: (relative) => path.join(notesDir, relative),
    exists: (relative) => fs.existsSync(path.join(notesDir, relative)),
    read: (relative) => fs.readFileSync(path.join(notesDir, relative), 'utf-8'),
    write(relative, text) {
      fs.mkdirSync(path.dirname(path.join(notesDir, relative)), { recursive: true });
      fs.writeFileSync(path.join(notesDir, relative), text);
    },
    server,
    async stop() {
      await server.stopServer();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
  return vault;
}
