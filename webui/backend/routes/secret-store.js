/**
 * Secret storage for the Git token.
 *
 * The token grants access to the user's private repositories. Storing it as
 * plaintext meant any local process — or any other local user on a shared
 * machine — could read a token with repo scope straight out of notes.db.
 *
 * Electron's `safeStorage` wraps the OS keychain (Keychain on macOS, DPAPI on
 * Windows, libsecret on Linux) and adds no dependency. Outside Electron there
 * is no keychain to talk to, so the token stays plaintext and is marked as
 * such, rather than being silently wrapped in something that protects nothing.
 *
 * The keychain asks for a password and waits for it, and that wait holds the
 * thread that asked. `safeStorage` exists only in the main process, so the wait
 * holds the backend: the server stops answering while the dialog is open. There
 * is no way around it from the app — a separate process cannot reach the
 * keychain (`utilityProcess` offers no `safeStorage`). What removes the wait is
 * the answer "Always Allow" in that dialog: afterwards the keychain opens
 * without asking, and nothing waits.
 *
 * So `revealSecret` runs only where the token is used: never at start and never
 * for a plain settings load (`GET /api/settings` reports `git_token_set`
 * instead), only on `GET /api/settings/secret` and in the git routes.
 */

const TOKEN_PREFIX = 'enc:v1:';

let electronPromise = null;
let storageOverride = null;
let decryptBridge = null;

/** Supply a keychain implementation directly. Used by tests. */
export function setStorageOverride(storage) {
  storageOverride = storage;
}

/** Supply the decryption directly. Used by tests. */
export function setDecryptBridge(bridge) {
  decryptBridge = bridge;
}

/** Lazily resolve Electron; it only exists when hosted by the main process. */
async function loadElectron() {
  if (electronPromise) return electronPromise;
  electronPromise = import('electron').catch(() => null);
  return electronPromise;
}

/** A keychain that is present and unlocked, or null. */
async function usableSafeStorage() {
  if (storageOverride) {
    return typeof storageOverride.isEncryptionAvailable === 'function'
      && storageOverride.isEncryptionAvailable()
      ? storageOverride
      : null;
  }
  const electron = await loadElectron();
  const storage = electron?.safeStorage;
  if (!storage || typeof storage.isEncryptionAvailable !== 'function') return null;
  try {
    return storage.isEncryptionAvailable() ? storage : null;
  } catch {
    return null;
  }
}

/** True when a keychain is available to protect the token. */
export async function secretStorageAvailable() {
  return Boolean(await usableSafeStorage());
}

/**
 * Encrypt a secret for storage.
 * @returns {Promise<{ value: string, protectedAtRest: boolean }>}
 */
export async function protectSecret(plain) {
  const text = String(plain ?? '');
  if (!text) return { value: '', protectedAtRest: false };

  const storage = await usableSafeStorage();
  if (!storage) return { value: text, protectedAtRest: false };

  try {
    const encrypted = storage.encryptString(text).toString('base64');
    return { value: `${TOKEN_PREFIX}${encrypted}`, protectedAtRest: true };
  } catch {
    return { value: text, protectedAtRest: false };
  }
}

/**
 * Decrypt a stored secret.
 *
 * Returns `{ value: '' }` when the blob is keychain-wrapped but no keychain is
 * reachable — a database moved to another machine, or a locked keychain. That
 * must read as "no token", never as garbage pushed at GitHub.
 *
 * @returns {Promise<{ value: string, protectedAtRest: boolean }>}
 */
export async function revealSecret(stored) {
  const text = String(stored ?? '');
  if (!text) return { value: '', protectedAtRest: false };
  if (!text.startsWith(TOKEN_PREFIX)) return { value: text, protectedAtRest: false };

  try {
    const raw = Buffer.from(text.slice(TOKEN_PREFIX.length), 'base64');
    if (decryptBridge) {
      const value = await decryptBridge(raw);
      return { value: value || '', protectedAtRest: true };
    }
    const storage = await usableSafeStorage();
    if (!storage) return { value: '', protectedAtRest: true };
    return { value: storage.decryptString(raw), protectedAtRest: true };
  } catch {
    return { value: '', protectedAtRest: true };
  }
}

export function isEncryptedSecret(stored) {
  return String(stored ?? '').startsWith(TOKEN_PREFIX);
}
