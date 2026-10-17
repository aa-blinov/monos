// The agent terminal: real shells for the window, run by this (main) process with node-pty.
//
// The shell never leaves this device. The page reaches it only through the preload bridge
// (window.monosTerminal), over IPC that answers this app's own window and nothing else; the backend
// has no terminal route, so a browser or a phone that opens the notes over Wi-Fi has no way in.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_SESSIONS = 8;
// Output is sent to the page at most once a frame: a busy agent writes thousands of small chunks.
const FLUSH_MS = 16;

function defaultShell() {
  if (process.platform === 'win32') return { file: process.env.COMSPEC || 'powershell.exe', args: [] };
  // A login shell reads the person's profile: an app started from the Dock or Finder has a bare PATH,
  // and their agent CLI would not be found without it.
  return { file: process.env.SHELL || (fs.existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/bash'), args: ['-l'] };
}

function shellEnv() {
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'Monos', MONOS_TERMINAL: '1' };
  // Apps started from the Dock get no locale; without one, shells and CLIs mangle non-ASCII text.
  if (!env.LANG && process.platform !== 'win32') env.LANG = 'en_US.UTF-8';
  // The packaged app's own ELECTRON_* variables would make a node-based CLI start as Electron.
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

/**
 * @param {{ ipcMain: Electron.IpcMain, getWindow: () => Electron.BrowserWindow | null, getOrigin: () => string, getCwd: () => string }} options
 */
function registerTerminal({ ipcMain, getWindow, getOrigin, getCwd }) {
  let pty = null;
  const sessions = new Map();
  let nextId = 1;

  // Only this app's window, showing this app's page, may drive a shell.
  function trusted(event) {
    const win = getWindow();
    if (!win || event.sender !== win.webContents) return false;
    try {
      return new URL(event.senderFrame?.url || '').origin === getOrigin();
    } catch {
      return false;
    }
  }

  function send(channel, ...args) {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
  }

  ipcMain.handle('terminal:create', (event, options = {}) => {
    if (!trusted(event)) throw new Error('Not allowed');
    if (sessions.size >= MAX_SESSIONS) throw new Error('Too many terminals');
    pty ??= require('node-pty');
    const { file, args } = defaultShell();
    const cwd = getCwd();
    const id = nextId++;
    const proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: Math.max(20, Math.min(500, Number(options.cols) || 80)),
      rows: Math.max(5, Math.min(200, Number(options.rows) || 24)),
      cwd: fs.existsSync(cwd) ? cwd : os.homedir(),
      env: shellEnv(),
    });
    const session = { proc, buffer: '', timer: null };
    proc.onData((data) => {
      session.buffer += data;
      if (session.timer) return;
      session.timer = setTimeout(() => {
        session.timer = null;
        const chunk = session.buffer;
        session.buffer = '';
        send('terminal:data', id, chunk);
      }, FLUSH_MS);
    });
    proc.onExit(({ exitCode }) => {
      if (session.timer) clearTimeout(session.timer);
      if (session.buffer) send('terminal:data', id, session.buffer);
      sessions.delete(id);
      send('terminal:exit', id, exitCode);
    });
    sessions.set(id, session);
    return { id, cwd: path.basename(cwd), shell: path.basename(file) };
  });

  ipcMain.on('terminal:write', (event, id, data) => {
    if (!trusted(event) || typeof data !== 'string') return;
    sessions.get(id)?.proc.write(data);
  });

  ipcMain.on('terminal:resize', (event, id, cols, rows) => {
    if (!trusted(event)) return;
    const session = sessions.get(id);
    if (!session) return;
    try {
      session.proc.resize(Math.max(20, Math.min(500, cols | 0)), Math.max(5, Math.min(200, rows | 0)));
    } catch {
      // the shell exited between the resize and now
    }
  });

  ipcMain.on('terminal:kill', (event, id) => {
    if (!trusted(event)) return;
    sessions.get(id)?.proc.kill();
  });

  /** Ends every shell: the window closed or the app quits. */
  return function killAll() {
    for (const { proc } of sessions.values()) {
      try { proc.kill(); } catch { /* already gone */ }
    }
    sessions.clear();
  };
}

module.exports = { registerTerminal };
