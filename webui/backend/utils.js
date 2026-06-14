import fs from 'fs';
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

export function decodeTextBuffer(buffer) {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      const swapped = Buffer.alloc(buffer.length - 2);
      for (let index = 2; index + 1 < buffer.length; index += 2) {
        swapped[index - 2] = buffer[index + 1];
        swapped[index - 1] = buffer[index];
      }
      return swapped.toString('utf16le');
    }
  }

  const sampleLength = Math.min(buffer.length, 4096);
  let evenNulls = 0;
  let oddNulls = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] !== 0) continue;
    if (index % 2 === 0) evenNulls += 1;
    else oddNulls += 1;
  }

  if (oddNulls > sampleLength / 8 && evenNulls < oddNulls / 4) return buffer.toString('utf16le');

  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf-8');
  }
  return buffer.toString('utf-8').replace(/\u0000/g, '');
}

export function readTextFile(filePath) {
  return decodeTextBuffer(fs.readFileSync(filePath));
}

export function textFileBuffer(content) {
  return Buffer.from(String(content || ''), 'utf-8');
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
