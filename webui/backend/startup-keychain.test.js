import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { bootVault } from './support/vault.js';
import { setDecryptBridge, setStorageOverride } from './routes/secret-store.js';

// An update changes the code signature, and the next read of the keychain asks for the login password while the whole
// app waits. A start on a vault that holds an encrypted token must therefore never reach the keychain.
const vault = await bootVault({ files: { 'Welcome.md': '# Welcome\n', 'Topic/Alpha.md': '# Alpha [[Welcome]]\n' } });
after(() => vault.stop());

const KEY = Buffer.from('0123456789abcdef0123456789abcdef');
const keychain = {
  isEncryptionAvailable: () => true,
  encryptString(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
    return Buffer.concat([iv, cipher.update(String(text), 'utf8'), cipher.final()]);
  },
};

test('a start on a vault with an encrypted token, then the first requests of the app, never touch the keychain', async () => {
  setStorageOverride(keychain);
  assert.equal((await vault.post('/api/settings', { body: { git_token: 'ghp_asleep', theme: 'nord' } })).status, 200);
  await vault.server.stopServer();

  const touched = [];
  const trap = (name) => () => { touched.push(name); throw new Error(`the keychain was touched: ${name}`); };
  setStorageOverride(new Proxy({}, { get: (_target, name) => trap(String(name)) }));
  setDecryptBridge(async () => { touched.push('decrypt bridge'); throw new Error('the keychain was touched: decrypt bridge'); });

  try {
    const started = await vault.server.startServer({ port: 0 });
    const base = `http://127.0.0.1:${started.port}`;
    // What the app asks for while it opens: health, the tree, the settings, the notes list, git status.
    for (const url of ['/health', '/api/tree', '/api/settings', '/api/notes/recent', '/api/git/status', '/api/directories']) {
      const response = await fetch(base + url);
      assert.ok(response.status < 500, `${url} answered ${response.status}`);
    }
    const settings = await (await fetch(`${base}/api/settings`)).json();
    assert.equal(settings.git_token_set, true);
    assert.equal(settings.theme, 'nord');
    assert.deepEqual(touched, [], 'nothing asked the keychain');
  } finally {
    setStorageOverride(null);
    setDecryptBridge(null);
  }
});
