import { get as readStore } from 'svelte/store';
import { replaceTabs, tabsToSpaces } from './tabs.js';
import { get, post, put, del } from './api/client.js';

export const loadFileContent = (filePath) => get('/api/file', { path: filePath });
export const loadFileInfo = (filePath) => get('/api/file-info', { path: filePath });

export const loadCategoriesRequest = () => get('/api/categories');
export const loadBacklinksRequest = (filePath) => get('/api/notes/backlinks', { path: filePath });
export const loadUnlinkedMentionsRequest = (filePath) => get('/api/notes/unlinked-mentions', { path: filePath });
export const loadNeighborsRequest = (filePath) => get('/api/notes/neighbors', { path: filePath });
// Turns the first plain mention of `targetPath` inside `sourcePath` into a link to it.
export const linkMentionRequest = (sourcePath, targetPath) =>
  post('/api/notes/link-mention', { target: targetPath }, { query: { path: sourcePath } });
export const loadBrokenLinksRequest = () => get('/api/notes/broken-links');
// Locking (opt-in): a note is sealed with a passphrase and opened for the session with the same one.
export const lockNoteRequest = (filePath, passphrase) => post('/api/file/lock', { passphrase }, { query: { path: filePath } });
export const unlockNoteRequest = (filePath, passphrase) => post('/api/file/unlock', { passphrase }, { query: { path: filePath } });
export const relockNoteRequest = (filePath) => post('/api/file/relock', null, { query: { path: filePath } });
export const unprotectNoteRequest = (filePath, passphrase) => post('/api/file/unprotect', { passphrase }, { query: { path: filePath } });
// Writes the notes as a static site into `<target>/monos-site`. Nothing leaves the computer.
export const publishSiteRequest = (target, folder = '') => post('/api/publish', { target, folder });
export const loadLanAccessRequest = () => get('/api/lan');
export const setLanAccessRequest = (enabled) => put('/api/lan', { enabled });
export const regenerateLanTokenRequest = () => post('/api/lan/token', null);
export const loadStorageRequest = () => get('/api/storage');
export const chooseNotesFolderRequest = () => post('/api/storage/folder', {});
export const forgetNotesFolderRequest = () => del('/api/storage/folder');
export const loadMaintenanceRequest = () => get('/api/notes/maintenance');
// Sets one custom property of the note, or removes it with { key, remove: true }. Answers with the new list.
export const setPropertyRequest = (filePath, body) => put('/api/file/property', body, { query: { path: filePath } });
// The notes as property rows, filtered by the search syntax (`prop:status=done`) and sorted by a column.
export const loadPropertyTableRequest = ({ query = '', sort = 'modified', dir = 'desc' } = {}) =>
  get('/api/notes/table', { query, sort, dir });
export const resolveWikiLink = (name) => get('/api/notes/resolve-link', { name });
export const loadTrashNotesRequest = () => get('/api/notes/trash', { limit: 200 });

export const touchNoteRequest = (filePath) => post('/api/notes/touch', null, { query: { path: filePath } });
export const restoreNoteRequest = (filePath) => post('/api/notes/restore', null, { query: { path: filePath } });

/**
 * `baseVersion` is the version of the text the edit started from (from loading or the last save). The server
 * refuses the save with 409 and the text on disk when the file has changed since, so a sync's edit is never
 * written over. Without it the save is not checked.
 */
export const saveFileContent = (filePath, rawContent, baseVersion = '') => {
  // "Tabs to spaces" (Settings → Editor): the file is written with spaces, outside fenced code.
  const content = replaceTabs(rawContent, readStore(tabsToSpaces));
  return post('/api/file', baseVersion ? { content, base_version: baseVersion } : { content }, { query: { path: filePath } });
};

// A keepalive request outlives the page that sent it, but the browser caps its body at 64 KiB.
export const LEAVING_SAVE_LIMIT = 60 * 1024;

/**
 * Hand the text to the browser for the moment the page goes away, when nothing that waits for an answer is of any
 * use. Answers whether it was sent: a text too long for a keepalive request is left to the "leave this page?"
 * question that the browser asks while the note is unsaved.
 */
export function saveFileContentOnLeave(filePath, rawContent, baseVersion = '') {
  const content = replaceTabs(rawContent, readStore(tabsToSpaces));
  const body = JSON.stringify(baseVersion ? { content, base_version: baseVersion } : { content });
  if (body.length > LEAVING_SAVE_LIMIT || typeof fetch !== 'function') return false;
  try {
    fetch(`/api/file?path=${encodeURIComponent(filePath)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export const saveFileMetadata = (filePath, payload) =>
  put('/api/file/metadata', payload, { query: { path: filePath } });

export const setItemColorRequest = (itemPath, color) =>
  post('/api/directory/icon', { color }, { query: { path: itemPath } });

export const deleteFileRequest = (filePath) => del('/api/file', { query: { path: filePath } });
export const deleteFilePermanentlyRequest = (filePath) =>
  del('/api/file', { query: { path: filePath, permanent: 1 } });

export const uploadAttachment = (notePath, file, name = file?.name) => {
  const form = new FormData();
  if (name) form.append('name', name);
  form.append('file', file, name || file.name);
  return post('/api/attachments', form, { query: { notePath } });
};

export const renameAttachment = (notePath, attachmentPath, newName) =>
  post('/api/attachments/rename', { notePath, path: attachmentPath, newName });

export const saveSettingsRequest = (payload) => post('/api/settings', payload);

/**
 * Копия заметки рядом с оригиналом. `suffix` — слово в имени копии на языке интерфейса («copy» / «копия»):
 * без него сервер берёт нейтральное английское.
 */
export const duplicateNoteRequest = (filePath, suffix = '') =>
  post('/api/notes/duplicate', suffix ? { suffix } : null, { query: { path: filePath } });

/**
 * Массовое действие над тегами: добавить или снять тег у списка заметок.
 * Бэкенд переписывает только ключ `tags`, остальные строки шапки остаются.
 */
export const bulkTagRequest = (paths, tag, remove = false) =>
  post('/api/notes/bulk-tag', { paths, tag, remove });
