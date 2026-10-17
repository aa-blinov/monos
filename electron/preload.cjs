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
