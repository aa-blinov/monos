import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { bootVault, lanAddress, lanToken } from './support/vault.js';
import { setDecryptBridge, setStorageOverride } from './routes/secret-store.js';

// The keychain asks for a password and the backend lives in the main process, so a read of the token freezes the whole
// app. These tests pin where the token may be decrypted: on demand, never while the settings are loaded.
const vault = await bootVault({ lan: true, files: { 'Welcome.md': '# Welcome\n' } });
const bearer = { authorization: `Bearer ${lanToken}` };
const lanTest = lanAddress ? test : test.skip;

const KEY = Buffer.from('0123456789abcdef0123456789abcdef');
function fakeKeychain() {
  return {
    isEncryptionAvailable: () => true,
    encryptString(text) {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
      return Buffer.concat([iv, cipher.update(String(text), 'utf8'), cipher.final()]);
    },
    decryptString(buffer) {
      const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, buffer.subarray(0, 16));
      return Buffer.concat([decipher.update(buffer.subarray(16)), decipher.final()]).toString('utf8');
    },
  };
}

// Counts every decryption the server asks for.
let decrypts = 0;
function spyOnKeychain() {
  const keychain = fakeKeychain();
  decrypts = 0;
  setStorageOverride({
    ...keychain,
    decryptString(buffer) {
      decrypts += 1;
      return keychain.decryptString(buffer);
    },
  });
  setDecryptBridge(async (raw) => {
    decrypts += 1;
    return keychain.decryptString(raw);
  });
}

after(() => vault.stop());
afterEach(() => {
  setStorageOverride(null);
  setDecryptBridge(null);
});

async function storeToken(token = 'ghp_stored_token') {
  setStorageOverride(fakeKeychain());
  assert.equal((await vault.post('/api/settings', { body: { git_token: token } })).status, 200);
  spyOnKeychain();
}

test('GET /api/settings never decrypts the token: it says only that one is stored', async () => {
  await storeToken();
  const response = await vault.get('/api/settings');
  assert.equal(response.status, 200);
  assert.equal(decrypts, 0, 'the keychain was not asked');
  assert.equal(response.data.git_token_set, true);
  assert.equal(response.data.git_token, undefined, 'the secret is not in the settings');
  assert.ok(!response.text.includes('ghp_stored_token') && !response.text.includes('enc:v1:'));
});

test('GET /api/settings says no token when none is stored, or when it was cleared', async () => {
  await storeToken();
  assert.equal((await vault.post('/api/settings', { body: { git_token: null } })).status, 200);
  const response = await vault.get('/api/settings');
  assert.equal(response.data.git_token_set, false);
  assert.equal(response.data.git_token, undefined);
  assert.equal(decrypts, 0);
});

test('GET /api/settings/secret decrypts on demand, for this computer', async () => {
  await storeToken('ghp_on_demand');
  const response = await vault.get('/api/settings/secret', { query: { key: 'git_token' } });
  assert.equal(response.status, 200);
  assert.equal(response.data.value, 'ghp_on_demand');
  assert.equal(decrypts, 1, 'one decryption, asked for');
});

test('GET /api/settings/secret answers an empty value when no token is stored and refuses other keys', async () => {
  await storeToken();
  await vault.post('/api/settings', { body: { git_token: null } });
  const empty = await vault.get('/api/settings/secret', { query: { key: 'git_token' } });
  assert.equal(empty.status, 200);
  assert.equal(empty.data.value, '');
  for (const key of ['theme', 'git_owner', '', 'git_token_protected']) {
    const refused = await vault.get('/api/settings/secret', { query: { key } });
    assert.equal(refused.status, 400, `key "${key}"`);
    assert.equal(refused.data.code, 'invalid_secret');
  }
});

lanTest('GET /api/settings/secret is refused for another device, even with the access token', async () => {
  await storeToken('ghp_not_for_devices');
  const anonymous = await vault.get('/api/settings/secret', { host: lanAddress, query: { key: 'git_token' } });
  assert.equal(anonymous.status, 401, 'a device without the access token is not let in at all');
  const response = await vault.get('/api/settings/secret', { host: lanAddress, headers: bearer, query: { key: 'git_token' } });
  assert.equal(response.status, 403);
  assert.equal(response.data.code, 'this_computer_only');
  assert.ok(!response.text.includes('ghp_not_for_devices'));
  const settings = await vault.get('/api/settings', { host: lanAddress, headers: bearer });
  assert.equal(settings.data.git_token_set, undefined, 'a device is not told whether a token exists');
  assert.equal(decrypts, 0);
});

test('saving the settings form does not wipe the stored token', async () => {
  await storeToken('ghp_survives');
  // The form saves the whole object: the placeholders it holds must not replace the token.
  for (const body of [
    { git_token_set: true, git_owner: 'alice' },
    { git_token: '', git_owner: 'alice' },
    { git_token_set: false, git_token: '' },
  ]) {
    assert.equal((await vault.post('/api/settings', { body })).status, 200);
    assert.equal((await vault.get('/api/settings')).data.git_token_set, true, JSON.stringify(body));
    assert.equal((await vault.get('/api/settings/secret', { query: { key: 'git_token' } })).data.value, 'ghp_survives');
  }
});

test('an explicit null clears the token, and a new token replaces it', async () => {
  await storeToken('ghp_old');
  assert.equal((await vault.post('/api/settings', { body: { git_token: 'ghp_new' } })).status, 200);
  assert.equal((await vault.get('/api/settings/secret', { query: { key: 'git_token' } })).data.value, 'ghp_new');
  assert.equal((await vault.post('/api/settings', { body: { git_token: null } })).status, 200);
  assert.equal((await vault.get('/api/settings')).data.git_token_set, false);
  assert.equal((await vault.get('/api/settings/secret', { query: { key: 'git_token' } })).data.value, '');
});
