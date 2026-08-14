import { writable } from 'svelte/store';

export const urlSearchQuery = writable('');
export const searchUrlReady = writable(false);
export const restoredInitialUrlSearch = writable(false);

export function searchParamFromUrl() {
  if (typeof window === 'undefined') return '';
  return new URL(window.location.href).searchParams.get('q') || '';
}

export function syncSearchUrl(query) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const cleanQuery = String(query || '').trim();
  urlSearchQuery.set(cleanQuery);
  if (cleanQuery) url.searchParams.set('q', cleanQuery);
  else url.searchParams.delete('q');

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) window.history.replaceState(window.history.state, '', nextUrl);
}
