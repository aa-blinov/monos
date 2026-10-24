import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

// B16 (a busy port is a clean refusal, and nothing starts) and B19 (a damaged lock cannot hold the backend).
// The folder is chosen before any module of the backend is loaded: they read it once, when they are imported.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'monos-busy-'));
fs.mkdirSync(path.join(root, 'notes'));
fs.writeFileSync(path.join(root, 'notes', 'A.md'), '# a\n');
process.env.NOTES_ROOT = root;
const { lockContent, unlockContent } = await import('./note-lock.js');

test('B16: a port that is taken rejects the start with the real error, and the indexer and watcher do not start', async () => {
  const blocker = net.createServer();
  await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const { port } = blocker.address();
  const { startServer, stopServer } = await import('./index.js');
  try {
    await assert.rejects(startServer({ port, host: '127.0.0.1' }), (error) => {
      assert.equal(error.code, 'EADDRINUSE', `the listen error itself, not ${error.constructor.name}: ${error.message}`);
      assert.doesNotMatch(error.message, /Cannot read properties of null/);
      return true;
    });
    assert.equal(fs.existsSync(path.join(root, '.data', 'notes.db')), false, 'the folder was not indexed by a server that never listened');

    // After the port is free the same process starts normally.
    await new Promise((resolve) => blocker.close(resolve));
    const started = await startServer({ port, host: '127.0.0.1' });
    assert.equal(started.port, port);
    assert.equal(fs.existsSync(path.join(root, '.data', 'notes.db')), true, 'now it indexed');
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
  } finally {
    blocker.close();
    await stopServer();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function envelopeWith(text, patch) {
  const begin = '-----BEGIN MONOS LOCKED NOTE-----';
  const end = '-----END MONOS LOCKED NOTE-----';
  const body = text.slice(text.indexOf(begin) + begin.length, text.indexOf(end)).replace(/\s+/g, '');
  const envelope = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
  Object.assign(envelope, patch);
  const encoded = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
  return `---\nmonos-locked: true\n---\n\n${begin}\n${encoded}\n${end}\n`;
}

test('B19: an envelope that asks for a heavy key derivation is refused at once, not computed', () => {
  const { text } = lockContent('secret text', 'correct horse');
  for (const patch of [{ p: 64 }, { p: 4096 }, { r: 64 }, { r: 8, p: 8 }, { N: 2 ** 20, r: 8, p: 1 }, { p: 0 }, { r: -1 }, { p: 1.5 }]) {
    const started = Date.now();
    assert.throws(() => unlockContent(envelopeWith(text, patch), 'correct horse'), (error) => error.statusCode === 400, JSON.stringify(patch));
    assert.ok(Date.now() - started < 300, `${JSON.stringify(patch)} took ${Date.now() - started} ms`);
  }
});

test('B19: a note this app locked still opens', () => {
  const { text } = lockContent('secret text', 'correct horse');
  assert.equal(unlockContent(text, 'correct horse').plaintext, 'secret text');
  assert.throws(() => unlockContent(text, 'wrong'), (error) => error.statusCode === 403);
});
