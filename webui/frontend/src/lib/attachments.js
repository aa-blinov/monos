const IMAGE_MIME_PREFIX = 'image/';
const WEBP_MIME = 'image/webp';
const DEFAULT_MAX_DIMENSION = 2560;
const DEFAULT_WEBP_QUALITY = 0.82;
const DATA_IMAGE_RE = /data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)/i;

export function attachmentTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

export function defaultImageName(date = new Date()) {
  return `image-${attachmentTimestamp(date)}.webp`;
}

// Names a camera, the clipboard or a browser give a picture that say nothing about it.
const GENERIC_IMAGE_NAME = /^(image|blob|clipboard|pasted[\s_-]*image|screenshot|untitled|photo|picture|unnamed|download)([\s_-]*\d+)?$/i;

/**
 * The name a picture keeps in the note's attachments: its own name when it has a meaningful one
 * ("Снимок экрана 2026-10-16" stays), a dated `image-…` when it came from the clipboard or is called
 * "image.png". Always `.webp`, since pictures are converted. The server makes a taken name unique.
 */
export function imageNameFor(file, date = new Date()) {
  const original = String(file?.name || '').replace(/\.[a-z0-9]{2,5}$/i, '');
  const base = original
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[.\s]+$/, '');
  if (!base || GENERIC_IMAGE_NAME.test(base)) return defaultImageName(date);
  return `${base}.webp`;
}

const PDF_MIME = 'application/pdf';

export function isPdfFile(file) {
  return file?.type === PDF_MIME;
}

/** The first PDF in a drop, or null. A PDF is attached as it is, not converted like a picture. */
export function firstPdfFileFromDataTransfer(dataTransfer) {
  return [...(dataTransfer?.files || [])].find(isPdfFile) || null;
}

export function isImageFile(file) {
  return Boolean(file?.type?.startsWith(IMAGE_MIME_PREFIX));
}

export function firstImageFileFromFileList(files) {
  return [...(files || [])].find(isImageFile) || null;
}

export function firstImageFileFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return null;
  const file = firstImageFileFromFileList(dataTransfer.files);
  if (file) return file;

  for (const item of [...(dataTransfer.items || [])]) {
    if (item.kind === 'file' && item.type?.startsWith(IMAGE_MIME_PREFIX)) {
      return item.getAsFile();
    }
  }

  return firstImageFileFromText(dataTransfer.getData?.('text/html'))
    || firstImageFileFromText(dataTransfer.getData?.('text/plain'));
}

export async function firstImageFileFromClipboard() {
  if (!navigator?.clipboard?.read) return null;
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types?.find((candidate) => candidate.startsWith(IMAGE_MIME_PREFIX));
    if (type) {
      const blob = await item.getType(type);
      return new File([blob], defaultImageName(), { type });
    }

    for (const textType of ['text/html', 'text/plain']) {
      if (!item.types?.includes(textType)) continue;
      const textBlob = await item.getType(textType);
      const image = await firstImageFileFromText(await textBlob.text());
      if (image) return image;
    }
  }
  return null;
}

export function firstImageFileFromText(text) {
  const match = String(text || '').match(DATA_IMAGE_RE);
  if (!match) return null;

  const [, mime, payload] = match;
  try {
    const binary = atob(payload.replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], defaultImageName(), { type: mime });
  } catch {
    return null;
  }
}

