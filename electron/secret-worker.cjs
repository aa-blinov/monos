// The keychain asks for a password in a system dialog and waits for it. On macOS that wait holds
// the thread that asked, and in the desktop app the backend runs on that thread: the whole app
// would freeze until the person types the password. Talking to the keychain from a separate
// process keeps the app working while the dialog is open.
const { safeStorage } = require('electron');

process.parentPort.on('message', (event) => {
  const { id, op, text, blob } = event.data;
  try {
    if (op === 'available') {
      process.parentPort.postMessage({ id, value: safeStorage.isEncryptionAvailable() });
    } else if (op === 'encrypt') {
      process.parentPort.postMessage({ id, value: safeStorage.encryptString(String(text ?? '')).toString('base64') });
    } else if (op === 'decrypt') {
      process.parentPort.postMessage({ id, value: safeStorage.decryptString(Buffer.from(blob, 'base64')) });
    } else {
      process.parentPort.postMessage({ id, error: `unknown operation: ${op}` });
    }
  } catch (error) {
    // A blob from another machine or a locked keychain: the caller reads it as "no token".
    process.parentPort.postMessage({ id, error: String(error?.message || error) });
  }
});
