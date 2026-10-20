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
 * The keychain asks for a password and waits for it. On macOS that wait holds the thread that
 * asked, and in the desktop app the backend runs on that thread: the server would stop answering
 * and the window would sit empty until the person types the password. So the app never touches the
 * keychain itself — it asks a separate process (electron/secret-worker.cjs), and the app keeps
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
const pendingCalls = new Map();

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

/**
 * The worker that talks to the keychain. One worker serves every request; it dies with the app.
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
        const entry = pendingCalls.get(message.id);
        if (!entry) return;
        pendingCalls.delete(message.id);
        entry.resolve(message.error ? null : message.value);
      });
      child.on('exit', () => {
        // The worker is gone: nothing can be decrypted any more, and the waiters must not hang.
        for (const entry of pendingCalls.values()) entry.resolve(null);
        pendingCalls.clear();
        workerPromise = null;
      });
      resolve(child);
    });
  }
  return workerPromise;
}

/** One call to the keychain, from the worker process. */
async function keychainCall(electron, message) {
  const child = await startWorker(electron);
  const id = ++workerSeq;
  return new Promise((resolve) => {
    pendingCalls.set(id, { resolve });
    child.postMessage({ id, ...message });
  });
}

/** True when a keychain is available to protect the token. */
export async function secretStorageAvailable() {
  if (storageOverride) {
    try {
      return Boolean(storageOverride.isEncryptionAvailable?.());
    } catch {
      return false;
    }
  }
  const electron = await loadElectron();
  if (electron?.utilityProcess) return Boolean(await keychainCall(electron, { op: 'available' }));
  return false;
}

/**
 * Encrypt a secret for storage.
 * @returns {Promise<{ value: string, protectedAtRest: boolean }>}
 */
export async function protectSecret(plain) {
  const text = String(plain ?? '');
  if (!text) return { value: '', protectedAtRest: false };

  if (storageOverride) {
    try {
      if (!storageOverride.isEncryptionAvailable?.()) return { value: text, protectedAtRest: false };
      const encrypted = storageOverride.encryptString(text).toString('base64');
      return { value: `${TOKEN_PREFIX}${encrypted}`, protectedAtRest: true };
    } catch {
      return { value: text, protectedAtRest: false };
    }
  }

  const electron = await loadElectron();
  if (electron?.utilityProcess) {
    const encrypted = await keychainCall(electron, { op: 'encrypt', text });
    if (!encrypted) return { value: text, protectedAtRest: false };
    return { value: `${TOKEN_PREFIX}${encrypted}`, protectedAtRest: true };
  }
  // Outside Electron there is no keychain: the token stays readable and is marked as such.
  return { value: text, protectedAtRest: false };
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
    if (storageOverride) {
      if (!storageOverride.isEncryptionAvailable?.()) return { value: '', protectedAtRest: true };
      return { value: storageOverride.decryptString(raw), protectedAtRest: true };
    }
    const electron = await loadElectron();
    if (electron?.utilityProcess) {
      const value = await keychainCall(electron, { op: 'decrypt', blob: raw.toString('base64') });
      return { value: value || '', protectedAtRest: true };
    }
    // Without Electron there is no keychain to open: the wrapped token reads as no token.
    return { value: '', protectedAtRest: true };
  } catch {
    return { value: '', protectedAtRest: true };
  }
}

export function isEncryptedSecret(stored) {
  return String(stored ?? '').startsWith(TOKEN_PREFIX);
}
