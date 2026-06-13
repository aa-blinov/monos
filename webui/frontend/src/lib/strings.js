import { derived, writable } from 'svelte/store';

export const localeOptions = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
];

export const defaultLocale = 'en';

export function isSupportedLocale(value) {
  return localeOptions.some(option => option.value === value);
}

function getInitialLocale() {
  const saved = globalThis.localStorage?.getItem('locale');
  return isSupportedLocale(saved) ? saved : defaultLocale;
}

export const locale = writable(getInitialLocale());

locale.subscribe(value => {
  if (isSupportedLocale(value)) {
    globalThis.localStorage?.setItem('locale', value);
  }
});

const enColorNames = {
  '#a89984': 'Stone',
  '#928374': 'Gray',
  '#fb4934': 'Red',
  '#fe8019': 'Orange',
  '#fabd2f': 'Yellow',
  '#b8bb26': 'Green',
  '#8ec07c': 'Aqua',
  '#83a598': 'Blue',
  '#458588': 'Deep blue',
  '#d3869b': 'Purple',
};

const ruColorNames = {
  '#a89984': 'Камень',
  '#928374': 'Серый',
  '#fb4934': 'Красный',
  '#fe8019': 'Оранжевый',
  '#fabd2f': 'Жёлтый',
  '#b8bb26': 'Зелёный',
  '#8ec07c': 'Аква',
  '#83a598': 'Голубой',
  '#458588': 'Синий',
  '#d3869b': 'Фиолетовый',
};

