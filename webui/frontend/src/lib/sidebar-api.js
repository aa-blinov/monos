async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export const loadTreeData = () => fetchJson('/api/tree');
export const loadRecentNotesRequest = () => fetchJson('/api/notes/recent?limit=5');
export const loadTagsRequest = () => fetchJson('/api/tags');
export const loadDirectoriesRequest = () => fetchJson('/api/directories');

export const createFolderRequest = (fullPath) => fetchJson(`/api/directory/create?path=${encodeURIComponent(fullPath)}`, {
  method: 'POST',
});

export const createNoteRequest = (payload) => fetchJson('/api/notes/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

export const renameItemRequest = (itemPath, newName) => fetchJson(`/api/file/rename?path=${encodeURIComponent(itemPath)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ new_name: newName }),
});

export const deleteItemRequest = (itemPath) => fetchJson(`/api/file?path=${encodeURIComponent(itemPath)}`, {
  method: 'DELETE',
});

export const moveItemRequest = (sourcePath, targetPath) => fetchJson(
  `/api/file/move?source=${encodeURIComponent(sourcePath)}&target=${encodeURIComponent(targetPath)}`,
  { method: 'POST' }
);

export const syncRequest = () => fetchJson('/api/git/sync', { method: 'POST' });

export const checkGitStatus = () => fetchJson('/api/git/status');

export const setItemIconRequest = (itemPath, body) => fetchJson(`/api/directory/icon?path=${encodeURIComponent(itemPath)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
