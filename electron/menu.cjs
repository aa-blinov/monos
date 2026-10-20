// The native menu bar of the desktop app.
//
// A desktop app keeps its commands where a person looks for them first — the menu bar — and
// Monos had none of its own there: only the stock Electron menu, with "Reload" and "Toggle
// Developer Tools" in it and not a single Monos command.
//
// The labels live here in both languages: the menu is the shell's own speech, and the page's
// strings are not reachable from here (the packaged app ships only the built page).
//
// The accelerators are the ones the page answers to. A menu accelerator swallows the key, so the
// page's own handler stops seeing it — that is why every accelerated item here sends a command
// the page performs. Keys that mean different things depending on the focus (⌘B is bold in a
// note and hides the sidebar elsewhere) are left without an accelerator: the page decides.

const APP_NAME = 'Monos';

const LABELS = {
  en: {
    about: 'About Monos',
    settings: 'Settings…',
    services: 'Services',
    hide: 'Hide Monos',
    hideOthers: 'Hide Others',
    showAll: 'Show All',
    quit: 'Quit',
    note: 'Note',
    newNote: 'New Note',
    openNote: 'Open Note…',
    recent: 'Open Recent',
    save: 'Save',
    print: 'Print…',
    reveal: 'Reveal in Finder',
    closeNote: 'Close Note',
    closeWindow: 'Close Window',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    pasteAndMatchStyle: 'Paste and Match Style',
    selectAll: 'Select All',
    format: 'Format',
    bold: 'Bold',
    italic: 'Italic',
    strikethrough: 'Strikethrough',
    inlineCode: 'Inline Code',
    heading1: 'Heading 1',
    heading2: 'Heading 2',
    bulletList: 'Bullet List',
    numberedList: 'Numbered List',
    checklist: 'Checklist',
    find: 'Find…',
    view: 'View',
    toggleSidebar: 'Toggle Sidebar',
    outline: 'Outline',
    focus: 'Focus Mode',
    palette: 'Command Palette',
    terminal: 'Terminal',
    actualSize: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    fullScreen: 'Full Screen',
    window: 'Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    front: 'Bring All to Front',
    helpMenu: 'Help',
    help: 'Monos Help',
    shortcuts: 'Keyboard Shortcuts',
  },
  ru: {
    about: 'О Monos',
    settings: 'Настройки…',
    services: 'Службы',
    hide: 'Скрыть Monos',
    hideOthers: 'Скрыть остальные',
    showAll: 'Показать все',
    quit: 'Завершить',
    note: 'Заметка',
    newNote: 'Новая заметка',
    openNote: 'Открыть заметку…',
    recent: 'Недавние заметки',
    save: 'Сохранить',
    print: 'Печать…',
    reveal: 'Показать в Finder',
    closeNote: 'Закрыть заметку',
    closeWindow: 'Закрыть окно',
    edit: 'Правка',
    undo: 'Отменить',
    redo: 'Повторить',
    cut: 'Вырезать',
    copy: 'Копировать',
    paste: 'Вставить',
    pasteAndMatchStyle: 'Вставить по образцу',
    selectAll: 'Выделить всё',
    format: 'Формат',
    bold: 'Жирный',
    italic: 'Курсив',
    strikethrough: 'Зачёркнутый',
    inlineCode: 'Код в строке',
    heading1: 'Заголовок 1',
    heading2: 'Заголовок 2',
    bulletList: 'Маркированный список',
    numberedList: 'Нумерованный список',
    checklist: 'Список задач',
    find: 'Найти…',
    view: 'Вид',
    toggleSidebar: 'Боковая панель',
    outline: 'Структура',
    focus: 'Режим фокуса',
    palette: 'Палитра команд',
    terminal: 'Терминал',
    actualSize: 'Реальный размер',
    zoomIn: 'Увеличить',
    zoomOut: 'Уменьшить',
    fullScreen: 'Полный экран',
    window: 'Окно',
    minimize: 'Свернуть',
    zoom: 'Развернуть',
    front: 'Передвинуть всё на передний план',
    helpMenu: 'Справка',
    help: 'Справка Monos',
    shortcuts: 'Горячие клавиши',
  },
};

/** The labels for the interface language; anything unknown falls back to English. */
function menuLabels(locale) {
  return LABELS[locale] || LABELS.en;
}

/**
 * The menu bar. `send(command)` hands a command to the page, which performs it.
 * `state` is what the window shows right now: the toggles carry a checkmark and the
 * items that need an open note are greyed out without one.
 * The roles do what the system expects of them and carry their own labels, so the menu
 * speaks one language from top to bottom.
 */
