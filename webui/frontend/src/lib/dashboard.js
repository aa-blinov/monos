import { writable, get } from 'svelte/store';
import { ApiError, get as apiGet } from './api/client.js';

export const BOARD_PAGE_SIZE = 36;

export const homeRecentNotes = writable([]);
export const homeRecentHasMore = writable(true);
export const homeRecentLoading = writable(false);
export const homeRecentError = writable(null);

export async function loadHomeRecentNotes({ append = false } = {}) {
  if (get(homeRecentLoading)) return;
  const current = get(homeRecentNotes);
  const offset = append ? current.length : 0;
  homeRecentLoading.set(true);
  try {
    const recent = await apiGet('/api/notes/recent', {
      limit: BOARD_PAGE_SIZE,
      offset,
      sort: 'modified',
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
