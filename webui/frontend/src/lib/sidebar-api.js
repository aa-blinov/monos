import { get, post, del } from './api/client.js';

export const loadTreeData = () => get('/api/tree');
export const loadRecentNotesRequest = () => get('/api/notes/recent', { limit: 5 });
export const loadTagsRequest = () => get('/api/tags');
export const loadDirectoriesRequest = () => get('/api/directories');
export const checkGitStatus = () => get('/api/git/status');

export const createFolderRequest = (fullPath) => post('/api/directory/create', null, { query: { path: fullPath } });
export const createNoteRequest = (payload) => post('/api/notes/create', payload);
export const syncRequest = () => post('/api/git/sync');

export const renameItemRequest = (itemPath, newName) =>
  post('/api/file/rename', { new_name: newName }, { query: { path: itemPath } });

export const deleteItemRequest = (itemPath) => del('/api/file', { query: { path: itemPath } });

export const moveItemRequest = (sourcePath, targetPath) =>
  post('/api/file/move', null, { query: { source: sourcePath, target: targetPath } });

export const setItemIconRequest = (itemPath, body) =>
  post('/api/directory/icon', body, { query: { path: itemPath } });
