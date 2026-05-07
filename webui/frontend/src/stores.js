import { writable } from 'svelte/store';

export const editMode = writable(localStorage.getItem('editMode') || 'rich');
export const syncScroll = writable(true);
export const activeTheme = writable(localStorage.getItem('theme') || 'gruvbox');

editMode.subscribe(value => {
  localStorage.setItem('editMode', value);
});

activeTheme.subscribe(value => {
  localStorage.setItem('theme', value);
});
