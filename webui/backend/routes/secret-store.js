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
 * The keychain asks for a password and waits for it. That wait holds the thread that asked, and
 * in the desktop app that thread is the main process: the window and the server would stop until
 * the person types the password. So the decryption happens in a separate process and the app keeps
 * working while the system dialog is open.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_PREFIX = 'enc:v1:';

// The worker lives with the rest of the shell code; the backend reaches it by the path.
const WORKER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'electron', 'secret-worker.cjs');

let electronPromise = null;
let storageOverride = null;
let decryptBridge = null;

let workerPromise = null;
let workerSeq = 0;
const pendingDecryptions = new Map();

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
 * The worker that decrypts in its own process. One worker serves every request; it dies with the
 * app.
 */
function startWorker(electron) {
  if (!workerPromise) {
    workerPromise = new Promise((resolve, reject) => {
      let child;
      try {
        child = electron.utilityProcess.fork(WORKER_PATH, [], { stdio: 'inherit' });
      } catch (error) {
        reject(error);
        return;
      }
      child.on('message', (message) => {
        const entry = pendingDecryptions.get(message.id);
        if (!entry) return;
        pendingDecryptions.delete(message.id);
        entry.resolve(message.error ? null : message.value);
      });
      child.on('exit', () => {
        // The worker is gone: nothing can be decrypted any more, and the waiters must not hang.
        for (const entry of pendingDecryptions.values()) entry.resolve(null);
        pendingDecryptions.clear();
        workerPromise = null;
      });
      resolve(child);
    });
  }
  return workerPromise;
}

/** Decrypt in the worker process; the main process keeps running while the keychain asks. */
async function decryptInWorker(electron, raw) {
  const child = await startWorker(electron);
  const id = ++workerSeq;
  return new Promise((resolve) => {
    pendingDecryptions.set(id, { resolve });
    child.postMessage({ id, blob: raw.toString('base64') });
  });
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

  const storage = await usableSafeStorage();
  if (!storage) return { value: '', protectedAtRest: true };

  try {
    const raw = Buffer.from(text.slice(TOKEN_PREFIX.length), 'base64');
    if (decryptBridge) {
      const value = await decryptBridge(raw);
      return { value: value || '', protectedAtRest: true };
    }
    const electron = await loadElectron();
    // In the desktop app the keychain dialog would freeze the whole app while it waits for the
    // password, so the work goes to the worker process.
    if (electron?.utilityProcess) {
      const value = await decryptInWorker(electron, raw);
      return { value: value || '', protectedAtRest: true };
    }
    return { value: storage.decryptString(raw), protectedAtRest: true };
  } catch {
    return { value: '', protectedAtRest: true };
  }
}

export function isEncryptedSecret(stored) {
  return String(stored ?? '').startsWith(TOKEN_PREFIX);
}
