import { writable, get } from 'svelte/store';
import { ApiError, get as apiGet } from './api/client.js';
import { persisted } from './stores/persisted.js';

export const BOARD_PAGE_SIZE = 36;

export const homeRecentNotes = writable([]);
export const homeRecentHasMore = writable(true);
export const homeRecentLoading = writable(false);
export const homeRecentError = writable(null);
/** The tag the board is narrowed to ('' for all notes) and how many notes it holds in all. */
export const boardTag = writable('');
// The board's order: 'modified' | 'opened' | 'title'. The tag is not kept: it is a look at one topic, not a setting.
export const boardSort = persisted('boardSort', 'modified');
export const homeRecentTotal = writable(null);
export const homeTags = writable([]);

/** Every tag with its count, busiest first: the strip shows the top few and the list behind "more" all of them. Failing to load them only hides the strip. */
export async function loadHomeTags() {
  try {
    const stats = await apiGet('/api/tags/stats');
    const list = Array.isArray(stats) ? stats : stats?.tags;
    homeTags.set(Array.isArray(list) ? list : []);
  } catch {
    homeTags.set([]);
  }
}

async function loadHomeRecentTotal(tag) {
  try {
    const result = await apiGet('/api/notes/recent/count', { tag: tag || undefined });
    // A tag chosen meanwhile makes this answer stale.
    if (get(boardTag) === tag) homeRecentTotal.set(Number(result?.total) || 0);
  } catch {
    homeRecentTotal.set(null);
  }
}

// A new order or tag chosen while a page is still loading is not dropped: it loads once that page is done.
let reloadQueued = false;

export async function loadHomeRecentNotes({ append = false, queueIfBusy = false } = {}) {
  if (get(homeRecentLoading)) {
    if (queueIfBusy) reloadQueued = true;
    return;
  }
  const current = get(homeRecentNotes);
  const offset = append ? current.length : 0;
  const tag = get(boardTag);
  homeRecentLoading.set(true);
  if (!append) void loadHomeRecentTotal(tag);
  try {
    const recent = await apiGet('/api/notes/recent', {
      limit: BOARD_PAGE_SIZE,
      offset,
      sort: get(boardSort),
      tag: tag || undefined,
    });
    const nextNotes = Array.isArray(recent) ? recent : [];
    if (append) {
      const seen = new Set(current.map((note) => note.path));
      homeRecentNotes.set([
        ...current,
        ...nextNotes.filter((note) => note?.path && !seen.has(note.path)),
      ]);
    } else {
      homeRecentNotes.set(nextNotes);
    }
    homeRecentHasMore.set(nextNotes.length === BOARD_PAGE_SIZE);
    homeRecentError.set(null);
  } catch (err) {
    if (err instanceof ApiError) {
      homeRecentError.set(err.message || `HTTP ${err.status}`);
      console.error(`Failed to load recent notes: HTTP ${err.status}`);
    } else {
      homeRecentError.set(err?.message || String(err));
      console.error('Failed to load recent notes:', err);
    }
  } finally {
    homeRecentLoading.set(false);
    if (reloadQueued) {
      reloadQueued = false;
      void loadHomeRecentNotes();
    }
  }
}

/** The narrowest a board card may get before its title and excerpt stop reading. */
export const BOARD_CARD_MIN_WIDTH = 280;
const BOARD_GAP = 16;

/**
 * How many columns of cards fit in a board this wide: the choices offered are only these, so a "4" never
 * shows where four cards would be squeezed (the sidebar open, a narrow window). One column offers no choice.
 * @returns {number[]} the counts from [2, 3, 4] that fit; empty when even two do not
 */
export function fittingColumnCounts(width, { minWidth = BOARD_CARD_MIN_WIDTH, gap = BOARD_GAP } = {}) {
  if (!(width > 0)) return [];
  return [2, 3, 4].filter((count) => count * minWidth + (count - 1) * gap <= width);
}

/** The columns the board actually draws: the chosen count, or the most that fit when it does not. */
export function boardColumnCount(chosen, fitting) {
  const wanted = Number(chosen) || 3;
  if (!fitting.length) return 1;
  return fitting.includes(wanted) ? wanted : Math.max(...fitting.filter((count) => count <= wanted), fitting[0]);
}
