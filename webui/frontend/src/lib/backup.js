/**
 * ZIP export/import for the notes folder.
 *
 * Lives here rather than in Settings because the empty board needs to offer
 * the same import — a first-run user has nothing to look at and must be able to
 * bring their notes across without first finding the settings screen.
 */

function archiveNameFromResponse(response) {
  const disposition = response.headers?.get?.('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] || `monos-notes-${new Date().toISOString().slice(0, 10)}.zip`;
}

/**
 * Download every note and attachment as a ZIP.
 * @param {{ onError: (message: string) => void }} handlers
 * @returns {Promise<string|null>} filename written, or null on failure
 */
export async function exportNotesArchive({ onError } = {}) {
  let response;
  try {
    response = await fetch('/api/backup/export');
  } catch (error) {
    onError?.(error?.message || String(error));
    return null;
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    onError?.(detail.detail || String(response.status));
    return null;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = archiveNameFromResponse(response);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return link.download;
}

/**
 * Unpack a ZIP of Markdown notes and attachments into the notes folder.
 * @param {File} file
 * @returns {Promise<{ ok: boolean, data?: object, detail?: string }>}
 */
export async function importNotesArchive(file) {
  if (!file) return { ok: false };
  const body = new FormData();
  body.append('archive', file);
  const response = await fetch('/api/backup/import', { method: 'POST', body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, detail: data.detail };
  return { ok: true, data };
}

/** Open a file picker and run the chosen ZIP through importNotesArchive. */
export function pickAndImport({ onDone, onError } = {}) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip,application/zip,application/x-zip-compressed';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    const result = await importNotesArchive(file);
    if (result.ok) onDone?.(result.data);
    else onError?.(result.detail || 'Import failed');
  });
  input.click();
}