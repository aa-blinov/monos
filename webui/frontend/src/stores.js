import { writable } from 'svelte/store';

export const editMode = writable(localStorage.getItem('editMode') || 'rich');
export const syncScroll = writable(true);
export const activeTheme = writable(localStorage.getItem('theme') || 'gruvbox');
export const fontFamily = writable(localStorage.getItem('fontFamily') || 'JetBrains Mono');
export const fontSize = writable(localStorage.getItem('fontSize') || 'medium');
export const lineHeight = writable(localStorage.getItem('lineHeight') || 'normal');
export const contentWidth = writable(localStorage.getItem('contentWidth') || 'medium');

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

lineHeight.subscribe(value => {
  localStorage.setItem('lineHeight', value);
});

contentWidth.subscribe(value => {
  localStorage.setItem('contentWidth', value);
});
