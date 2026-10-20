// The page's only way to a shell: four calls and two listeners, nothing of Node or Electron besides.
// Sandboxed preload: just contextBridge and ipcRenderer.
const { contextBridge, ipcRenderer } = require('electron');

function listen(channel, callback) {
  const handler = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('monosTerminal', {
  create: (options) => ipcRenderer.invoke('terminal:create', options),
  write: (id, data) => ipcRenderer.send('terminal:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('terminal:resize', id, cols, rows),
  kill: (id) => ipcRenderer.send('terminal:kill', id),
  process: (id) => ipcRenderer.invoke('terminal:process', id),
  onData: (callback) => listen('terminal:data', callback),
  onExit: (callback) => listen('terminal:exit', callback),
});

// The native menu bar: the shell asks the page to do the work, and tells it which language
// the menu should speak.
contextBridge.exposeInMainWorld('monosMenu', {
  onCommand: (callback) => listen('menu:command', callback),
  setLocale: (locale) => ipcRenderer.send('menu:locale', locale),
  setState: (state) => ipcRenderer.send('menu:state', state),
});