const enText = {
  app: {
    closeSidebar: 'Close sidebar',
    resizeSidebar: 'Resize sidebar',
    emptyDesktop: 'Open a note from the sidebar, or start with one of the actions below.',
    emptyMobile: 'Open the menu to choose a note or create a new one.',
    openMenu: 'Open menu',
    homeActions: {
      newNote: '+ New note',
      newNoteHint: 'Capture a thought',
      today: 'Today',
      todayHint: 'Open a daily note',
      commandPalette: 'Cmd+K',
      commandPaletteHint: 'Search and run commands',
      openRecent: 'Open recent',
      openRecentHint: 'Continue where you left off',
      continueWork: 'Continue',
      continueWorkHint: 'Choose a recent note',
    },
    continueWork: {
      title: 'Continue working',
      hint: 'Recent notes you opened here.',
      all: 'All',
      modalTitle: 'Which document do you want to return to?',
    },
    board: {
      eyebrow: 'Notes',
      title: 'Notes',
      hint: 'Capture thoughts quickly. Find them by text, tags, or color.',
      filter: 'Search notes',
      filterPlaceholder: 'Search notes...',
      opened: 'Opened',
      columns(count) {
        return `${count} columns`;
      },
      groupByColor: 'Group by color',
      ungroupByColor: 'Ungroup colors',
      emptyNote: 'Note is empty',
      openFull: 'Open note',
      copyPath: 'Copy path',
      color: 'Color',
      noColorGroup: 'No color',
      colorName(color) {
        return enColorNames[color] || color;
      },
      colorGroup(color) {
        return enColorNames[color] || color;
      },
      applyColor(color) {
        return `Apply ${enColorNames[color] || color}`;
      },
    },
  },
  header: {
    search: 'Search',
    closeSearch: 'Close search',
    toggleSidebar: 'Toggle Sidebar',
    openSidebar: 'Open sidebar',
    closeSidebar: 'Close sidebar',
    toggleTheme: 'Toggle Theme',
    dashboard: 'Dashboard',
    back: 'Back to notes',
    boardView: 'Board view',
    listView: 'List view',
  },
  searchResults: {
    heading: 'Search Results',
    searching: 'Searching',
    noResults: 'No results',
    matches(count, query) {
      return `${count} ${count === 1 ? 'match' : 'matches'} for “${query}”`;
    },
  },
  commandPalette: {
    title: 'Command Palette',
    quickSwitcher: 'Quick Switcher',
    commandHint: 'Run commands or jump to a note.',
    quickSwitcherHint: 'Open a note by title or path.',
    placeholder: 'Type a command or note...',
    quickSwitcherPlaceholder: 'Open note...',
    loading: 'Loading notes',
    noResults: 'No results',
    close: 'Close command palette',
    loadFailed(message) {
      return `Failed to load notes: ${message}`;
    },
    sections: {
      commands: 'Commands',
      pinned: 'Pinned',
      recent: 'Recent',
      templates: 'Templates',
      notes: 'Notes',
    },
    commands: {
      quickOpen: 'Quick open note',
      openSettings: 'Open settings',
      toggleSidebar: 'Toggle sidebar',
      toggleTheme: 'Toggle theme',
    },
    commandDetails: {
      quickOpen: 'Switch to note-only search',
      openSettings: 'Go to the settings screen',
      toggleSidebar: 'Show or hide the knowledge tree',
      toggleTheme: 'Switch between light and dark mode',
    },
  },
  sidebar: {
    close: 'Close sidebar',
    mobileNavigation: 'Navigation',
    pinned: 'Pinned',
    recentThoughts: 'Recently Opened',
    knowledgeTree: 'Tree',
    new: '+ New',
    today: 'Today',
    templates: 'Templates',
    templatesHint: 'Notes from proven patterns',
    templateLibrary: 'Template Library',
    templateSearch: 'Search templates',
    templateSearchPlaceholder: 'meeting, project, research...',
    templateFolder: 'Folder',
    templatePreview: 'Preview',
    noTemplates: 'No templates found',
    useTemplate: 'Create from template',
    loading: 'Loading',
    empty: 'Empty',
    notes(count) {
      return `${count} ${count === 1 ? 'Note' : 'Notes'}`;
    },
    dropToRoot: 'Drop to root',
    syncWithGit: 'Sync with Git',
    quickNoteFromClipboard: 'Create quick note from clipboard',
    saveBeforeSync: 'Save the current note before syncing',
    waitForSaveBeforeSync: 'Wait until the current note finishes saving before syncing.',
    settings: 'Settings',
    trash: 'Trash',
    context: {
      newNote: 'New Note',
      newFolder: 'New Folder',
      pin: 'Pin Note',
      unpin: 'Unpin Note',
      editIcon: 'Edit Icon',
      rename: 'Rename',
      delete: 'Delete',
    },
    modals: {
      renameTitle(kind) {
        return `Rename ${kind}`;
      },
      section: 'Section',
      note: 'Note',
      newName: 'New Name',
      newNamePlaceholder: 'Enter new name...',
      rename: 'Rename',
      renaming: 'Renaming...',
      cancel: 'Cancel',
      iconColor: 'Icon & Color',
      color: 'Color',
      none: 'None',
      newSection: 'New Section',
      parentFolder: 'Parent Folder',
      root: 'Root',
      folderName: 'Folder Name',
      folderPlaceholder: 'e.g. AI',
      creating: 'Creating...',
      create: 'Create',
      newNote: 'New Note',
      createStart: 'Need a frame?',
      blankNote: 'Start from a blank page',
      blankNoteHint: 'For a thought that needs room',
      todayNote: 'Daily note',
      todayNoteHint: 'Create a note with the current date and time',
      fromTemplate: 'Note from template',
      fromTemplateHint: 'Create a note from a selected template',
      title: 'Title',
      titleHint: 'By default this creates a clean empty note. Add a title and start writing.',
      noteTitlePlaceholder: 'Give this note a name...',
      quickNoteSaved: 'Quick note saved',
      quickNoteSavedHint: 'The clipboard content was saved to Quick Notes. Do you want to open it now?',
      openNote: 'Open',
      stayHere: 'Stay here',
      quickNoteNotCreated: 'Quick note was not created',
      quickNoteClipboardEmptyHint: 'Clipboard is empty or does not contain text or an image. Copy something first, then try again.',
      quickNoteClipboardUnavailableHint: 'The browser did not allow Monos to read the clipboard. Copy text or an image again, or allow clipboard access, then try again.',
      understood: 'Got it',
    },
    errors: {
      loadTree(message) {
        return `Failed to load tree: ${message}`;
      },
      createFolder(message) {
        return `Failed to create folder: ${message}`;
      },
      createNote(message) {
        return `Failed to create note: ${message}`;
      },
      clipboardEmpty: 'Clipboard is empty. Copy some text first.',
      clipboardUnavailable: 'Clipboard is not available in this browser.',
      rename(message) {
        return `Failed to rename: ${message}`;
      },
      delete(message) {
        return `Failed to delete: ${message}`;
      },
      syncFailed: 'Sync failed:',
    },
    confirmDelete(name, isDir = false) {
      return isDir ? `Delete ${name}?` : `Move ${name} to trash?`;
    },
  },
  trash: {
    title: 'Trash',
    hint: 'Notes in trash are hidden from search, dashboard, and the tree until restored.',
    loading: 'Loading trash',
    emptyTitle: 'Trash is empty',
    emptyHint: 'Deleted notes will appear here before they are removed forever.',
    restore: 'Restore',
    deleteForever: 'Delete forever',
    deleteForeverConfirm(name) {
      return `Delete ${name} forever? This cannot be undone.`;
    },
  },
  templates: {
    title: 'Templates',
    hint: 'Manage the built-in library, hide templates you do not use, and create your own note patterns.',
    customTitle: 'Custom Template',
    customHint: 'Use placeholders like {{title}}, {{date}}, {{shortDate}}, and {{time}} in the markdown body.',
    newTemplate: 'New template',
    templateTitle: 'Template title',
    description: 'Description',
    folder: 'Folder',
    tags: 'Tags',
    content: 'Markdown content',
    placeholders: 'Variables: {{title}}, {{date}}, {{shortDate}}, {{time}}.',
    createTemplate: 'Create template',
    saveChanges: 'Save changes',
    myTemplates: 'My Templates',
    myTemplatesHint: 'These appear before the built-in templates when creating a note.',
    noCustomTemplates: 'No custom templates yet.',
    noDescription: 'No description',
    libraryTitle: 'Library Templates',
    libraryHint: 'Hidden library templates will not appear in the create-from-template flow.',
    searchPlaceholder: 'Search templates...',
    hide: 'Hide template',
    show: 'Show template',
    edit: 'Edit template',
    delete: 'Delete template',
    deleteConfirm(name) {
      return `Delete custom template ${name}?`;
    },
  },
  settings: {
    title: 'Settings',
    hint: 'Adjust the interface, editor, sync, templates, and backup behavior.',
    back: 'Back',
    language: 'Language',
    interfaceLanguage: 'Interface Language',
    theme: 'Theme',
    themeMode: 'Theme mode',
    themeModeSystem: 'System',
    themeModeLight: 'Light',
    themeModeDark: 'Dark',
    colorTheme: 'Color theme',
    typography: 'Typography',
    font: 'Font',
    size: 'Size',
    editor: 'Editor',
    defaultMode: 'Default Mode',
    fontSize: 'Font Size',
    backup: 'Backup',
    backupHint: 'Export all notes as a ZIP, or import a ZIP to merge notes into the current tree.',
    exportTitle: 'Export notes',
    exportNotes: 'Download ZIP',
    exporting: 'Exporting...',
    exportComplete: 'ZIP export is ready.',
    exportFailed: 'Export failed',
    importTitle: 'Import notes',
    chooseArchive: 'Choose ZIP',
    noArchiveSelected: 'No archive selected',
    importing: 'Importing...',
    importFailed: 'Import failed',
    importComplete(summary = {}) {
      const notes = Number(summary.importedNotes || 0);
      const files = Number(summary.importedFiles || 0);
      const renamed = Number(summary.renamed || 0);
      const suffix = renamed ? ` ${renamed} renamed to avoid overwriting.` : '';
      return `Imported ${notes} note${notes === 1 ? '' : 's'} (${files} file${files === 1 ? '' : 's'}).${suffix}`;
    },
    backupError(message) {
      return `Backup error: ${message}`;
    },
    githubConnection: 'GitHub Connection',
    tokenHelp: 'How to get a token?',
    tokenHelpUrl: 'github.com/settings/tokens',
    tokenHelpSteps: [
      '1. Go to',
      '2. Click Generate new token -> Fine-grained token',
      '3. Set Repository access -> Only select repositories -> choose your notes repo',
      '4. Under Permissions -> Contents -> set Read and write',
      '5. Click Generate token and copy it',
    ],
    tokenHelpNote: 'The token needs Contents: Read and write permission to sync notes via the GitHub API.',
    personalAccessToken: 'Personal Access Token',
    tokenPlaceholder: 'ghp_...',
    reset: 'Reset',
    authenticate: 'Authenticate',
    connecting: 'Connecting...',
    invalidToken: 'Invalid token',
    failedToFetchRepos: 'Failed to fetch repos',
    owner: 'Owner',
    repository: 'Repository',
    select: 'Select...',
    loading: 'Loading...',
    branch: 'Branch',
    deviceName: 'Device Name',
    devicePlaceholder: 'My Laptop',
    connectRepository: 'Connect Repository',
    syncSettings: 'Sync Settings',
    autoSyncInterval: 'Auto-Sync Interval (min)',
    autoSyncHint: '0 = disabled',
    commitMessage: 'Commit Message',
    autoFormatOnSave: 'Auto-format on save',
    statusAndSync: 'Status & Sync',
    checking: 'Checking...',
    clean: 'clean',
    dirty: 'dirty',
    conflict: 'conflict',
    ahead(count) {
      return `↑ ${count} ahead of remote`;
    },
    behind(count) {
      return `↓ ${count} behind remote — pull recommended`;
    },
    lastSync(value) {
      return `Last sync: ${value}`;
    },
    syncNow: 'Sync Now',
    syncing: 'Syncing...',
    notInitialized: 'Not initialized. Authenticate and select a repository above.',
    loadingStatus: 'Loading status...',
    refreshStatus: 'Refresh Status',
    viewConflicts: 'View Conflicts',
    conflicts(count) {
      return `Conflicts (${count})`;
    },
    markResolved: 'Mark Resolved (delete _conflicts/)',
    resolveConflicts: 'Resolve Conflicts',
    conflictOurs: 'Ours (Local)',
    conflictTheirs: 'Theirs (Remote)',
    keepLocal: 'Keep Local',
    keepRemote: 'Keep Remote',
    conflictsRemaining(count) {
      return `${count} more conflict${count > 1 ? 's' : ''} remaining`;
    },
    chooseConflictVersion: 'Choose local or remote to resolve this conflict.',
    empty: '(empty)',
    saveBeforeSync: 'Save the current note before syncing.',
    waitForSaveBeforeSync: 'Wait until the current note finishes saving before syncing.',
    defaultCommitMessage: 'Sync from Monos WebUI',
  },
  editor: {
    formatAllNotes: 'Format all notes',
    deleteNote: 'Delete note',
    gatheringThoughts: 'Gathering Thoughts',
    beginWriting: 'Begin writing...',
    archiveTitle: 'Move this note to trash?',
    archiveConfirm(name) {
      return `${name} will disappear from notes, search, and the tree. You can restore it from Trash.`;
    },
    cancel: 'Cancel',
    archiving: 'Moving...',
    deletePermanently: 'Move to trash',
    formatFailed: 'Format failed',
    saving: 'Saving…',
    saved: 'Saved',
    saveFailed: 'Save failed',
    noteNotFound(target) {
      return `Note "${target}" not found.`;
    },
    deleteError(message) {
      return `Ошибка при удалении: ${message}`;
    },
    localNavigation: 'Related',
    imageUploadFailed: 'Image upload failed',
    imageRenameFailed: 'Image rename failed',
    renameImageTitle: 'Rename image',
    renameImageHint: 'The file will be renamed on disk and the Markdown link in this note will be updated.',
    renameImage: 'Rename',
      noteColor: 'Note color',
      noColor: 'No',
  },
  editorHeader: {
    noteTitle: 'Note Title',
    created: 'Created',
    modified: 'Modified',
    tagPlaceholder: '+ tag',
    revealInTree: 'Reveal in tree',
  },
  sourceEditor: {
    beginWriting: 'Begin writing...',
    linkedMentions: 'Linked notes',
    backlink: 'Backlink',
    mention: 'Mention',
    wikiSuggestions: 'Note suggestions',
    resizeContent: 'Resize source content',
  },
  richEditor: {
    beginWriting: 'Begin writing...',
    toolbar: 'Editor toolbar',
    undo: 'Undo (Ctrl+Z)',
    redo: 'Redo (Ctrl+Shift+Z)',
    bold: 'Bold (Ctrl+B)',
    italic: 'Italic (Ctrl+I)',
    strikethrough: 'Strikethrough',
    inlineCode: 'Inline Code (Ctrl+E)',
    heading1: 'Heading 1',
    heading2: 'Heading 2',
    heading3: 'Heading 3',
    heading4: 'Heading 4',
    bulletList: 'Bullet List',
    numberedList: 'Numbered List',
    checklist: 'Checklist',
    blockquote: 'Blockquote',
    codeBlock: 'Code Block',
    horizontalRule: 'Horizontal Rule',
    insertTable: 'Insert Table',
    addLink: 'Add Link',
    contentWidth: 'Content Width',
    lineHeight: 'Line Height',
    fontSize: 'Font Size',
    linkPrompt: 'URL:',
    imagePrompt: 'Image URL:',
    slashMenuLabel: 'Slash commands',
    slashHint: 'Type / for commands',
    slashCommands: {
      heading1: 'Heading 1',
      heading2: 'Heading 2',
      bulletList: 'Bullet list',
      numberedList: 'Numbered list',
      checklist: 'Checklist',
      blockquote: 'Quote',
      codeBlock: 'Code block',
      table: 'Table',
      horizontalRule: 'Divider',
    },
  },
  browser: {
    browseFiles: 'Browse Files',
    searchFiles: 'Search files...',
    createNewNote: 'Create new note',
    newNote: 'New Note',
    loadingFiles: 'Loading files...',
    noFilesFound: 'No files found',
    createYourFirstNote: 'Create Your First Note',
    createNewNoteTitle: 'Create New Note',
    title: 'Title *',
    titlePlaceholder: 'Enter note title...',
    category: 'Category *',
    categoryPlaceholder: 'e.g., Образование, Работа, Документы...',
    cancel: 'Cancel',
    create: 'Create',
    fillAllFields: 'Please fill in all fields',
    failedToCreateNote(message) {
      return `Failed to create note: ${message}`;
    },
    failedToLoadTree(message) {
      return `Failed to load tree: ${message}`;
    },
  },
  modal: {
    close: 'Close modal',
    closeBackdrop: 'Close modal by clicking backdrop',
  },
};

