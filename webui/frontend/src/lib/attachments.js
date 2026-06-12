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
