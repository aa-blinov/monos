import { derived, writable } from 'svelte/store';

/**
 * What the agent changed and the person has not reviewed yet (backend: agent-review.js). Each change is
 * `{ path: 'notes/…', status: 'added' | 'modified' | 'deleted' }`; the board and the tree mark those notes.
 */
export const agentReview = writable({ changes: [] });
/** The review window, opened from the terminal's header. */
export const agentReviewOpen = writable(false);

export const agentTouched = derived(agentReview, ($review) => new Set(($review.changes || []).map((change) => change.path)));

async function call(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || `HTTP ${response.status}`);
  return body;
}

const post = (url, body) => call(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

export async function refreshAgentReview() {
  try {
    agentReview.set(await call('/api/agent/review'));
  } catch {
    agentReview.set({ changes: [] });
  }
}

/** The baseline the review compares with: taken when the terminal starts, kept until the review is done. */
export async function ensureAgentCheckpoint() {
  try { await post('/api/agent/checkpoint'); } catch { /* no git here: no review, the terminal still works */ }
}

export async function agentDiff(path) {
  return (await call(`/api/agent/review/diff?path=${encodeURIComponent(path)}`)).diff || '';
}

export async function keepAgentChanges(paths) {
  agentReview.set(await post('/api/agent/review/keep', { paths }));
}

export async function revertAgentChanges(paths) {
  agentReview.set(await post('/api/agent/review/revert', { paths }));
}
