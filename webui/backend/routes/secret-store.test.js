import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const KEY = Buffer.from('0123456789abcdef0123456789abcdef');

/**
 * Stands in for Electron's safeStorage: encrypt/decrypt with a fixed key, and
 * reject anything it did not produce — which is exactly what a real keychain
 * does when handed a blob from somewhere else.
 */
function fakeKeychain() {
  return {
    isEncryptionAvailable: () => true,
    // AES-256-CBC needs a 16-byte IV, not the 12 bytes GCM uses. Getting this
    // wrong throws inside encryptString — which is exactly how the first run of
    // this file silently degraded to plaintext storage.
    encryptString(text) {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
      return Buffer.concat([iv, cipher.update(String(text), 'utf8'), cipher.final()]);
    },
    decryptString(buffer) {
      const iv = buffer.subarray(0, 16);
      const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
      return Buffer.concat([decipher.update(buffer.subarray(16)), decipher.final()]).toString('utf8');
    },
  };
}

const store = await import('./secret-store.js');

test.afterEach(() => store.setStorageOverride(null));

test('вне keychain токен остаётся читаемым, но помечается незащищённым', async () => {
  const result = await store.protectSecret('ghp_example');
  assert.equal(result.value, 'ghp_example');
  assert.equal(result.protectedAtRest, false);
  assert.equal(await store.secretStorageAvailable(), false);
});

test('с keychain секрет оборачивается и не читается как есть', async () => {
  store.setStorageOverride(fakeKeychain());
  const token = 'ghp_' + 'x'.repeat(36);

  const { value, protectedAtRest } = await store.protectSecret(token);
  assert.equal(protectedAtRest, true);
  assert.equal(store.isEncryptedSecret(value), true);
  assert.ok(!value.includes(token), 'открытого токена в значении быть не должно');
  assert.ok(!value.startsWith('ghp_'));

  const back = await store.revealSecret(value);
  assert.equal(back.value, token, 'round-trip должен вернуть исходный токен');
  assert.equal(back.protectedAtRest, true);
});

test('каждый вызов даёт разный шифротекст для одного токена', async () => {
  store.setStorageOverride(fakeKeychain());
  const a = await store.protectSecret('ghp_same');
  const b = await store.protectSecret('ghp_same');
  assert.notEqual(a.value, b.value, 'IV должен делать шифротекст неповторяющимся');
  assert.equal((await store.revealSecret(a.value)).value, 'ghp_same');
  assert.equal((await store.revealSecret(b.value)).value, 'ghp_same');
});

test('обёрнутый секрет без доступного keychain читается как «нет токена», а не как мусор', async () => {
  store.setStorageOverride(fakeKeychain());
  const { value } = await store.protectSecret('ghp_secret');

  // Simulates the database travelling to a machine with no keychain, or a
  // locked one. Pushing raw bytes at GitHub would be worse than doing nothing.
  store.setStorageOverride({ isEncryptionAvailable: () => false });
  const result = await store.revealSecret(value);
  assert.equal(result.value, '');
  assert.equal(result.protectedAtRest, true);
});

test('повреждённый шифротекст не превращается в мусор', async () => {
  store.setStorageOverride(fakeKeychain());
  const result = await store.revealSecret('enc:v1:bm90LXJlYWxseS1jaXBoZXJ0ZXh0');
  assert.equal(result.value, '');
});

test('пустой секрет не оборачивается', async () => {
  store.setStorageOverride(fakeKeychain());
  const result = await store.protectSecret('');
  assert.equal(result.value, '');
  assert.equal(result.protectedAtRest, false);
});

test('значение без префикса читается как есть — обратная совместимость', async () => {
  store.setStorageOverride(fakeKeychain());
  // A token stored before this feature existed is still plain text in the DB.
  const result = await store.revealSecret('ghp_legacy_plaintext');
  assert.equal(result.value, 'ghp_legacy_plaintext');
  assert.equal(result.protectedAtRest, false);
});
test('поломка keychain не роняет сохранение, но честно сообщает, что секрет открыт', async () => {
  store.setStorageOverride({
    isEncryptionAvailable: () => true,
    encryptString() { throw new Error('keychain unavailable'); },
    decryptString() { throw new Error('keychain unavailable'); },
  });
  const result = await store.protectSecret('ghp_still_saved');
  assert.equal(result.protectedAtRest, false, 'сбой должен быть виден, а не замаскирован');
  assert.equal(result.value, 'ghp_still_saved', 'сохранение продолжает работать');
});
