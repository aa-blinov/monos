async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export const loadFileContent = (filePath) => fetchJson(`/api/file?path=${encodeURIComponent(filePath)}`);
export const loadFileInfo = (filePath) => fetchJson(`/api/file-info?path=${encodeURIComponent(filePath)}`);
export const loadBacklinksRequest = (filePath) => fetchJson(`/api/notes/backlinks?path=${encodeURIComponent(filePath)}`);
export const resolveWikiLink = (name) => fetchJson(`/api/notes/resolve-link?name=${encodeURIComponent(name)}`);
export const touchNoteRequest = (filePath) => fetchJson(`/api/notes/touch?path=${encodeURIComponent(filePath)}`, {
  method: 'POST',
});
export const reorderBoardNotesRequest = (paths) => fetchJson('/api/notes/reorder', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ paths }),
});
export const setItemColorRequest = (itemPath, color) => fetchJson(`/api/directory/icon?path=${encodeURIComponent(itemPath)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ color }),
});
export const saveFileContent = (filePath, content) => fetchJson(`/api/file?path=${encodeURIComponent(filePath)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content }),
});
export const saveFileMetadata = (filePath, payload) => fetchJson(`/api/file/metadata?path=${encodeURIComponent(filePath)}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
export const deleteFileRequest = (filePath) => fetchJson(`/api/file?path=${encodeURIComponent(filePath)}`, {
  method: 'DELETE',
});
export const formatAllNotes = () => fetchJson('/api/format', { method: 'POST' });
export const uploadAttachment = (notePath, file, name = file?.name) => {
  const form = new FormData();
  if (name) form.append('name', name);
  form.append('file', file, name || file.name);
  return fetchJson(`/api/attachments?notePath=${encodeURIComponent(notePath)}`, {
    method: 'POST',
    body: form,
  });
};
export const renameAttachment = (notePath, attachmentPath, newName) => fetchJson('/api/attachments/rename', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ notePath, path: attachmentPath, newName }),
});
export const saveSettingsRequest = (payload) => fetchJson('/api/settings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

export function getWordCharStats(content) {
  const text = content || '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return `${words} words · ${text.length} chars`;
}
