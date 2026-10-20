const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, Menu, dialog, ipcMain, screen, session, shell } = require('electron');
const { registerTerminal } = require('./terminal.cjs');
const { APP_NAME, buildMenuTemplate, buildDockTemplate, buildContextMenuTemplate } = require('./menu.cjs');
const {
  MIN_WIDTH, MIN_HEIGHT, DEFAULT_WIDTH, DEFAULT_HEIGHT,
  readWindowState, writeWindowState, boundsOnScreen,
} = require('./window-state.cjs');

const APP_DATA_DIR = 'MonosData';
const APP_HOST = '127.0.0.1';
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
let appOrigin = '';
// The folder the terminal opens in: the notes folder the backend uses (it may be one chosen in Settings).
let notesDir = '';
let killTerminals = () => {};
let menuLocale = 'en';
// A command that came when there was no window: it waits for the page of the new one.
let pendingMenuCommand = null;
// What the window shows right now: the menu draws its checkmarks from this.
let menuState = { hasNote: false, outline: false, focus: false, sidebar: false, terminal: false, notePath: '', noteTitle: '', recent: [] };

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
    return;
  }
  // The menu speaks the interface language. The system language is the first guess; the page
  // sends the language it actually uses, so a choice made in Settings wins.
  menuLocale = String(app.getLocale() || '').slice(0, 2) === 'ru' ? 'ru' : 'en';
  applyApplicationMenu();
}

// The menu bar. Every command it carries goes to the page, which owns the actions.
function applyApplicationMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(menuLocale, sendMenuCommand, menuState)));
  applyDockMenu();
}

// The menu under the Dock icon: the same commands, in the place macOS puts them.
function applyDockMenu() {
  if (!app.dock) return;
  const template = buildDockTemplate(menuLocale, sendMenuCommand, menuState);
  app.dock.setMenu(Menu.buildFromTemplate(template));
}

function sendMenuCommand(command, payload) {
  // «Показать в Finder» — дело оболочки: путь к заметке она уже знает.
  if (command === 'reveal-in-finder') {
    const notePath = String(menuState.notePath || '');
    if (notePath.startsWith('notes/')) shell.showItemInFolder(path.join(notesDir, notePath.slice('notes/'.length)));
    return;
  }
  // «Печать…» — тоже дело оболочки: путь к заметке она знает и системный диалог печати открывает она.
  if (command === 'print') {
    void printCurrentNote();
    return;
  }
  // «Закрыть окно» — дело оболочки: окно её. Правки страницы она сольёт сама (см. обработчик close).
  if (command === 'close-window') {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
    return;
  }
  // The Dock menu's own commands: the app hides and shows itself.
  if (command === 'hide-app') {
    app.hide();
    return;
  }
  if (command === 'show-app') {
    app.show();
    return;
  }
  const win = mainWindow;
  if (!win || win.isDestroyed()) {
    // Окна нет: команда ждёт нового окна, иначе она упала бы в закрытый webContents.
    pendingMenuCommand = { command, payload };
    if (backendServer?.address?.()) createWindow(backendServer.address().port);
    return;
  }
  win.webContents.send('menu:command', command, payload);
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
  notesDir = backendModule.NOTES_DIR;
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
  // The window may be closed while the app is still running: then a new one opens.
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (backendServer?.address?.()) createWindow(backendServer.address().port);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

// The note goes to the printer as a document of its own: a hidden window loads the printed
// version of the note and hands it to the system print dialog.
async function printCurrentNote() {
  const notePath = String(menuState.notePath || '');
  const address = backendServer?.address?.();
  if (!notePath || !address) return;
  const url = `http://${APP_HOST}:${address.port}/api/print/note?path=${encodeURIComponent(notePath)}`;
  // A sealed note answers with an error: the print dialog must not open on that page.
  const response = await fetch(url).catch(() => null);
  if (!response?.ok) {
    const detail = response ? (await response.json().catch(() => ({}))).detail : null;
    reportPrintFailure(detail || response?.status || 'no answer');
    return;
  }
  const printer = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
  try {
    await printer.loadURL(url);
    printer.webContents.print({ printBackground: true }, (ok, reason) => {
      printer.destroy();
      // The person closing the print panel is not a failure; anything else is.
      if (!ok && !/cancel/i.test(reason || '')) reportPrintFailure(reason);
    });
  } catch (error) {
    printer.destroy();
    reportPrintFailure(error?.message);
  }
}

function reportPrintFailure(reason) {
  const text = /no printers/i.test(reason || '')
    ? (menuLocale === 'ru' ? 'не найден ни один принтер' : 'no printer found')
    : String(reason || '');
  dialog.showErrorBox(APP_NAME, menuLocale === 'ru' ? `Не удалось напечатать заметку: ${text}` : `Could not print the note: ${text}`);
}

function createWindow(port) {
  const icon = runtimeIconPath();
  appOrigin = `http://${APP_HOST}:${port}`;
  if (icon && app.dock) app.dock.setIcon(icon);

  // The window opens where it was left. A window saved on a monitor that is now gone would open
  // outside the desktop, so it opens at the usual size instead.
  const saved = readWindowState(app.getPath('userData'));
  const bounds = saved && boundsOnScreen(saved, screen.getAllDisplays())
    ? saved
    : { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    ...(icon ? { icon } : {}),
    autoHideMenuBar: process.platform !== 'darwin',
    show: false,
    backgroundColor: '#282828',
    // The preload gives only this window the terminal bridge; windows it opens (the print view) get none.
    webPreferences: { ...SECURE_WEB_PREFERENCES, preload: path.join(__dirname, 'preload.cjs') },
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
  // Правый клик: в тексте — родное меню macOS, в остальном — меню приложения (оно нарисовано в странице).
  // Меню Chromium с пунктами «Reload» и «Inspect» в приложении не появляется никогда.
  mainWindow.webContents.on('context-menu', (event, params) => {
    event.preventDefault();
    if (!params.isEditable) return;
    Menu.buildFromTemplate(buildContextMenuTemplate(menuLocale)).popup();
  });
  // The window keeps its size and place for the next launch. The writes are held back while the
  // window is being dragged or resized, and happen once when it settles.
  let rememberTimer = null;
  const rememberWindow = () => {
    clearTimeout(rememberTimer);
    rememberTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        writeWindowState(app.getPath('userData'), mainWindow.getNormalBounds());
      }
    }, 500);
  };
  mainWindow.on('resize', rememberWindow);
  mainWindow.on('move', rememberWindow);
  // Closing the window must not drop the last edits: the page saves first, then the
  // window closes. Components are not destroyed on close, so the page cannot do this itself.
  // During a quit the flush already happened (see before-quit), so the close is not held.
  windowFlushed = false;
  mainWindow.on('close', (event) => {
    writeWindowState(app.getPath('userData'), mainWindow.getNormalBounds());
    if (quitFlushed || windowFlushed) return;
    event.preventDefault();
    windowFlushed = true;
    const win = mainWindow;
    void flushPendingEdits(win).finally(() => win?.close());
  });
  // A closed window's shells end with it.
  mainWindow.on('closed', () => killTerminals());
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  // The command that came while there was no window goes to the page that has just loaded.
  mainWindow.webContents.on('did-finish-load', () => {
    if (!pendingMenuCommand) return;
    const { command, payload } = pendingMenuCommand;
    pendingMenuCommand = null;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('menu:command', command, payload);
  });
  mainWindow.loadURL(`${appOrigin}/`);
}

