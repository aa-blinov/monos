/**
 * Domain-typed error thrown by every api call on non-2xx responses
 * or network failures. Carries the HTTP status, parsed body (if any),
 * and a human-readable message for logs/UI.
 */
export class ApiError extends Error {
  /**
   * @param {number} status - HTTP status, or 0 for network failure
   * @param {*} body - parsed response body (object) or raw text, may be null
   * @param {string} message - human-readable summary
   */
  constructor(status, body, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function isPlainSerializable(value) {
  return value !== null && typeof value === 'object' && !(value instanceof FormData) && !(value instanceof Blob);
}

function buildQuery(params) {
  if (!params) return '';
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

function appendQuery(path, query) {
  if (!query) return path;
  return path.includes('?') ? `${path}&${query.slice(1)}` : `${path}${query}`;
}

function serializeBody(body) {
  if (body === undefined || body === null) {
    return { body: undefined, headers: {} };
  }
  if (isPlainSerializable(body)) {
    return { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
  }
  return { body, headers: {} };
}

function mergeHeaders(defaultHeaders, extra) {
  return { ...defaultHeaders, ...(extra || {}) };
}

function withBody(method, body, options = {}) {
  const { body: serialized, headers } = serializeBody(body);
  const finalHeaders = mergeHeaders(headers, options.headers);
  const { query, ...rest } = options;
  const init = { ...rest, method };
  if (serialized !== undefined) init.body = serialized;
  if (Object.keys(finalHeaders).length > 0) init.headers = finalHeaders;
  return { init, query };
}

/**
 * Single point that talks to fetch. Defaults to GET, normalises errors
 * into ApiError, and parses JSON for both success and failure bodies.
 *
 * @param {string} path - URL or path (proxy-aware)
 * @param {RequestInit} [init]
 * @returns {Promise<*>} parsed JSON
 */
export async function request(path, init = {}) {
  const finalInit = { method: 'GET', ...init };
  let response;
  try {
    response = await fetch(path, finalInit);
  } catch (err) {
    throw new ApiError(0, null, err?.message || 'Network error');
  }

  if (!response.ok) {
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => null);
    }
    throw new ApiError(response.status, body, `HTTP ${response.status}`);
  }

  return response.json();
}

/** GET with optional query params. */
export function get(path, params, options = {}) {
  return request(appendQuery(path, buildQuery(params)), { ...options, method: 'GET' });
}

/** POST with JSON body (or pass FormData/Blob to skip Content-Type). */
export function post(path, body, options = {}) {
  const { init, query } = withBody('POST', body, options);
  return request(appendQuery(path, buildQuery(query)), init);
}

/** PUT with JSON body. */
export function put(path, body, options = {}) {
  const { init, query } = withBody('PUT', body, options);
  return request(appendQuery(path, buildQuery(query)), init);
}

/** DELETE without body. */
export function del(path, options = {}) {
  const { query, ...rest } = options;
  return request(appendQuery(path, buildQuery(query)), { ...rest, method: 'DELETE' });
}