function buildMenuTemplate(locale, send, state = {}) {
  const t = menuLabels(locale);
  const hasNote = state.hasNote === true;
  const recent = Array.isArray(state.recent) ? state.recent : [];
  return [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: t.about },
        { type: 'separator' },
        { label: t.settings, accelerator: 'Cmd+,', click: () => send('settings') },
        { type: 'separator' },
        { role: 'services', label: t.services },
        { type: 'separator' },
        { role: 'hide', label: t.hide },
        { role: 'hideOthers', label: t.hideOthers },
        { role: 'unhide', label: t.showAll },
        { type: 'separator' },
        { role: 'quit', label: t.quit },
      ],
    },
    {
      label: t.note,
      submenu: [
        { label: t.newNote, accelerator: 'Cmd+N', click: () => send('new-note') },
        { label: t.openNote, accelerator: 'Cmd+O', click: () => send('open-note') },
        {
          label: t.recent,
          enabled: recent.length > 0,
          submenu: recent.map((note) => ({
            label: note.label,
            click: () => send('open-recent', { path: note.path, name: note.name }),
          })),
        },
        { type: 'separator' },
        // ⌘W закрывает то, что открыто: заметку, а без заметки — окно, как на macOS.
        { label: hasNote ? t.closeNote : t.closeWindow, accelerator: 'Cmd+W', click: () => send(hasNote ? 'close-note' : 'close-window') },
        { type: 'separator' },
        { label: t.save, accelerator: 'Cmd+S', enabled: hasNote, click: () => send('save') },
        { label: t.print, accelerator: 'Cmd+P', enabled: hasNote, click: () => send('print') },
        { label: t.reveal, enabled: hasNote, click: () => send('reveal-in-finder') },
      ],
    },
    {
      label: t.edit,
      submenu: [
        { role: 'undo', label: t.undo },
        { role: 'redo', label: t.redo },
        { type: 'separator' },
        { role: 'cut', label: t.cut },
        { role: 'copy', label: t.copy },
        { role: 'paste', label: t.paste },
        { role: 'pasteAndMatchStyle', label: t.pasteAndMatchStyle },
        { role: 'selectAll', label: t.selectAll },
        { type: 'separator' },
        // Клавиша ⌘F без ускорителя: в терминале она ищет по выводу, в заметке — по её тексту.
        { label: t.find, enabled: hasNote, click: () => send('find') },
      ],
    },
    {
      // Форматирование живёт и в меню — как в любом приложении с текстом на macOS.
      // Без ускорителей: ⌘B в Monos двусмысленна (в тексте — жирный, вне текста — боковая панель),
      // и меню забрало бы эту клавишу себе.
      label: t.format,
      submenu: [
        { label: t.bold, enabled: hasNote, click: () => send('format-bold') },
        { label: t.italic, enabled: hasNote, click: () => send('format-italic') },
        { label: t.strikethrough, enabled: hasNote, click: () => send('format-strikethrough') },
        { label: t.inlineCode, enabled: hasNote, click: () => send('format-code') },
        { type: 'separator' },
        { label: t.heading1, enabled: hasNote, click: () => send('format-heading-1') },
        { label: t.heading2, enabled: hasNote, click: () => send('format-heading-2') },
        { type: 'separator' },
        { label: t.bulletList, enabled: hasNote, click: () => send('format-bullet-list') },
        { label: t.numberedList, enabled: hasNote, click: () => send('format-numbered-list') },
        { label: t.checklist, enabled: hasNote, click: () => send('format-task-list') },
      ],
    },
    {
      label: t.view,
      submenu: [
        { label: t.toggleSidebar, type: 'checkbox', checked: state.sidebar === true, click: () => send('toggle-sidebar') },
        { label: t.outline, type: 'checkbox', checked: state.outline === true, enabled: hasNote, click: () => send('outline') },
        { label: t.focus, type: 'checkbox', checked: state.focus === true, enabled: hasNote, click: () => send('focus') },
        { type: 'separator' },
        { label: t.palette, accelerator: 'Cmd+K', click: () => send('palette') },
        { label: t.terminal, type: 'checkbox', checked: state.terminal === true, accelerator: 'Cmd+J', click: () => send('terminal') },
        { type: 'separator' },
        { role: 'resetZoom', label: t.actualSize },
        { role: 'zoomIn', label: t.zoomIn },
        { role: 'zoomOut', label: t.zoomOut },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t.fullScreen },
      ],
    },
    {
      label: t.window,
      submenu: [
        { role: 'minimize', label: t.minimize },
        { role: 'zoom', label: t.zoom },
        { type: 'separator' },
        { role: 'front', label: t.front },
      ],
    },
    {
      role: 'help',
      label: t.helpMenu,
      submenu: [
        { label: t.help, accelerator: 'Cmd+/', click: () => send('help') },
        { label: t.shortcuts, click: () => send('shortcuts') },
      ],
    },
  ];
}

/**
 * The menu under the Dock icon. macOS apps put their own commands there — a new
 * document and the notes opened last — so the Dock icon is a way in, not a dead end.
 */
function buildDockTemplate(locale, send, state = {}) {
  const t = menuLabels(locale);
  const recent = Array.isArray(state.recent) ? state.recent : [];
  return [
    { label: t.newNote, click: () => send('new-note') },
    {
      label: t.recent,
      enabled: recent.length > 0,
      submenu: recent.map((note) => ({
        label: note.label,
        click: () => send('open-recent', { path: note.path, name: note.name }),
      })),
    },
    { type: 'separator' },
    { label: t.hide, click: () => send('hide-app') },
    { label: t.showAll, click: () => send('show-app') },
  ];
}

/**
 * The menu that opens on a right-click inside the text. macOS expects its own menu
 * there: the roles act on the field that holds the cursor.
 */
function buildContextMenuTemplate(locale) {
  const t = menuLabels(locale);
  return [
    { role: 'cut', label: t.cut },
    { role: 'copy', label: t.copy },
    { role: 'paste', label: t.paste },
    { role: 'selectAll', label: t.selectAll },
  ];
}

module.exports = { APP_NAME, LABELS, menuLabels, buildMenuTemplate, buildDockTemplate, buildContextMenuTemplate };
