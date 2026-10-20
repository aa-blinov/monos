// The keychain asks for a password in a system dialog and waits for it. On macOS that wait
// holds the thread that asked, and the main process is that thread — the whole app would freeze
// until the person types the password. Decrypting here, in a separate process, keeps the window
// and the server alive while the dialog is open.
const { safeStorage } = require('electron');

process.parentPort.on('message', (event) => {
  const { id, blob } = event.data;
  try {
    const value = safeStorage.decryptString(Buffer.from(blob, 'base64'));
    process.parentPort.postMessage({ id, value });
  } catch (error) {
    // A blob from another machine or a locked keychain: the caller reads it as "no token".
    process.parentPort.postMessage({ id, error: String(error?.message || error) });
  }
});
