const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, Menu, dialog, session, shell } = require('electron');

const APP_DATA_DIR = 'MonosData';
const APP_HOST = '127.0.0.1';
const MIN_WIDTH = 360;
const MIN_HEIGHT = 640;
// How long a closing window may take to save its last edits before it closes anyway.
const FLUSH_TIMEOUT_MS = 3000;
const SECURE_WEB_PREFERENCES = Object.freeze({
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
});
// The permissions the page actually uses (notifications for reminders, clipboard for
// paste and quick notes). Electron grants everything else to any page by default:
// camera, microphone, location and the rest are refused.
const ALLOWED_PERMISSIONS = new Set(['notifications', 'clipboard-read', 'clipboard-sanitized-write']);

let mainWindow = null;
let backendModule = null;
let backendServer = null;
// A window that closes on its own flushes first; so does a quit, once, before any window closes.
let windowFlushed = false;
let quitFlushed = false;
let backendStopped = false;

function copyDirectoryIfMissing(source, target) {
  if (!source || !fs.existsSync(source) || fs.existsSync(target)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function appPath(...segments) {
  return path.join(app.getAppPath(), ...segments);
}

function resourcePath(...segments) {
  return path.join(process.resourcesPath, ...segments);
}

function runtimeIconPath() {
  const iconPath = appPath('build', 'icon.png');
  return fs.existsSync(iconPath) ? iconPath : undefined;
}

function configureApplicationMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }
}

function prepareUserNotesRoot() {
  const notesRoot = path.join(app.getPath('userData'), APP_DATA_DIR);
  const notesDir = path.join(notesRoot, 'notes');
  const seedNotesDir = app.isPackaged
    ? resourcePath('seed-notes')
    : appPath('notes');

  copyDirectoryIfMissing(seedNotesDir, notesDir);
  fs.mkdirSync(notesDir, { recursive: true });
  fs.mkdirSync(path.join(notesRoot, '.data'), { recursive: true });

  return notesRoot;
}

async function startBackend() {
  const notesRoot = prepareUserNotesRoot();
  const frontendDist = appPath('webui', 'frontend', 'dist');

  process.env.NOTES_ROOT = notesRoot;
  process.env.FRONTEND_DIST = frontendDist;
  // Development runs the backend from the repository, where webui/backend/node_modules
  // holds the copy built for plain Node. Use the copy built for Electron instead, the
  // one the packaged app ships from the root node_modules. Packaged builds need nothing here.
  if (!app.isPackaged) {
    const electronBinding = appPath('node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
    if (fs.existsSync(electronBinding)) process.env.MONOS_SQLITE_BINDING = electronBinding;
  }

  backendModule = await import(pathToFileURL(appPath('webui', 'backend', 'index.js')).href);
  // The address follows the access setting (this computer only, unless other devices are allowed).
  const started = await backendModule.startServer({ port: 0 });
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${started.port}`;
  backendServer = started.server;
  return started.port;
}

function configureSessionPermissions() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => (
    ALLOWED_PERMISSIONS.has(permission)
  ));
}

function isUrlFromOrigin(url, origin) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

// Ask the page to save what it still holds. Bounded: a page that hung or crashed
// must not keep the window open.
function flushPendingEdits(win) {
  const flush = win.webContents.executeJavaScript(
    'typeof window.monosFlushPendingEdits === "function" ? window.monosFlushPendingEdits() : null',
    true,
  ).catch(() => {});
  const timeout = new Promise((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS));
  return Promise.race([flush, timeout]);
}

function focusMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function createWindow(port) {
  const icon = runtimeIconPath();
  const appOrigin = `http://${APP_HOST}:${port}`;
  if (icon && app.dock) app.dock.setIcon(icon);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    ...(icon ? { icon } : {}),
    autoHideMenuBar: process.platform !== 'darwin',
    show: false,
    backgroundColor: '#282828',
    webPreferences: { ...SECURE_WEB_PREFERENCES },
  });

  if (process.platform !== 'darwin') mainWindow.setMenu(null);
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      if (new URL(targetUrl).origin !== appOrigin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  // target="_blank" links (such as the GitHub token help) open in the system browser,
  // not in a new window inside the app. The print view is this app's own page and may
  // open; any other window is refused.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isUrlFromOrigin(url, appOrigin)) {
      return { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { ...SECURE_WEB_PREFERENCES } } };
    }
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // Closing the window must not drop the last edits: the page saves first, then the
  // window closes. Components are not destroyed on close, so the page cannot do this itself.
  // During a quit the flush already happened (see before-quit), so the close is not held.
  windowFlushed = false;
  mainWindow.on('close', (event) => {
    if (quitFlushed || windowFlushed) return;
    event.preventDefault();
    windowFlushed = true;
    const win = mainWindow;
    void flushPendingEdits(win).finally(() => win?.close());
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.loadURL(`${appOrigin}/`);
}

async function boot() {
  try {
    configureApplicationMenu();
    configureSessionPermissions();
    const port = await startBackend();
    createWindow(port);
  } catch (error) {
    dialog.showErrorBox('Monos failed to start', error?.stack || error?.message || String(error));
    app.quit();
  }
}

// One running copy per notes folder: a second copy would index the same database.
// The second launch hands its focus to the window that is already open.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(boot);
  app.on('second-instance', focusMainWindow);
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && backendServer?.address?.()) {
    createWindow(backendServer.address().port);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Every page saves what it still holds before any window closes. The quit is held
// until then and started again afterwards: a close cancelled during a quit would
// cancel the whole quit, and on macOS the app would stay open.
app.on('before-quit', (event) => {
  if (quitFlushed) return;
  event.preventDefault();
  Promise.all(BrowserWindow.getAllWindows().map(flushPendingEdits)).finally(() => {
    quitFlushed = true;
    app.quit();
  });
});

// The backend stops after the windows have closed and flushed. Stopping it on
// before-quit cut off the saves the pages were still sending.
// The last step exits directly. A quit that starts from a terminal signal (SIGTERM, SIGINT, Ctrl+C where the app was
// started) does not end the process when this step calls app.quit() again: the window has closed and the backend
// has stopped, so there is nothing left to wait for. app.exit ends the process at once.
app.on('will-quit', (event) => {
  if (backendStopped || !backendModule?.stopServer) return;
  event.preventDefault();
  backendModule.stopServer().finally(() => {
    backendStopped = true;
    app.exit(0);
  });
});

// A terminal signal (`kill`, Ctrl+C where the app was started) quits the app the way Cmd+Q does: the windows save
// what they hold, then the backend stops. The backend's own signal handler only stops the server, which left the
// window open with nothing behind it.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => app.quit());
}
