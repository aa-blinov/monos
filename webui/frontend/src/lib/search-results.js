import { get } from 'svelte/store';
import { post } from './api/client.js';
import { searchQuery, searchResults, isSearching } from '../stores.js';

/**
 * Run a search against /api/search and write results to the
 * searchResults / isSearching stores. Skips the call when query
 * is empty, and discards the response if the user has typed
 * something else by the time the fetch returns.
 *
 * @param {string} query
 * @returns {Promise<void>}
 */
export async function runSearch(query) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return;

  isSearching.set(true);
  try {
    const results = await post('/api/search', {
      query: cleanQuery,
      search_content: true,
    });
    if (get(searchQuery) === cleanQuery) {
      searchResults.set(Array.isArray(results) ? results : []);
    }
  } catch {
    if (get(searchQuery) === cleanQuery) searchResults.set([]);
  } finally {
    if (get(searchQuery) === cleanQuery) isSearching.set(false);
  }
}
