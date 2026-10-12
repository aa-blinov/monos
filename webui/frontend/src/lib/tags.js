import { get, post } from './api/client.js';

/** Tags with note counts, busiest first. */
export async function loadTagStats() {
  const stats = await get('/api/tags/stats');
  return Array.isArray(stats) ? stats : [];
}

export function renameTag(from, to) {
  return post('/api/tags/rename', { from, to });
}

export function deleteTag(tag) {
  return post('/api/tags/delete', { tag });
}

/**
 * Filter and order tags for the panel.
 *
 * Matching runs against the tag as written, so typing the start of a Russian
 * word works the same as an English one. The original order (count, then name)
 * is preserved among matches — the busiest tag should not jump down because
 * someone typed into the filter.
 *
 * @param {Array<{tag: string, count: number}>} stats
 * @param {string} filter
 */
export function filterTagStats(stats, filter) {
  const needle = String(filter || '').trim().toLowerCase();
  if (!needle) return Array.isArray(stats) ? stats : [];
  return (stats || []).filter((entry) => String(entry.tag || '').toLowerCase().includes(needle));
}