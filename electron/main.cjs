const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, Menu, dialog } = require('electron');

const APP_DATA_DIR = 'MonosData';
const MIN_WIDTH = 360;
const MIN_HEIGHT = 640;

let mainWindow = null;
let backendModule = null;
let backendServer = null;

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

  backendModule = await import(pathToFileURL(appPath('webui', 'backend', 'index.js')).href);
  const started = await backendModule.startServer({ port: 0 });
  process.env.ALLOWED_ORIGINS = `http://127.0.0.1:${started.port}`;
  backendServer = started.server;
  return started.port;
}

function createWindow(port) {
  const icon = runtimeIconPath();
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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (process.platform !== 'darwin') mainWindow.setMenu(null);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

async function boot() {
  try {
    configureApplicationMenu();
    const port = await startBackend();
    createWindow(port);
  } catch (error) {
    dialog.showErrorBox('Monos failed to start', error?.stack || error?.message || String(error));
    app.quit();
  }
}

app.whenReady().then(boot);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && backendServer?.address?.()) {
    createWindow(backendServer.address().port);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendModule?.stopServer) {
    void backendModule.stopServer();
  }
});
