import { writable } from 'svelte/store';

export const editMode = writable(localStorage.getItem('editMode') || 'rich');
export const activeTheme = writable(localStorage.getItem('theme') || 'gruvbox');
export const fontFamily = writable(localStorage.getItem('fontFamily') || 'JetBrains Mono');
export const fontSize = writable(localStorage.getItem('fontSize') || 'medium');
export const lineHeight = writable(localStorage.getItem('lineHeight') || 'normal');
export const contentWidth = writable(localStorage.getItem('contentWidth') || 'medium');
export const editorFontSize = writable(localStorage.getItem('editorFontSize') || 'medium');
export const noteView = writable(localStorage.getItem('noteView') || 'board');
export const boardColumns = writable(localStorage.getItem('boardColumns') || '3');
export const searchQuery = writable('');
export const searchResults = writable([]);
export const isSearching = writable(false);
export const editorState = writable({ path: null, dirty: false, saving: false });

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

editorFontSize.subscribe(value => {
  localStorage.setItem('editorFontSize', value);
});

noteView.subscribe(value => {
  localStorage.setItem('noteView', value);
});

boardColumns.subscribe(value => {
  localStorage.setItem('boardColumns', value);
});
