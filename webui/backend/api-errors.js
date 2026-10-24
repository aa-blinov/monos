import os from 'os';
import path from 'path';
import { NOTES_DIR, ROOT_DIR } from './config.js';

// Every error the API answers is `{ detail, code }`: `detail` is a sentence for a person, `code` a stable word a
// client can switch on. No path of this computer and no stack trace leaves the server in either.

const DEFAULT_CODES = new Map([
  [400, 'bad_request'],
  [401, 'unauthorized'],
  [403, 'forbidden'],
  [404, 'not_found'],
  [405, 'method_not_allowed'],
  [409, 'conflict'],
  [410, 'gone'],
  [413, 'too_large'],
  [415, 'unsupported_media'],
  [423, 'locked'],
  [429, 'too_many_requests'],
  [500, 'internal'],
  [501, 'not_implemented'],
  [502, 'bad_gateway'],
  [503, 'unavailable'],
]);

export function defaultCodeFor(status) {
  return DEFAULT_CODES.get(status) || (status >= 500 ? 'internal' : 'bad_request');
}

// A system error from a route that did not expect it: what it means for the person, without the path in its message.
const SYSTEM_ERRORS = new Map([
  ['ENAMETOOLONG', [400, 'Name is too long', 'name_too_long']],
  ['EEXIST', [409, 'Target already exists', 'exists']],
  ['ENOTDIR', [409, 'A file is in the way of this folder', 'not_a_folder']],
  ['EISDIR', [400, 'Path is a directory', 'is_directory']],
  ['ENOENT', [404, 'Not found', 'not_found']],
  ['EACCES', [403, 'The file system refused this change', 'permission_denied']],
  ['EPERM', [403, 'The file system refused this change', 'permission_denied']],
  ['EROFS', [403, 'The file system is read-only', 'permission_denied']],
  ['ENOSPC', [507, 'There is no space left on the disk', 'disk_full']],
  ['EMFILE', [503, 'Too many files are open, try again', 'unavailable']],
]);

const roots = () => [NOTES_DIR, ROOT_DIR, os.tmpdir(), os.homedir()]
  .filter(Boolean)
  .flatMap((root) => [path.resolve(root), root])
  .filter((root, index, all) => root.length > 1 && all.indexOf(root) === index)
  .sort((a, b) => b.length - a.length);

/** A message with this computer's folders taken out ("/Users/x/notes/a.md" becomes "a.md"). */
export function scrubPaths(message) {
  let text = String(message ?? '');
  for (const root of roots()) {
    text = text.split(`${root}${path.sep}`).join('').split(root).join('');
  }
  return text;
}

/**
 * What to send for a thrown error: `{ status, body }`. An error raised on purpose (`httpError`) keeps its words;
 * anything else is logged here and answered in general terms, so an internal message never reaches the client.
 */
export function errorResponse(error) {
  if (error?.name === 'MulterError') {
    if (error.code === 'LIMIT_FILE_SIZE') return { status: 413, body: { detail: 'The file is too large', code: 'too_large' } };
    return { status: 400, body: { detail: 'The upload could not be read', code: 'bad_upload' } };
  }
  const status = [error?.statusCode, error?.status].find((value) => Number.isInteger(value) && value >= 400 && value <= 599);
  // A body that is not valid JSON, or too long: Express's own errors, worded here (their messages quote the input).
  if (status && (error.type === 'entity.parse.failed' || error.type === 'entity.too.large')) {
    return error.type === 'entity.too.large'
      ? { status, body: { detail: 'Request body is too large', code: 'too_large' } }
      : { status, body: { detail: 'Request body is not valid JSON', code: 'invalid_json' } };
  }
  if (status && error.statusCode) {
    return {
      status,
      body: { detail: scrubPaths(error.message), code: error.apiCode || defaultCodeFor(status) },
    };
  }
  const system = SYSTEM_ERRORS.get(error?.code);
  if (system) return { status: system[0], body: { detail: system[1], code: system[2] } };
  if (status) return { status, body: { detail: 'Bad request', code: defaultCodeFor(status) } };
  console.error('Request failed:', error);
  return { status: 500, body: { detail: 'Internal server error', code: 'internal' } };
}

/** What went wrong while reading an upload: the limits multer names, and for anything else (a form cut short) a plain 400. */
export function uploadError(error) {
  if (error?.name === 'MulterError' || error?.statusCode) return error;
  const broken = new Error('The upload could not be read');
  broken.statusCode = 400;
  broken.apiCode = 'bad_upload';
  return broken;
}

export function sendError(res, error) {
  const { status, body } = errorResponse(error);
  res.status(status).json(body);
}

/**
 * Gives every error body of the API its `code`, and takes this computer's folders out of its `detail`, whichever
 * route wrote it: a route that answers `res.status(409).json({ detail })` by hand gets the default code for 409.
 */
export function apiErrorBodies(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400 && body && typeof body === 'object' && !Array.isArray(body)) {
      const next = { ...body };
      if (typeof next.detail === 'string') next.detail = scrubPaths(next.detail);
      else if (next.detail === undefined) next.detail = 'Request failed';
      if (typeof next.code !== 'string') next.code = defaultCodeFor(res.statusCode);
      return json(next);
    }
    return json(body);
  };
  next();
}
