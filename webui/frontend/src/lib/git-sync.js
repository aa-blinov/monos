let inFlight = false;
let timer = null;

/**
 * Pull is never allowed to fight an unsaved note.
 *
 * The caller supplies this because this module deliberately knows nothing about
 * the stores — keeping it free of `stores.js` is what lets it be tested under
 * plain `node:test`, where `localStorage` does not exist.
 */
let noteIsBusy = () => false;

/** Replace the unsaved-note check. Used by the app and by tests. */
export function setBusyCheck(fn) {
  noteIsBusy = typeof fn === 'function' ? fn : () => false;
}

/**
 * Pull once.
 *
 * @param {{ onResult?: (result: object) => void }} options
 * @returns {Promise<object|null>} the result, or null when skipped
 */
export async function autoPull({ onResult } = {}) {
  if (inFlight || noteIsBusy()) return null;

  inFlight = true;
  try {
    const response = await fetch('/api/git/pull', { method: 'POST' });
    // 400 means "no git repo configured" — an ordinary state, not a failure.
    if (response.status === 400) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, detail: data.detail };
    onResult?.(data);
    return { ok: true, ...data };
  } catch {
    // Offline is an ordinary state, not a failure worth surfacing.
    return null;
  } finally {
    inFlight = false;
  }
}

/**
 * Pull now and then on an interval.
 *
 * @param {{ intervalMs?: number, onResult?: (result: object) => void }} options
 * @returns {() => void} stops the timer
 */
export function startAutoPull({ intervalMs = 5 * 60_000, onResult } = {}) {
  stopAutoPull();
  void autoPull({ onResult });
  timer = setInterval(() => { void autoPull({ onResult }); }, intervalMs);
  return stopAutoPull;
}

export function stopAutoPull() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export const isPullInFlight = () => inFlight;
