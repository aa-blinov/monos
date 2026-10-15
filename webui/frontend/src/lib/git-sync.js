// Automatic sync. Every interval this device downloads what the other devices sent. When the person chose it, a
// round also uploads this device's changes: a commit, then pull, then push, the same as the Sync button.
// A round is skipped while a note is unsaved, and a round never starts while another one is still running.

/** The interval when the person has not chosen one. */
export const DEFAULT_SYNC_MINUTES = 15;
const MIN_SYNC_MINUTES = 1;
const MAX_SYNC_MINUTES = 1440;

let inFlight = false;
let timer = null;
let scheduledMs = null;
let onRoundResult = null;

// The person's choices from Settings. `upload` decides whether a round also sends this device's changes.
let policy = { minutes: DEFAULT_SYNC_MINUTES, upload: true };

/**
 * A round never runs while a note is unsaved.
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
 * Whole minutes from 1 to 1440. An empty or unreadable value gets the default, so a half-typed field
 * never switches the automatic sync off by accident.
 */
export function normalizeSyncMinutes(value) {
  if (value === null || value === undefined || String(value).trim() === '') return DEFAULT_SYNC_MINUTES;
  const minutes = Math.round(Number(value));
  if (!Number.isFinite(minutes)) return DEFAULT_SYNC_MINUTES;
  return Math.min(MAX_SYNC_MINUTES, Math.max(MIN_SYNC_MINUTES, minutes));
}

/**
 * One round: download, and upload as well when the person chose it.
 *
 * @returns {Promise<object|null>} the result, or null when the round was skipped
 */
export async function runSyncRound() {
  if (inFlight || noteIsBusy()) return null;

  inFlight = true;
  try {
    // `auto=1`: while Git is not connected the server answers "skipped" instead of 400.
    const response = await fetch(`${policy.upload ? '/api/git/sync' : '/api/git/pull'}?auto=1`, { method: 'POST' });
    // 400 means "no git repo configured" — an ordinary state, not a failure.
    if (response.status === 400) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, detail: data.detail };
    if (data.skipped) return null;
    // The pull route counts the commits that arrived as `received`, the sync route as `pulled`.
    const result = { ok: true, ...data, received: data.received ?? data.pulled ?? 0 };
    onRoundResult?.(result);
    return result;
  } catch {
    // Offline is an ordinary state, not a failure worth surfacing.
    return null;
  } finally {
    inFlight = false;
  }
}

function currentIntervalMs() {
  return scheduledMs ?? policy.minutes * 60_000;
}

function schedule() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => { void runSyncRound(); }, currentIntervalMs());
}

/**
 * Start the automatic sync: one round now, then one every interval. The interval is the minutes the person
 * chose; `intervalMs` exists for tests.
 */
export function startAutoSync({ onResult, intervalMs } = {}) {
  onRoundResult = onResult ?? null;
  scheduledMs = intervalMs ?? null;
  schedule();
  void runSyncRound();
}

/** The person's choices changed in Settings. A running timer takes the new interval at once. */
export function setAutoSyncPolicy({ minutes, upload } = {}) {
  policy = {
    minutes: normalizeSyncMinutes(minutes ?? policy.minutes),
    upload: typeof upload === 'boolean' ? upload : policy.upload,
  };
  if (timer) schedule();
}

export function stopAutoSync() {
  if (timer) clearInterval(timer);
  timer = null;
  onRoundResult = null;
}

export const isSyncInFlight = () => inFlight;
