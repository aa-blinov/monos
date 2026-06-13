import { httpError } from '../utils.js';

export function requireQueryPath(req) {
  const { path: filePath } = req.query;
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw httpError(400, 'Path query parameter required');
  }
  return filePath;
}

export function requireBodyFields(req, ...fields) {
  const missing = fields.filter((field) => {
    const value = req.body?.[field];
    return value === undefined || value === null;
  });

  if (missing.length > 0) {
    throw httpError(400, `Missing required fields: ${missing.join(', ')}`);
  }
}

export function requireStringField(req, field) {
  const value = req.body?.[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw httpError(400, `${field} must be a non-empty string`);
  }
  return value;
}

export function validatePathSegments(filePath) {
  if (typeof filePath !== 'string') return false;
  const segments = filePath.split('/').filter(Boolean);
  return segments.every(segment => !segment.startsWith('.') && segment !== '..');
}
