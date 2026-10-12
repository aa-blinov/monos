/**
 * Saved searches, kept on disk next to the notes so they follow the vault.
 *
 * The list is replaced wholesale: the panel is small, and a whole-list PUT
 * avoids the ordering and delete races an item-by-item API would invite.
 */

import { writable, get } from 'svelte/store';
import { get as apiGet, put } from './api/client.js';

const ENDPOINT = '/api/saved-searches';

export const savedSearches = writable([]);
export const savedSearchesReady = writable(false);

let loading = null;

export async function loadSavedSearches() {
  if (loading) return loading;
  loading = (async () => {
    try {
      const data = await apiGet(ENDPOINT);
      savedSearches.set(Array.isArray(data) ? data : []);
    } catch {
      // Панель покажет то, что есть, и даст сохранить заново.
      savedSearches.set([]);
    } finally {
      savedSearchesReady.set(true);
      loading = null;
    }
  })();
  return loading;
}

async function persist(next) {
  const previous = get(savedSearches);
  savedSearches.set(next);
  try {
    await put(ENDPOINT, { searches: next });
    return true;
  } catch (error) {
    // Диск не принял — возвращаем то, что было, чтобы список не врал.
    savedSearches.set(previous);
    throw error;
  }
}

function makeId() {
  return `saved-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/**
 * Save a query. Re-saving the same query only updates its name, so clicking
 * twice does not produce two identical entries.
 */
export async function addSavedSearch(name, query) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return null;
  const cleanName = String(name || '').trim() || cleanQuery.slice(0, 40);

  const current = get(savedSearches);
  const existing = current.find((s) => s.query === cleanQuery);
  if (existing) {
    if (existing.name === cleanName) return existing;
    const next = current.map((s) => (s.id === existing.id ? { ...s, name: cleanName } : s));
    await persist(next);
    return next.find((s) => s.id === existing.id);
  }

  const created = { id: makeId(), name: cleanName, query: cleanQuery };
  await persist([...current, created]);
  return created;
}

export async function renameSavedSearch(id, name) {
  const clean = String(name || '').trim();
  if (!clean) return;
  const next = get(savedSearches).map((s) => (s.id === id ? { ...s, name: clean } : s));
  await persist(next);
}

export async function removeSavedSearch(id) {
  await persist(get(savedSearches).filter((s) => s.id !== id));
}
