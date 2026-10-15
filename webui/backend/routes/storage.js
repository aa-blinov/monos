import { NOTES_DIR } from '../config.js';
import { chooseNotesFolder, forgetNotesFolder, notesFolderState } from '../notes-folder.js';
import { httpError } from '../utils.js';
import { requireThisComputer, sendError } from './helpers.js';

// Where the notes live. Only this computer changes it; a device that got in through the access link
// reads the state through /api/storage but cannot choose.
export function registerStorageRoutes(app) {
  app.get('/api/storage', requireThisComputer, (req, res) => {
    res.json(notesFolderState());
  });

  // Without a path the folder is picked in the app's own window. A path can be sent as well.
  app.post('/api/storage/folder', requireThisComputer, async (req, res) => {
    try {
      const folder = typeof req.body?.folder === 'string' ? req.body.folder : await pickFolderInApp();
      if (folder === null) {
        res.json({ ...notesFolderState(), canceled: true });
        return;
      }
      res.json({ ...chooseNotesFolder(folder), canceled: false });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete('/api/storage/folder', requireThisComputer, (req, res) => {
    res.json(forgetNotesFolder());
  });
}

// The window's folder dialog exists only where the backend runs inside Electron's main process.
async function pickFolderInApp() {
  const electron = await import('electron').catch(() => null);
  if (!electron?.dialog || !process.versions?.electron) {
    throw httpError(409, 'The folder can be chosen in the Monos app');
  }
  const { canceled, filePaths } = await electron.dialog.showOpenDialog({
    title: 'Notes folder',
    defaultPath: NOTES_DIR,
    properties: ['openDirectory', 'createDirectory'],
  });
  return canceled || !filePaths?.[0] ? null : filePaths[0];
}
