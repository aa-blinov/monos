import { writable, get } from 'svelte/store';
import { ApiError, get as apiGet } from './api/client.js';

export const BOARD_PAGE_SIZE = 36;

export const homeRecentNotes = writable([]);
export const homeRecentHasMore = writable(true);
export const homeRecentLoading = writable(false);

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
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(`Failed to load recent notes: HTTP ${err.status}`);
    } else {
      console.error('Failed to load recent notes:', err);
    }
  } finally {
    homeRecentLoading.set(false);
  }
}