async function boot() {
  try {
    configureApplicationMenu();
    configureSessionPermissions();
    const port = await startBackend();
    killTerminals = registerTerminal({
      ipcMain,
      getWindow: () => mainWindow,
      getOrigin: () => appOrigin,
      getCwd: () => notesDir,
    });
    createWindow(port);
  } catch (error) {
    // Приложение ещё не поднялось — язык интерфейса известен только по системе.
    dialog.showErrorBox(menuLocale === 'ru' ? 'Monos не запустился' : 'Monos failed to start', error?.stack || error?.message || String(error));
    app.quit();
  }
}

// One running copy per notes folder: a second copy would index the same database.
// The second launch hands its focus to the window that is already open.
// The page knows the language it is in; the menu follows it.
ipcMain.on('menu:locale', (_event, locale) => {
  const next = locale === 'ru' ? 'ru' : 'en';
  if (next === menuLocale) return;
  menuLocale = next;
  if (process.platform === 'darwin') applyApplicationMenu();
});

// The page reports what the window shows: the menu answers with checkmarks and greyed-out items.
ipcMain.on('menu:state', (_event, state) => {
  const next = { ...menuState, ...(state && typeof state === 'object' ? state : {}) };
  const title = next.noteTitle ? `${next.noteTitle} — ${APP_NAME}` : APP_NAME;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.getTitle() !== title) mainWindow.setTitle(title);
  if (Object.keys(next).every((key) => next[key] === menuState[key])) return;
  menuState = next;
  if (process.platform === 'darwin') applyApplicationMenu();
});

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

// The notes this device changed go to GitHub before the backend stops, when the person chose it in Settings.
// Bounded: a slow network must not hold the quit. What did not go up is uploaded at the next sync.
const QUIT_SYNC_TIMEOUT_MS = 20_000;

async function syncOnQuit() {
  const address = backendServer?.address?.();
  if (!address) return;
  try {
    await fetch(`http://127.0.0.1:${address.port}/api/git/sync-on-quit`, {
      method: 'POST',
      signal: AbortSignal.timeout(QUIT_SYNC_TIMEOUT_MS),
    });
  } catch {
    // Offline, or the upload ran out of time: the quit goes on.
  }
}

// Every page saves what it still holds before any window closes. The quit is held
// until then and started again afterwards: a close cancelled during a quit would
// cancel the whole quit, and on macOS the app would stay open.
app.on('before-quit', (event) => {
  if (quitFlushed) return;
  event.preventDefault();
  Promise.all(BrowserWindow.getAllWindows().map(flushPendingEdits)).then(syncOnQuit).finally(() => {
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
