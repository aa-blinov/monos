/**
 * Print / PDF export.
 *
 * The HTML endpoints work anywhere (they are plain GETs and are useful for a
 * browser Print). Saving a PDF needs the desktop app, because Electron's
 * printToPDF is the renderer; the backend says so explicitly rather than
 * failing obscurely, and that message is surfaced to the user.
 */

async function postPdf({ scope, path = '' }) {
  const response = await fetch('/api/print/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope, path }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
  return data;
}

/**
 * Save one note as PDF.
 * @returns {Promise<{ canceled?: boolean, filePath?: string }>}
 */
export function printNoteToPdf(notePath) {
  return postPdf({ scope: 'note', path: notePath });
}

/**
 * Save a folder — or the whole notes folder when path is empty — as one PDF.
 * @returns {Promise<{ canceled?: boolean, filePath?: string }>}
 */
export function printTreeToPdf(folderPath = '') {
  return postPdf({ scope: 'tree', path: folderPath });
}

/** Open the rendered document in the browser's own print dialog. */
export function openPrintView({ scope = 'note', path = '' } = {}) {
  const query = scope === 'tree'
    ? `/api/print/tree${path ? `?path=${encodeURIComponent(path)}` : ''}`
    : `/api/print/note?path=${encodeURIComponent(path)}`;
  const opened = window.open(query, '_blank', 'noopener');
  return Boolean(opened);
}
