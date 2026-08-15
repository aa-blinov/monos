import { get, post, put, del } from './api/client.js';

export const loadFileContent = (filePath) => get('/api/file', { path: filePath });
export const loadFileInfo = (filePath) => get('/api/file-info', { path: filePath });
export const loadBacklinksRequest = (filePath) => get('/api/notes/backlinks', { path: filePath });
export const resolveWikiLink = (name) => get('/api/notes/resolve-link', { name });
export const loadTrashNotesRequest = () => get('/api/notes/trash', { limit: 200 });

export const touchNoteRequest = (filePath) => post('/api/notes/touch', null, { query: { path: filePath } });
export const restoreNoteRequest = (filePath) => post('/api/notes/restore', null, { query: { path: filePath } });

export const saveFileContent = (filePath, content) =>
  post('/api/file', { content }, { query: { path: filePath } });

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

export function getWordCharStats(content) {
  const text = content || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const readingMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200));
  if (words === 0) return '0 words';
  return `${words.toLocaleString()} words · ${readingMinutes} min read`;
}
