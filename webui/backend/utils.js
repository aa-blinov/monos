import path from 'path';
import { NOTES_DIR, ROOT_DIR } from './config.js';

export function relPath(absolutePath) {
  return path.relative(ROOT_DIR, absolutePath).replace(/\\/g, '/');
}

export function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveNotesPath(requestPath, { allowRoot = false } = {}) {
  if (typeof requestPath !== 'string' || requestPath.trim() === '') {
    throw httpError(400, 'Path required');
  }

  if (path.isAbsolute(requestPath)) {
    throw httpError(403, 'Path must be inside notes');
  }

  const fullPath = path.resolve(ROOT_DIR, requestPath);
  const notesRoot = path.resolve(NOTES_DIR);

  if (!isPathInside(notesRoot, fullPath) || (!allowRoot && fullPath === notesRoot)) {
    throw httpError(403, 'Path must be inside notes');
  }

  return fullPath;
}

export function resolveNotesChildPath(requestPath = '', { allowRoot = true } = {}) {
  if (typeof requestPath !== 'string') {
    throw httpError(400, 'Path required');
  }

  if (path.isAbsolute(requestPath)) {
    throw httpError(403, 'Path must be inside notes');
  }

  const fullPath = path.resolve(NOTES_DIR, requestPath);
  const notesRoot = path.resolve(NOTES_DIR);

  if (!isPathInside(notesRoot, fullPath) || (!allowRoot && fullPath === notesRoot)) {
    throw httpError(403, 'Path must be inside notes');
  }

  return fullPath;
}

export function safePathName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw httpError(400, 'Name required');
  }

  if (name !== path.basename(name)) {
    throw httpError(400, 'Name must not include path separators');
  }

  return name;
}

export function nowISO() {
  return new Date().toISOString();
}

export function extractWikiLinks(content) {
  const re = /\[\[(.*?)\]\]/g;
  const links = [];
  let match;

  while ((match = re.exec(content)) !== null) {
    links.push(match[1].split('|')[0].trim());
  }

  return links;
}

export function humanSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, index)).toFixed(1) + ' ' + units[index];
}
