import { writable } from 'svelte/store';

export const editMode = writable(localStorage.getItem('editMode') || 'rich');
export const syncScroll = writable(true);
export const activeTheme = writable(localStorage.getItem('theme') || 'gruvbox');
export const fontFamily = writable(localStorage.getItem('fontFamily') || 'JetBrains Mono');
export const fontSize = writable(localStorage.getItem('fontSize') || 'medium');

editMode.subscribe(value => {
  localStorage.setItem('editMode', value);
});

activeTheme.subscribe(value => {
  localStorage.setItem('theme', value);
});

fontFamily.subscribe(value => {
  localStorage.setItem('fontFamily', value);
});

fontSize.subscribe(value => {
  localStorage.setItem('fontSize', value);
});
