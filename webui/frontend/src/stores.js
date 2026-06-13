import { writable } from 'svelte/store';

function initialThemeMode() {
  const saved = localStorage.getItem('themeMode');
  if (['system', 'light', 'dark'].includes(saved)) return saved;
  const legacyDarkMode = localStorage.getItem('darkMode');
  if (legacyDarkMode === 'true') return 'dark';
  if (legacyDarkMode === 'false') return 'light';
  return 'system';
}

function initialContentWidth() {
  const saved = localStorage.getItem('contentWidth');
  const migrated = localStorage.getItem('contentWidthDefaultWide') === 'true';
  if (!saved) return 'wide';
  if (!migrated && saved === 'medium') return 'wide';
  return saved;
}

export const activeTheme = writable(localStorage.getItem('theme') || 'gruvbox');
export const themeMode = writable(initialThemeMode());
export const fontFamily = writable(localStorage.getItem('fontFamily') || 'JetBrains Mono');
export const fontSize = writable(localStorage.getItem('fontSize') || 'medium');
export const lineHeight = writable(localStorage.getItem('lineHeight') || 'normal');
export const contentWidth = writable(initialContentWidth());
export const editorFontSize = writable(localStorage.getItem('editorFontSize') || 'md');
export const noteView = writable(localStorage.getItem('noteView') || 'board');
export const boardColumns = writable(localStorage.getItem('boardColumns') || '3');
export const boardGroupByColor = writable(localStorage.getItem('boardGroupByColor') === 'true');
export const searchQuery = writable('');
export const searchResults = writable([]);
export const isSearching = writable(false);
export const editorState = writable({ path: null, dirty: false, saving: false });
export const editorAction = writable(null);

activeTheme.subscribe(value => {
  localStorage.setItem('theme', value);
});

themeMode.subscribe(value => {
  const mode = ['system', 'light', 'dark'].includes(value) ? value : 'system';
  localStorage.setItem('themeMode', mode);
  if (mode === 'system') localStorage.removeItem('darkMode');
  else localStorage.setItem('darkMode', mode === 'dark' ? 'true' : 'false');
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
  localStorage.setItem('contentWidthDefaultWide', 'true');
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

boardGroupByColor.subscribe(value => {
  localStorage.setItem('boardGroupByColor', value ? 'true' : 'false');
});