function scaledDimensions(width, height, maxDimension) {
  const max = Math.max(width, height);
  if (!max || max <= maxDimension) return { width, height };
  const scale = maxDimension / max;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

async function fileToBitmap(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    if (image.decode) await image.decode();
    else await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function canvasToWebpBlob(canvas, quality) {
  if (canvas.convertToBlob) {
    return canvas.convertToBlob({ type: WEBP_MIME, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Image conversion failed'));
    }, WEBP_MIME, quality);
  });
}

export async function convertImageToWebp(file, {
  name = defaultImageName(),
  maxDimension = DEFAULT_MAX_DIMENSION,
  quality = DEFAULT_WEBP_QUALITY,
} = {}) {
  if (!isImageFile(file)) throw new Error('File is not an image');
  if (file.type === WEBP_MIME && file.name === name) return file;

  try {
    const bitmap = await fileToBitmap(file);
    const { width, height } = scaledDimensions(bitmap.width, bitmap.height, maxDimension);
    const canvas = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await canvasToWebpBlob(canvas, quality);
    return new File([blob], name.endsWith('.webp') ? name : `${name}.webp`, {
      type: WEBP_MIME,
      lastModified: Date.now(),
    });
  } catch {
    const fallbackName = name.endsWith('.webp') ? name.replace(/\.webp$/i, extensionForMime(file.type)) : name;
    return new File([file], fallbackName, {
      type: file.type,
      lastModified: Date.now(),
    });
  }
}

function extensionForMime(mime) {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/gif') return '.gif';
  if (mime === WEBP_MIME) return '.webp';
  return '.img';
}

export function markdownImage(name, relativePath) {
  const alt = imageDisplayName(name);
  return `![${alt}](${encodeURI(relativePath)})`;
}

export function imageDisplayName(nameOrPath) {
  const fileName = decodeURIComponent(String(nameOrPath || 'image').split('/').pop() || 'image');
  return fileName.replace(/\.[^.]+$/, '') || 'image';
}

export function rawAttachmentUrl(path) {
  return `/api/attachments/raw?path=${encodeURIComponent(path)}`;
}

function isExternalImageSrc(src) {
  return /^(https?:|data:|blob:|\/\/|#|\/)/i.test(String(src || '').trim());
}

export function resolveMarkdownImagePath(notePath, src) {
  const cleanSrc = String(src || '').trim();
  if (!cleanSrc || isExternalImageSrc(cleanSrc)) return cleanSrc;

  const decodedSrc = decodeURI(cleanSrc);
  if (decodedSrc.startsWith('notes/')) return decodedSrc.replace(/\\/g, '/');

  const noteDir = String(notePath || '').split('/').slice(0, -1).join('/') || 'notes';
  const parts = `${noteDir}/${decodedSrc}`.split('/');
  const resolved = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  const nextPath = resolved.join('/');
  return nextPath.startsWith('notes/') ? nextPath : cleanSrc;
}

export function displayImageSrc(notePath, src) {
  if (/^(data:|javascript:|#)/i.test(String(src || '').trim())) return '';
  const resolved = resolveMarkdownImagePath(notePath, src);
  if (!resolved || isExternalImageSrc(resolved)) return resolved;
  return rawAttachmentUrl(resolved);
}

/**
 * A path as a Markdown link can hold it: spaces and parentheses are escaped, everything else (Cyrillic
 * included) stays readable. `Снимок экрана.webp` → `Снимок%20экрана.webp`, as Obsidian writes it.
 */
export function markdownLinkPath(path) {
  return String(path || '').replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

export function relativeAttachmentPathFromUpload(uploadResult) {
  return uploadResult?.relativePath || '';
}

export function replaceMarkdownImagePath(content, oldRelativePath, nextRelativePath) {
  const oldValues = new Set([oldRelativePath, encodeURI(oldRelativePath)]);
  const nextUrl = encodeURI(nextRelativePath);
  const nextAlt = imageDisplayName(nextRelativePath);
  return String(content || '').replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (fullMatch, _alt, url) => (
    oldValues.has(url) ? `![${nextAlt}](${nextUrl})` : fullMatch
  ));
}

/** Bytes as a short human string, in the interface's language (КБ, МБ for Russian). */
export function formatAttachmentSize(bytes, locale = 'en') {
  const value = Number(bytes);
  const ru = locale === 'ru';
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1024) return `${Math.round(value)} ${ru ? 'Б' : 'B'}`;
  const units = ru ? ['КБ', 'МБ', 'ГБ'] : ['KB', 'MB', 'GB'];
  let scaled = value / 1024;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  return `${scaled >= 10 ? Math.round(scaled) : Math.round(scaled * 10) / 10} ${units[unit]}`;
}

/** Files under `_attachments` that no note points at. */
export async function fetchOrphanAttachments() {
  const response = await fetch('/api/attachments/orphans');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** Every picture and PDF in the notes with the notes that use it: `{ items, lockedNotes }`. */
export async function fetchAllAttachments() {
  const response = await fetch('/api/attachments/all');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export const ATTACHMENT_SORTS = ['new', 'size', 'name', 'notes'];

// "IMG_4021", "img-4021" and "IMG 4021" are one name to a person looking for a file.
const looseText = (value) => String(value || '').toLowerCase().replace(/[\s_.\-]+/g, ' ').trim();

/** Names that more than one file carries (any case), so look-alike files in different folders can be told apart. */
export function duplicateNames(items) {
  const counts = new Map();
  for (const item of items || []) counts.set(item.name.toLowerCase(), (counts.get(item.name.toLowerCase()) || 0) + 1);
  return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
}

/**
 * Narrow the list by file name, folder or note title (`query`, separators ignored), use (`filter`: all, unused or
 * duplicates), type (`kind`) and folder.
 */
export function filterAttachments(items, { query = '', filter = 'all', lockedNotes = 0, kind = 'all', folder = '' } = {}) {
  const needle = looseText(query);
  const duplicates = filter === 'duplicates' ? duplicateNames(items) : null;
  return (items || []).filter((item) => {
    if (filter === 'unused' && (lockedNotes > 0 || item.usedBy.length > 0)) return false;
    if (duplicates && !duplicates.has(item.name.toLowerCase())) return false;
    if (kind !== 'all' && item.kind !== kind) return false;
    if (folder && item.folder !== folder && !String(item.folder || '').startsWith(`${folder}/`)) return false;
    if (!needle) return true;
    return looseText(item.name).includes(needle)
      || looseText(item.folder).includes(needle)
      || item.usedBy.some((note) => looseText(note.title).includes(needle));
  });
}

/** A sorted copy: newest first (`new`), biggest first (`size`), by name (`name`), most notes first (`notes`). Ties go by name, then folder. */
export function sortAttachments(items, sort = 'new') {
  const list = [...(items || [])];
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    || String(a.folder || '').localeCompare(String(b.folder || ''));
  if (sort === 'size') return list.sort((a, b) => b.size - a.size || byName(a, b));
  if (sort === 'name') return list.sort(byName);
  if (sort === 'notes') return list.sort((a, b) => b.usedBy.length - a.usedBy.length || byName(a, b));
  return list.sort((a, b) => String(b.modified).localeCompare(String(a.modified)) || byName(a, b));
}

/** The end of a folder path, which is the part that tells two folders apart: `…/Swift/Chapter 3`. */
export function folderTail(folder, segments = 2) {
  const parts = String(folder || '').split('/').filter(Boolean);
  if (parts.length === 0) return '/';
  return parts.length <= segments ? parts.join(' / ') : `… / ${parts.slice(-segments).join(' / ')}`;
}

/**
 * The folders that hold attachments as a tree, in reading order, each with how many files lie in it and below it:
 * `[{ folder: 'A/B', label: 'B', depth: 1, count }]`. A folder without files of its own still appears when something
 * below it holds some, so the nesting reads as it is on disk.
 */
export function attachmentFolders(items) {
  const counts = new Map();
  for (const item of items || []) {
    const parts = String(item.folder || '').split('/').filter(Boolean);
    for (let depth = 1; depth <= parts.length; depth += 1) {
      const folder = parts.slice(0, depth).join('/');
      counts.set(folder, (counts.get(folder) || 0) + 1);
    }
  }
  const compare = (a, b) => {
    const left = a.split('/');
    const right = b.split('/');
    for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
      const order = left[i].localeCompare(right[i], undefined, { numeric: true, sensitivity: 'base' });
      if (order) return order;
    }
    return left.length - right.length;
  };
  return [...counts.keys()].sort(compare).map((folder) => {
    const parts = folder.split('/');
    return { folder, label: parts[parts.length - 1], depth: parts.length - 1, count: counts.get(folder) };
  });
}

/** What to paste into a note to show the file: a picture as an image, a PDF as an embed by name. */
export function attachmentEmbed(item) {
  return item.kind === 'pdf' ? `![[${item.name}]]` : `![](_attachments/${encodeURI(item.name)})`;
}

/** Moves unused files to the local trash; answers `{ batch, deleted, bytes, skipped }`. */
export async function deleteAttachmentsRequest(paths) {
  const response = await fetch('/api/attachments/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
  return data;
}

/** Brings a batch back from the local trash, or only some of its files (`paths`, as listed by the trash). */
export async function restoreAttachmentsRequest(batch, paths) {
  const response = await fetch('/api/attachments/restore', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(paths ? { batch, paths } : { batch }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
  return data;
}

/** What the local trash holds: `{ batches: [{ batch, at, files: [{ path, name, size }] }], days }`. */
export async function fetchAttachmentTrash() {
  const response = await fetch('/api/attachments/trash');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
