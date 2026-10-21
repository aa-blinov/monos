/**
 * Web clipper bridge.
 *
 * The token is read from the app itself, never stored here: the backend only
 * serves it to the app origin, so a copied token is the single credential the
 * extension needs and it can be rotated by deleting `.data/clipper-token`.
 */

/** Fetch the clipper token. Only the app origin is allowed to read it. */
export async function fetchClipperToken() {
  const response = await fetch('/api/clip/token');
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
  return data.token;
}

/** Local address the extension should post to. Shown in Settings. */
export function clipperEndpointHint() {
  return `${window.location.origin}`;
}