const ruText = {
  app: {
    closeSidebar: 'Закрыть боковую панель',
    resizeSidebar: 'Изменить ширину сайдбара',
    emptyDesktop: 'Откройте заметку в боковой панели или начните с одного из действий ниже.',
    emptyMobile: 'Откройте меню, чтобы выбрать заметку или создать новую.',
    openMenu: 'Открыть меню',
    homeActions: {
      newNote: '+ Новая заметка',
      newNoteHint: 'Быстро записать мысль',
      today: 'Сегодня',
      todayHint: 'Открыть дневную заметку',
      commandPalette: 'Cmd+K',
      commandPaletteHint: 'Поиск и команды',
      openRecent: 'Открыть последнюю',
      openRecentHint: 'Продолжить с места остановки',
      continueWork: 'Продолжить',
      continueWorkHint: 'Выбрать недавний документ',
    },
    continueWork: {
      title: 'Продолжить работу',
      hint: 'Недавние заметки, к которым можно вернуться.',
      all: 'Все',
      modalTitle: 'К какому документу вернуться?',
    },
    board: {
      eyebrow: 'Заметки',
      title: 'Заметки',
      hint: 'Быстро фиксируйте мысли. Находите по тексту, тегам или цвету.',
      filter: 'Поиск по заметкам',
      filterPlaceholder: 'Искать заметки...',
      opened: 'Открыта',
      columns(count) {
        return `${count} ${count === 2 ? 'колонки' : 'колонки'}`;
      },
      groupByColor: 'Группировать по цветам',
      ungroupByColor: 'Без группировки по цветам',
      emptyNote: 'Заметка пустая',
      openFull: 'Открыть заметку',
      copyPath: 'Скопировать путь',
      color: 'Цвет',
      noColorGroup: 'Без цвета',
      colorName(color) {
        return ruColorNames[color] || color;
      },
      colorGroup(color) {
        return ruColorNames[color] || color;
      },
      applyColor(color) {
        return `Применить ${ruColorNames[color] || color}`;
      },
    },
  },
  header: {
    search: 'Поиск',
    closeSearch: 'Закрыть поиск',
    toggleSidebar: 'Показать или скрыть боковую панель',
    openSidebar: 'Открыть боковую панель',
    closeSidebar: 'Закрыть боковую панель',
    toggleTheme: 'Переключить тему',
    dashboard: 'Дашборд',
    back: 'Назад к заметкам',
    boardView: 'Вид карточками',
    listView: 'Вид списком',
  },
  searchResults: {
    heading: 'Результаты поиска',
    searching: 'Идёт поиск',
    noResults: 'Ничего не найдено',
    matches(count, query) {
      const form = count === 1 ? 'совпадение' : count > 1 && count < 5 ? 'совпадения' : 'совпадений';
      return `${count} ${form} по запросу «${query}»`;
    },
  },
  commandPalette: {
    title: 'Палитра команд',
    quickSwitcher: 'Быстрое открытие',
    commandHint: 'Запустите команду или перейдите к заметке.',
    quickSwitcherHint: 'Откройте заметку по названию или пути.',
    placeholder: 'Введите команду или заметку...',
    quickSwitcherPlaceholder: 'Открыть заметку...',
    loading: 'Загрузка заметок',
    noResults: 'Ничего не найдено',
    close: 'Закрыть палитру команд',
    loadFailed(message) {
      return `Не удалось загрузить заметки: ${message}`;
    },
    sections: {
      commands: 'Команды',
      pinned: 'Закреплённые',
      recent: 'Недавние',
      templates: 'Шаблоны',
      notes: 'Заметки',
    },
    commands: {
      quickOpen: 'Быстро открыть заметку',
      openSettings: 'Открыть настройки',
      toggleSidebar: 'Переключить боковую панель',
      toggleTheme: 'Переключить тему',
    },
    commandDetails: {
      quickOpen: 'Перейти к поиску только по заметкам',
      openSettings: 'Открыть экран настроек',
      toggleSidebar: 'Показать или скрыть дерево знаний',
      toggleTheme: 'Переключить светлую и тёмную тему',
    },
  },
  sidebar: {
    close: 'Закрыть боковую панель',
    mobileNavigation: 'Навигация',
    pinned: 'Закреплённые',
    recentThoughts: 'Недавно открытые',
    knowledgeTree: 'Дерево',
    new: '+ Создать',
    today: 'Сегодня',
    templates: 'Шаблоны',
    templatesHint: 'Заметки из готовых структур',
    templateLibrary: 'Библиотека шаблонов',
    templateSearch: 'Поиск шаблонов',
    templateSearchPlaceholder: 'встреча, проект, исследование...',
    templateFolder: 'Папка',
    templatePreview: 'Предпросмотр',
    noTemplates: 'Шаблоны не найдены',
    useTemplate: 'Создать из шаблона',
    loading: 'Загрузка',
    empty: 'Пусто',
    notes(count) {
      const mod10 = count % 10;
      const mod100 = count % 100;
      const form = mod10 === 1 && mod100 !== 11
        ? 'заметка'
        : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
          ? 'заметки'
          : 'заметок';
      return `${count} ${form}`;
    },
    dropToRoot: 'Переместить в корень',
    syncWithGit: 'Синхронизировать с Git',
    quickNoteFromClipboard: 'Создать быструю заметку из буфера обмена',
    saveBeforeSync: 'Сохраните текущую заметку перед синхронизацией',
    waitForSaveBeforeSync: 'Дождитесь сохранения текущей заметки перед синхронизацией.',
    settings: 'Настройки',
    trash: 'Корзина',
    context: {
      newNote: 'Новая заметка',
      newFolder: 'Новая папка',
      pin: 'Закрепить заметку',
      unpin: 'Открепить заметку',
      editIcon: 'Изменить иконку',
      rename: 'Переименовать',
      delete: 'Удалить',
    },
    modals: {
      renameTitle(kind) {
        return `Переименовать ${kind}`;
      },
      section: 'раздел',
      note: 'заметку',
      newName: 'Новое имя',
      newNamePlaceholder: 'Введите новое имя...',
      rename: 'Переименовать',
      renaming: 'Переименование...',
      cancel: 'Отмена',
      iconColor: 'Иконка и цвет',
      color: 'Цвет',
      none: 'Нет',
      newSection: 'Новый раздел',
      parentFolder: 'Родительская папка',
      root: 'Корень',
      folderName: 'Имя папки',
      folderPlaceholder: 'например, AI',
      creating: 'Создание...',
      create: 'Создать',
      newNote: 'Новая заметка',
      createStart: 'Нужна опора?',
      blankNote: 'С чистого листа',
      blankNoteHint: 'Для мысли, которой нужен простор',
      todayNote: 'Дневная заметка',
      todayNoteHint: 'Создать заметку с текущей датой и временем',
      fromTemplate: 'Заметка из шаблона',
      fromTemplateHint: 'Создать заметку по выбранному шаблону',
      title: 'Заголовок',
      titleHint: 'По умолчанию создаётся чистая заметка. Дайте ей имя и начинайте писать.',
      noteTitlePlaceholder: 'Дайте заметке имя...',
      quickNoteSaved: 'Быстрая заметка сохранена',
      quickNoteSavedHint: 'Содержимое буфера обмена сохранено в Quick Notes. Открыть заметку сейчас?',
      openNote: 'Открыть',
      stayHere: 'Остаться здесь',
      quickNoteNotCreated: 'Быстрая заметка не создана',
      quickNoteClipboardEmptyHint: 'Буфер обмена пуст или не содержит текст/изображение. Скопируйте что-нибудь и попробуйте ещё раз.',
      quickNoteClipboardUnavailableHint: 'Браузер не дал Monos прочитать буфер обмена. Скопируйте текст или изображение ещё раз либо разрешите доступ к буферу, затем повторите.',
      understood: 'Понятно',
    },
    errors: {
      loadTree(message) {
        return `Не удалось загрузить дерево: ${message}`;
      },
      createFolder(message) {
        return `Не удалось создать папку: ${message}`;
      },
      createNote(message) {
        return `Не удалось создать заметку: ${message}`;
      },
      clipboardEmpty: 'Буфер обмена пуст. Сначала скопируйте текст.',
      clipboardUnavailable: 'Буфер обмена недоступен в этом браузере.',
      rename(message) {
        return `Не удалось переименовать: ${message}`;
      },
      delete(message) {
        return `Не удалось удалить: ${message}`;
      },
      syncFailed: 'Ошибка синхронизации:',
    },
    confirmDelete(name, isDir = false) {
      return isDir ? `Удалить ${name}?` : `Переместить ${name} в корзину?`;
    },
  },
  trash: {
    title: 'Корзина',
    hint: 'Заметки в корзине скрыты из поиска, дашборда и дерева, пока вы их не восстановите.',
    loading: 'Загрузка корзины',
    emptyTitle: 'Корзина пуста',
    emptyHint: 'Удалённые заметки будут появляться здесь перед окончательным удалением.',
    restore: 'Восстановить',
    deleteForever: 'Удалить навсегда',
    deleteForeverConfirm(name) {
      return `Удалить ${name} навсегда? Это действие нельзя отменить.`;
    },
  },
  templates: {
    title: 'Шаблоны',
    hint: 'Управляйте библиотекой, скрывайте ненужные шаблоны и создавайте свои структуры заметок.',
    customTitle: 'Пользовательский шаблон',
    customHint: 'В markdown можно использовать {{title}}, {{date}}, {{shortDate}} и {{time}}.',
    newTemplate: 'Новый шаблон',
    templateTitle: 'Название шаблона',
    description: 'Описание',
    folder: 'Папка',
    tags: 'Теги',
    content: 'Markdown-содержимое',
    placeholders: 'Переменные: {{title}}, {{date}}, {{shortDate}}, {{time}}.',
    createTemplate: 'Создать шаблон',
    saveChanges: 'Сохранить',
    myTemplates: 'Мои шаблоны',
    myTemplatesHint: 'Они показываются перед библиотечными шаблонами при создании заметки.',
    noCustomTemplates: 'Пользовательских шаблонов пока нет.',
    noDescription: 'Без описания',
    libraryTitle: 'Библиотечные шаблоны',
    libraryHint: 'Скрытые шаблоны не будут появляться в создании заметки из шаблона.',
    searchPlaceholder: 'Поиск шаблонов...',
    hide: 'Скрыть шаблон',
    show: 'Показать шаблон',
    edit: 'Редактировать шаблон',
    delete: 'Удалить шаблон',
    deleteConfirm(name) {
      return `Удалить пользовательский шаблон ${name}?`;
    },
  },
  settings: {
    title: 'Настройки',
    hint: 'Настройте интерфейс, редактор, синхронизацию, шаблоны и резервные копии.',
    back: 'Назад',
    language: 'Язык',
    interfaceLanguage: 'Язык интерфейса',
    theme: 'Тема',
    themeMode: 'Режим темы',
    themeModeSystem: 'Система',
    themeModeLight: 'Светлая',
    themeModeDark: 'Тёмная',
    colorTheme: 'Цветовая тема',
    typography: 'Типографика',
    font: 'Шрифт',
    size: 'Размер',
    editor: 'Редактор',
    defaultMode: 'Режим по умолчанию',
    fontSize: 'Размер шрифта',
    backup: 'Резервная копия',
    backupHint: 'Экспортируйте все заметки в ZIP или импортируйте ZIP, чтобы объединить заметки с текущим деревом.',
    exportTitle: 'Экспорт заметок',
    exportNotes: 'Скачать ZIP',
    exporting: 'Экспорт...',
    exportComplete: 'ZIP-архив готов.',
    exportFailed: 'Не удалось экспортировать',
    importTitle: 'Импорт заметок',
    chooseArchive: 'Выбрать ZIP',
    noArchiveSelected: 'Архив не выбран',
    importing: 'Импорт...',
    importFailed: 'Не удалось импортировать',
    importComplete(summary = {}) {
      const notes = Number(summary.importedNotes || 0);
      const files = Number(summary.importedFiles || 0);
      const renamed = Number(summary.renamed || 0);
      const noteWord = notes === 1 ? 'заметка' : notes > 1 && notes < 5 ? 'заметки' : 'заметок';
      const fileWord = files === 1 ? 'файл' : files > 1 && files < 5 ? 'файла' : 'файлов';
      const suffix = renamed ? ` ${renamed} переименовано, чтобы не перезаписать существующие.` : '';
      return `Импортировано: ${notes} ${noteWord} (${files} ${fileWord}).${suffix}`;
    },
    backupError(message) {
      return `Ошибка резервной копии: ${message}`;
    },
    githubConnection: 'Подключение GitHub',
    tokenHelp: 'Как получить токен?',
    tokenHelpUrl: 'github.com/settings/tokens',
    tokenHelpSteps: [
      '1. Перейдите на',
      '2. Нажмите Generate new token -> Fine-grained token',
      '3. В Repository access выберите Only select repositories и укажите репозиторий заметок',
      '4. В Permissions -> Contents выберите Read and write',
      '5. Нажмите Generate token и скопируйте токен',
    ],
    tokenHelpNote: 'Токену нужно право Contents: Read and write, чтобы синхронизировать заметки через GitHub API.',
    personalAccessToken: 'Personal Access Token',
    tokenPlaceholder: 'ghp_...',
    reset: 'Сбросить',
    authenticate: 'Авторизоваться',
    connecting: 'Подключение...',
    invalidToken: 'Некорректный токен',
    failedToFetchRepos: 'Не удалось получить репозитории',
    owner: 'Владелец',
    repository: 'Репозиторий',
    select: 'Выберите...',
    loading: 'Загрузка...',
    branch: 'Ветка',
    deviceName: 'Имя устройства',
    devicePlaceholder: 'Мой ноутбук',
    connectRepository: 'Подключить репозиторий',
    syncSettings: 'Настройки синхронизации',
    autoSyncInterval: 'Автосинхронизация (мин)',
    autoSyncHint: '0 = выключено',
    commitMessage: 'Сообщение коммита',
    autoFormatOnSave: 'Автоформатирование при сохранении',
    statusAndSync: 'Статус и синхронизация',
    checking: 'Проверка...',
    clean: 'чисто',
    dirty: 'есть изменения',
    conflict: 'конфликт',
    ahead(count) {
      return `↑ на ${count} впереди remote`;
    },
    behind(count) {
      return `↓ на ${count} позади remote — рекомендуется pull`;
    },
    lastSync(value) {
      return `Последняя синхронизация: ${value}`;
    },
    syncNow: 'Синхронизировать',
    syncing: 'Синхронизация...',
    notInitialized: 'Не настроено. Авторизуйтесь и выберите репозиторий выше.',
    loadingStatus: 'Загрузка статуса...',
    refreshStatus: 'Обновить статус',
    viewConflicts: 'Показать конфликты',
    conflicts(count) {
      return `Конфликты (${count})`;
    },
    markResolved: 'Отметить решёнными (удалить _conflicts/)',
    resolveConflicts: 'Разрешить конфликты',
    conflictOurs: 'Наши (Локальные)',
    conflictTheirs: 'Их (Удалённые)',
    keepLocal: 'Оставить локальные',
    keepRemote: 'Оставить удалённые',
    conflictsRemaining(count) {
      const form = count === 1 ? 'конфликт' : count > 1 && count < 5 ? 'конфликта' : 'конфликтов';
      return `Осталось ${count} ${form}`;
    },
    chooseConflictVersion: 'Выберите локальную или удалённую версию, чтобы разрешить конфликт.',
    empty: '(пусто)',
    saveBeforeSync: 'Сохраните текущую заметку перед синхронизацией.',
    waitForSaveBeforeSync: 'Дождитесь сохранения текущей заметки перед синхронизацией.',
    defaultCommitMessage: 'Sync from Monos WebUI',
  },
  editor: {
    formatAllNotes: 'Форматировать все заметки',
    deleteNote: 'Удалить заметку',
    gatheringThoughts: 'Собираем мысли',
    beginWriting: 'Начните писать...',
    archiveTitle: 'Переместить заметку в корзину?',
    archiveConfirm(name) {
      return `${name} исчезнет из заметок, поиска и дерева. Её можно будет восстановить из корзины.`;
    },
    cancel: 'Отмена',
    archiving: 'Перемещение...',
    deletePermanently: 'В корзину',
    formatFailed: 'Не удалось отформатировать',
    saving: 'Сохранение…',
    saved: 'Сохранено',
    saveFailed: 'Не удалось сохранить',
    noteNotFound(target) {
      return `Заметка "${target}" не найдена.`;
    },
    deleteError(message) {
      return `Ошибка при удалении: ${message}`;
    },
    localNavigation: 'Связанные',
    imageUploadFailed: 'Не удалось загрузить изображение',
    imageRenameFailed: 'Не удалось переименовать изображение',
    renameImageTitle: 'Переименовать изображение',
    renameImageHint: 'Файл будет переименован на диске, а Markdown-ссылка в этой заметке обновится.',
    renameImage: 'Переименовать',
      noteColor: 'Цвет заметки',
      noColor: 'Нет',
  },
  editorHeader: {
    noteTitle: 'Заголовок заметки',
    created: 'Создано',
    modified: 'Изменено',
    tagPlaceholder: '+ тег',
    revealInTree: 'Показать в дереве',
  },
  sourceEditor: {
    beginWriting: 'Начните писать...',
    linkedMentions: 'Связанные заметки',
    backlink: 'Обратная ссылка',
    mention: 'Упоминание',
    wikiSuggestions: 'Подсказки заметок',
    resizeContent: 'Изменить ширину source-контента',
  },
  richEditor: {
    beginWriting: 'Начните писать...',
    toolbar: 'Панель редактора',
    undo: 'Отменить (Ctrl+Z)',
    redo: 'Повторить (Ctrl+Shift+Z)',
    bold: 'Жирный (Ctrl+B)',
    italic: 'Курсив (Ctrl+I)',
    strikethrough: 'Зачёркнутый',
    inlineCode: 'Код в строке (Ctrl+E)',
    heading1: 'Заголовок 1',
    heading2: 'Заголовок 2',
    heading3: 'Заголовок 3',
    heading4: 'Заголовок 4',
    bulletList: 'Маркированный список',
    numberedList: 'Нумерованный список',
    checklist: 'Чеклист',
    blockquote: 'Цитата',
    codeBlock: 'Блок кода',
    horizontalRule: 'Горизонтальная линия',
    insertTable: 'Вставить таблицу',
    addLink: 'Добавить ссылку',
    contentWidth: 'Ширина контента',
    lineHeight: 'Межстрочный интервал',
    fontSize: 'Размер шрифта',
    linkPrompt: 'URL:',
    imagePrompt: 'URL изображения:',
    slashMenuLabel: 'Slash-команды',
    slashHint: 'Введите / для команд',
    slashCommands: {
      heading1: 'Заголовок 1',
      heading2: 'Заголовок 2',
      bulletList: 'Маркированный список',
      numberedList: 'Нумерованный список',
      checklist: 'Чеклист',
      blockquote: 'Цитата',
      codeBlock: 'Блок кода',
      table: 'Таблица',
      horizontalRule: 'Разделитель',
    },
  },
  browser: {
    browseFiles: 'Просмотр файлов',
    searchFiles: 'Искать файлы...',
    createNewNote: 'Создать заметку',
    newNote: 'Новая заметка',
    loadingFiles: 'Загрузка файлов...',
    noFilesFound: 'Файлы не найдены',
    createYourFirstNote: 'Создать первую заметку',
    createNewNoteTitle: 'Создать новую заметку',
    title: 'Заголовок *',
    titlePlaceholder: 'Введите заголовок заметки...',
    category: 'Категория *',
    categoryPlaceholder: 'например, Образование, Работа, Документы...',
    cancel: 'Отмена',
    create: 'Создать',
    fillAllFields: 'Заполните все поля',
    failedToCreateNote(message) {
      return `Не удалось создать заметку: ${message}`;
    },
    failedToLoadTree(message) {
      return `Не удалось загрузить дерево: ${message}`;
    },
  },
  modal: {
    close: 'Закрыть окно',
    closeBackdrop: 'Закрыть окно по фону',
  },
};

export const translations = {
  en: enText,
  ru: ruText,
};

export const uiText = enText;

export const localizedText = derived(locale, ($locale) => translations[$locale] || enText);
