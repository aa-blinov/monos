import { writable } from 'svelte/store';
import { persisted } from './lib/stores/persisted.js';
import { clampOutlineWidth } from './lib/outline.js';
export { tabsToSpaces } from './lib/tabs.js';

const THEME_MODES = ['system', 'light', 'dark'];

function isThemeMode(value) {
  return typeof value === 'string' && THEME_MODES.includes(value);
}

function initialThemeMode() {
  const saved = localStorage.getItem('themeMode');
  if (isThemeMode(saved)) return saved;
  const legacyDarkMode = localStorage.getItem('darkMode');
  if (legacyDarkMode === 'true') return 'dark';
  if (legacyDarkMode === 'false') return 'light';
  return 'system';
}

export const activeTheme = persisted('theme', 'gruvbox');
export const themeMode = writable(initialThemeMode());
export const fontFamily = persisted('fontFamily', 'JetBrains Mono');
export const fontSize = persisted('fontSize', 'medium');
export const lineHeight = persisted('lineHeight', 'normal');
export const editorFontSize = persisted('editorFontSize', 'md');
export const noteView = persisted('noteView', 'board');
// The native menu asks the open note to change its view: focus mode and the structure column.
export const editorViewCommand = writable(null);
export const boardColumns = persisted('boardColumns', '3');
export const boardGroupByColor = persisted('boardGroupByColor', false, {
  serialize: (v) => String(v),
  deserialize: (s) => s === 'true',
});
// Оглавление на десктопе свёрнуто в узкую полоску; на телефоне не используется.
export const outlineHidden = persisted('outlineHidden', false, {
  serialize: (v) => String(v),
  deserialize: (s) => s === 'true',
});
// The Attachments page remembers how it was sorted and which type it showed.
export const attachmentsSort = persisted('attachmentsSort', 'new', { validate: (v) => ['new', 'size', 'name', 'notes'].includes(v) });
export const attachmentsKind = persisted('attachmentsKind', 'all', { validate: (v) => ['all', 'image', 'pdf'].includes(v) });

// «Закреплённые» в боковой панели можно свернуть до одной строки; выбор помнится.
export const pinnedCollapsed = persisted('pinnedCollapsed', false, {
  serialize: (v) => String(v),
  deserialize: (s) => s === 'true',
});

// Ширина колонки «Структура» на десктопе: тянется за левый край, помнится между запусками.
export const outlineWidth = persisted('outlineWidth', clampOutlineWidth(), {
  deserialize: clampOutlineWidth,
});

// The default column is Medium (about 100 characters a line). Everyone who still has the old default, Very wide,
// is moved once: a saved «wide» cannot be told from a choice, so the choice is made again in the three-dot menu.
export const contentWidth = persisted('contentWidth', 'medium', {
  migrate: (saved, read) => {
    if (!saved) return 'medium';
    if (read('contentWidthDefaultMedium') !== 'true' && saved === 'wide') return 'medium';
    return saved;
  },
});
contentWidth.subscribe(() => {
  localStorage.setItem('contentWidthDefaultMedium', 'true');
});

export const searchQuery = writable('');
export const searchResults = writable([]);
export const isSearching = writable(false);
export const editorState = writable({ path: null, dirty: false, saving: false });
export const editorAction = writable(null);
// Id шаблона, из которого менеджер просит создать заметку: модалка создания откроется на нём.
export const templateRequest = writable(null);
// A Settings section to bring into view when Settings opens ('sync', 'storage'), set by whoever sent the person there.
export const settingsSection = writable('');
export const noteSaveSignal = writable(null);
// Raised whenever a note's properties change, so the sidebar can show the Properties table once the first one exists.
export const propertiesChanged = writable(0);
// The note just created: its editor puts the caret in the body once the note has loaded.
export const focusNoteBody = writable(null);

themeMode.subscribe(value => {
  const mode = isThemeMode(value) ? value : 'system';
  localStorage.setItem('themeMode', mode);
  if (mode === 'system') localStorage.removeItem('darkMode');
  else localStorage.setItem('darkMode', mode === 'dark' ? 'true' : 'false');
});
