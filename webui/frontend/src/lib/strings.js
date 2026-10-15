import { derived, writable } from 'svelte/store';

export const localeOptions = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
];

export const defaultLocale = 'en';

export function isSupportedLocale(value) {
  return localeOptions.some(option => option.value === value);
}

/**
 * The language a person starts with, before they choose one: the first Russian language the system
 * reports, otherwise English. A choice saved in Settings always comes first (see getInitialLocale).
 */
export function localeFromLanguages(languages = []) {
  const reportsRussian = languages.some((language) => /^ru(-|_|$)/i.test(String(language)));
  return reportsRussian ? 'ru' : defaultLocale;
}

function getInitialLocale() {
  const saved = globalThis.localStorage?.getItem('locale');
  if (isSupportedLocale(saved)) return saved;
  const navigatorLanguages = globalThis.navigator?.languages || [globalThis.navigator?.language].filter(Boolean);
  return localeFromLanguages(navigatorLanguages);
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
  lock: {
    title: 'Lock',
    lockedTitle: 'This note is locked',
    lockedHint: 'Enter the passphrase to open it for this session. Until then nothing of the note is shown.',
    passphrase: 'Passphrase',
    repeatPassphrase: 'Repeat the passphrase',
    unlock: 'Unlock',
    wrongPassphrase: 'The passphrase is wrong',
    unlockFailed: 'Could not unlock the note',
    lockHint: 'Seals the note with a passphrase. Without the passphrase the note cannot be opened again.',
    lockButton: 'Lock note',
    passphraseRequired: 'Enter a passphrase',
    passphraseMismatch: 'The passphrases do not match',
    openForSession: 'Open for this session. A restart asks for the passphrase again.',
    relock: 'Lock now',
    removeLock: 'Remove the lock',
    removeLockHint: 'The note is written back as plain text.',
    actionFailed: 'The change did not go through',
  },
  properties: {
    title: 'Properties',
    empty: 'No properties yet. Add one below.',
    name: 'Name',
    type: 'Type',
    value: 'Value',
    add: 'Add property',
    remove: 'Remove {name}',
    invalidName: 'Use letters, digits, spaces, dashes or underscores. The names of the app’s own fields are reserved.',
    invalidValue: 'This value does not fit the type {type}',
    saveFailed: 'Could not save the property',
    typeNames: { text: 'Text', number: 'Number', date: 'Date', checkbox: 'Checkbox', list: 'List' },
    tableTitle: 'Properties',
    tableSearch: 'Search, e.g. prop:status=done',
    columns: 'Columns',
    noteColumn: 'Note',
    modified: 'Modified',
    yes: 'Yes',
    no: 'No',
    emptyTable: 'No notes match this filter.',
    noProperties: 'No note has a custom property yet.',
    sidebar: 'Properties',
    syntaxHint: 'prop:name (has it), prop:name=value, prop:priority>=3, prop:due<2026-12-01; exclude with -prop:name=value.',
    loading: 'Loading properties…',
    loadFailed: 'Could not load the properties',
  },
  app: {
    closeSidebar: 'Close sidebar',
    linksUpdated(count) {
      return `Links updated: ${count}`;
    },
    linksNotUpdated(count) {
      return `Notes not updated: ${count}`;
    },
    closeMenu: 'Close menu',
    resizeSidebar: 'Resize sidebar',
    emptyDesktop: 'Your notes are plain Markdown files on your own disk — not rows in someone\'s database. Monos is just a comfortable way to read, write and find them.',
    emptyMobile: 'Your notes are plain Markdown files on your own disk. Open the menu to pick one or start writing.',
    tips: {
      search: 'Find any note or command',
      links: 'Link notes by typing [[ and a note name',
      commands: 'Type / in a note for headings, lists and inserts',
    },
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
      importNotes: 'Import notes',
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
      loadFailed: 'Your notes could not be loaded.',
      loadFailedHint: 'Your files are still on disk. This is only a display problem.',
      retry: 'Try again',
      filter: 'Search notes',
      filterPlaceholder: 'Search notes...',
      columnsShort: 'cols',
      opened: 'Opened',
      modified: 'Modified',
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
  tags: {
    title: 'Tags',
    filter: 'Filter tags',
    loading: 'Loading tags',
    empty: 'No tags yet',
    emptyFiltered: 'Nothing matches',
    save: 'Rename',
    cancel: 'Cancel',
    rename(tag) {
      return `Rename tag ${tag}`;
    },
    drop(tag) {
      return `Remove tag ${tag} from all notes`;
    },
    dropConfirmTitle: 'Remove tag',
    dropConfirm(tag, count) {
      return `Remove #${tag} from ${count} note${count === 1 ? '' : 's'}? Their files will change.`;
    },
    dropConfirmAction: 'Remove tag',
  },
  savedSearches: {
    title: 'Saved searches',
    saveCurrent: 'Save the current search',
    queryPlaceholder: 'Type something in the search box first',
    namePlaceholder: 'Name',
    save: 'Save',
    renameHint: 'Rename',
    remove(name) {
      return `Delete saved search ${name}`;
    },
    rename(name) {
      return `Rename saved search ${name}`;
    },
    nothingToSave: 'Type a query in the search box first',
    empty: 'No saved searches yet',
  },
  header: {
    search: 'Search',
    searchHint: 'Search. Operators: body:word — inside the note, path:folder — inside a folder, tag:word — by tag, updated:2026-10 — changed since, -word — exclude. Values with spaces go in quotes.',
    closeSearch: 'Close search',
    toggleSidebar: 'Toggle Sidebar',
    quickNote: 'Quick note',
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
    noResultsHint: 'Try other words, or check the search operators in Settings.',
    clear: 'Clear search',
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
      continueWork: 'Continue working',
      openSettings: 'Open settings',
      toggleSidebar: 'Toggle sidebar',
      newNote: 'New note',
      openTemplates: 'Open templates',
      openTags: 'Open tags',
      openTrash: 'Open trash',
      toggleTheme: 'Toggle theme',
    },
    commandDetails: {
      quickOpen: 'Switch to note-only search',
      continueWork: 'Return to a note you opened recently',
      openSettings: 'Go to the settings screen',
      toggleSidebar: 'Show or hide the knowledge tree',
      newNote: 'Create a note with a title',
      openTemplates: 'Manage the note templates',
      openTags: 'See the tags and rename or remove them',
      openTrash: 'Restore or empty deleted notes',
      toggleTheme: 'Switch between light and dark mode',
    },
  },
  sidebar: {
    untitledNote: 'Untitled',
    close: 'Close sidebar',
    delete: 'Delete',
    mobileNavigation: 'Navigation',
    pinned: 'Pinned',
    recentThoughts: 'Recently Opened',
    knowledgeTree: 'Notes',
    new: '+ New',
    today: 'Today',
    templates: 'Templates',
    templatesHint: 'Notes from proven patterns',
    templateLibrary: 'Templates',
    templateLibrarySubtitle: 'Pick a starting structure for your note — fields and sections come from the template.',
    templateSearch: 'Search templates',
    templateSearchPlaceholder: 'meeting, project, research...',
    templateFolder: 'Folder',
    templateNewFolder(name) {
      return `New folder "${name}" will be created with the note.`;
    },
    nameProblem(problem) {
      switch (problem) {
        case 'empty': return 'Enter a name.';
        case 'forbidden-characters': return 'These characters are not allowed in names: < > : " / \\ | ? *';
        case 'edge-dot-or-space': return 'A name cannot end with a dot or a space.';
        case 'reserved': return 'This name is reserved by the system.';
        case 'too-long': return 'This name is too long.';
        default: return '';
      }
    },
    templatePreview: 'Preview',
    templatePreviewEmpty: 'No template selected',
    templatePreviewEmptyHint: 'Choose a template on the left to see how your note will look.',
    noTemplates: 'No templates found',
    useTemplate: 'Create from template',
    loading: 'Loading',
    empty: 'Empty',
    notes(count) {
      return `${count} ${count === 1 ? 'Note' : 'Notes'}`;
    },
    selectedNotes(count) {
      return `${count} selected`;
    },
    dropToRoot: 'Drop to root',
    syncWithGit: 'Back up notes',
    conflictsWaiting: 'Conflicts need review in Settings',
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
      deleteSelected: 'Delete Selected',
    },
    modals: {
      renameTitle(kind) {
        return `Rename ${kind}`;
      },
      tagSelectedTitle(count) {
        return `Tag ${count} selected notes`;
      },
      tagHint: 'The tag is added to every selected note. Everything else in the note stays as it is.',
      tagPlaceholder: 'Tag name',
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
      folderPlaceholder: 'New Folder',
      creating: 'Creating...',
      create: 'Create',
      newNote: 'New Note',
      createStart: 'Start from',
      openExisting: 'Open the existing note',
      createNumbered(name) {
        return `Create as ${name}`;
      },
      blankNote: 'Start from a blank page',
      blankNoteHint: 'For a thought that needs room',
      todayNote: 'Daily note',
      todayNoteHint: 'Create a note with the current date and time',
      fromTemplate: 'Note from template',
      fromTemplateHint: 'Create a note from a selected template',
      title: 'Title',
      titleHint: 'Optional. Without a name the note is called Untitled, and you can rename it later.',
      noteTitlePlaceholder: 'Name (optional)...',
      quickNoteSaved: 'Quick note saved',
      quickNoteSavedHint: 'The clipboard content was saved to Quick Notes. Adjust the name and open it, or stay here.',
      openNote: 'Open',
      stayHere: 'Stay here',
      quickNoteWillRenameTo: (target) => `Will rename to ${target}`,
      quickNoteNotCreated: 'Quick note was not created',
      quickNoteClipboardEmptyHint: 'Clipboard is empty or does not contain text or an image. Copy something first, then try again.',
      quickNoteClipboardUnavailableHint: 'The browser did not allow Monos to read the clipboard. Copy text or an image again, or allow clipboard access, then try again.',
      understood: 'Got it',
    },
    errors: {
      move(message) {
        return `Failed to move: ${message}`;
      },
      loadTree(message) {
        return `Failed to load tree: ${message}`;
      },
      createFolder(message) {
        return `Failed to create folder: ${message}`;
      },
      createNote(message) {
        return `Failed to create note: ${message}`;
      },
      duplicateNote: 'A note with this name already exists in this folder. Choose another name.',
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
    confirmDeleteMany(count) {
      return `Move ${count} selected notes to trash?`;
    },
  },
  trash: {
    loadFailed: 'Could not load the trash.',
    restoreFailed: 'Could not restore the note.',
    deleteFailed: 'Could not delete the note.',
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
    tagsPlaceholder: 'project, idea',
    content: 'Markdown content',
    placeholders: 'Variables: {{title}}, {{date}}, {{shortDate}}, {{time}}.',
    createTemplate: 'Create template',
    createTemplateHint: 'Give the template a title first.',
    saveChanges: 'Save changes',
    myTemplates: 'My Templates',
    myTemplatesHint: 'These appear before the built-in templates when creating a note.',
    noCustomTemplates: 'No custom templates yet.',
    emptyItem: '— empty',
    noDescription: 'No description',
    libraryTitle: 'Library Templates',
    libraryHint: 'Hidden library templates will not appear in the create-from-template flow.',
    searchPlaceholder: 'Search templates...',
    hide: 'Hide template',
    show: 'Show template',
    createNote: 'Create note',
    edit: 'Edit template',
    delete: 'Delete template',
    deleteConfirm(name) {
      return `Delete custom template ${name}?`;
    },
  },
  optionLabels: {
    fontSize: {
      small: 'Small',
      medium: 'Medium',
      large: 'Large',
      xlarge: 'Extra Large',
      xs: 'XS',
      sm: 'Sm',
      md: 'Md',
      lg: 'Lg',
      xl: 'XL',
    },
    fontCategory: {
      mono: 'mono',
      sans: 'sans',
      serif: 'serif',
    },
    lineHeight: {
      compact: 'Compact',
      cozy: 'Cozy',
      normal: 'Normal',
      spaced: 'Spaced',
      relaxed: 'Relaxed',
    },
    contentWidth: {
      narrow: 'Narrow',
      snug: 'Snug',
      medium: 'Medium',
      broad: 'Broad',
      wide: 'Wide',
    },
  },
  settings: {
    title: 'Settings',
    hint: 'Adjust the interface, editor, sync, templates, and backup behavior.',
    back: 'Back',
    version: 'Version',
    language: 'Language',
    interfaceLanguage: 'Interface Language',
    theme: 'Theme',
    themeMode: 'Theme mode',
    resetGitTitle: 'Sign out of GitHub',
    resetGitMessage: 'The saved token and repository choice are removed from this app. You can sign in again at any time.',
    resetGitAction: 'Sign out',
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
    printReady: 'PDF saved where you chose.',
    exportComplete: 'ZIP export is ready.',
    exportFailed: 'Export failed',
    importTitle: 'Import notes',
    attachmentsFound: '{count} unused, {size} taken by ZIP exports',
    attachmentsTitle: 'Attachments',
    attachmentsLoading: 'Looking for unused attachments…',
    attachmentsError: 'Could not read the attachment list',
    attachmentsClean: 'Every attachment is referenced by a note',
    attachmentsLocked: 'Some notes are locked, so the pictures they show cannot be checked. Unlock them to see the unused pictures.',
    publishTitle: 'Publish as a website',
    publishHint: 'Writes the notes to a folder on this computer as plain web pages. Nothing is uploaded.',
    publishFolder: 'Folder on this computer',
    publishFolderHint: 'The site goes into a monos-site folder inside it. A folder that already holds something else is left alone.',
    publishButton: 'Publish',
    publishing: 'Writing the site…',
    publishedTo: 'Published {pages} notes to {path}',
    publishFailed: 'Could not publish the site',
    lanTitle: 'Phone and other devices',
    lanHint: 'Open Monos on a phone or another computer on the same Wi-Fi. The notes stay on this computer; a device gets in with a link that carries an access token.',
    lanToggle: 'Allow access from other devices',
    lanUrlsTitle: 'Open one of these addresses on the device',
    lanCopy: 'Copy',
    lanCopied: 'Link copied',
    lanCopyFailed: 'Could not copy: select the link and copy it yourself',
    lanNoNetwork: 'No network address found. Connect this computer to a network and turn access on again.',
    lanRestart: 'Restart Monos for the change to take effect.',
    lanRenew: 'New token',
    lanRenewTitle: 'Make a new token?',
    lanRenewMessage: 'Devices that already opened Monos lose access and need the new link.',
    lanRenewAction: 'Make token',
    lanRemoteOnly: 'Access settings can be changed only on this computer.',
    lanLoadFailed: 'Could not read the access settings',
    lanFailed: 'Could not change access from other devices',
    lanSecurity: 'While Monos runs, anyone with a link can open the notes, and the connection is not encrypted. Turn access on only in your own network, and send the link only to your own devices.',
    storageTitle: 'Notes folder',
    storageHint: 'Notes are read from this folder. Choose a folder that already holds your notes, such as an Obsidian vault or a folder a cloud service syncs. Monos moves nothing: the notes in the old folder stay where they are.',
    storageChoose: 'Choose folder…',
    storageReset: 'Use the default folder',
    storageRestart: 'Restart Monos to open {folder}.',
    storageUnavailable: 'The folder {folder} is not available, so Monos opens the default folder for now. Reconnect it and restart Monos.',
    storageInAppOnly: 'The folder can be chosen in the Monos app.',
    storageInvalid: 'Choose an existing folder outside the Monos data folder.',
    storageFailed: 'Could not choose the folder',
    storageRemoteOnly: 'The notes folder can be changed only on this computer.',
    conflictCopies: 'Conflict copies',
    conflictCopyOf: 'Conflict copy of {original}',
    conflictSameText: 'Same text as {original}',
    conflictTrash: 'Move to trash',
    conflictTrashTitle: 'Move this copy to the trash?',
    conflictTrashMessage: 'The copy can be restored from the trash, and {original} stays as it is. A copy with different text may hold edits you want, so open it first.',
    conflictTrashAction: 'Move to trash',
    conflictTrashFailed: 'Could not move the copy to the trash',
    connectionsTitle: 'Links and notes',
    connectionsLoading: 'Checking links…',
    connectionsError: 'Could not check links and notes',
    connectionsClean: 'No broken links, unlinked or stale notes',
    brokenLinks: 'Broken links',
    brokenLinkFrom: 'in {note}',
    orphanNotes: 'Notes without links',
    staleNotes: 'Not opened or edited for {days} days',
    staleSince: 'Last activity {date}',
    moreItems: 'and {count} more',
    chooseArchive: 'Choose ZIP',
    printAllNotes: 'Print all notes as one PDF',
    noArchiveSelected: 'No archive selected',
    clipper: 'Web clipper',
    clipperHint: 'A browser extension sends the page or your selection straight into a note. Copy the token into the extension.',
    clipperShowToken: 'Show token',
    clipperEndpoint: 'App address',
    clipperTokenLabel: 'Token',
    clipperError(message) {
      return `Could not read the clipper token: ${message}`;
    },
    documentation: 'Documentation',
    documentationHint: 'Everything below is available at any time — nothing here is a one-time tour.',
    docsGettingStarted: 'Getting started',
    docsStepNew: 'Write a note',
    docsStepNewHint: 'Creates one Markdown file in your notes folder.',
    docsStepImport: 'Bring notes from elsewhere',
    docsStepImportHint: 'Import a ZIP of .md files. Your files stay .md afterwards.',
    docsStepBackup: 'Keep a copy',
    docsStepBackupHint: 'Export a ZIP at any time, or connect Git for versioned backup.',
    docsKeyboard: 'Keyboard',
    docsNotesLive: 'Where your notes live',
    docsNotesLiveHint: 'Ordinary files. Open the folder in Finder or Explorer, or read them in any text editor — they stay readable without Monos.',
    docsFileFormat: 'File format',
    docsFrontmatter: 'Frontmatter at the top of each note carries title, tags, and dates.',
    docsWikiLinks: 'Typing [[ and a note name links to it; the note lists what links back.',
    docsShortcutCommands: 'Command palette',
    docsShortcutOpen: 'Open a note by name',
    docsShortcutSidebar: 'Show or hide the sidebar',
    docsShortcutSearch: 'Search',
    docsShortcutSave: 'Save the current note',
    docsOperators: 'Search operators',
    docsOperatorsHint: 'Type these in the note switcher (Ctrl+O), alone or combined with words.',
    docsOpTag: 'tag:work',
    docsOpTagHint: 'Notes carrying the tag',
    docsOpFolder: 'folder:base',
    docsOpFolderHint: 'Notes inside that folder',
    docsOpPath: 'path:llm',
    docsOpPathHint: 'Notes whose path contains that text',
    docsOpTitle: 'title:Review',
    docsOpTitleHint: 'Notes whose title contains that text',
    docsOpCreated: 'created:2026-10',
    docsOpCreatedHint: 'Notes created in that month',
    docsOpNegation: '-tag:archive',
    docsOpNegationHint: 'Exclude anything matching',
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
    publicRepoTitle: 'This repository is public',
    publicRepoHint: 'Notes pushed there become public text, and stay in the git history even after you delete them. Prefer a private repository.',
    tokenScopeTitle: 'This token has more access than Monos needs',
    tokenScopeHint: 'A fine-grained token limited to just this repository is enough. Anything wider also works, but a leaked token then reaches further than your notes.',
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
    defaultCommitMessage: 'Sync notes from Monos',
  },
  editor: {
    pinDo: 'Pin',
    pinUnpin: 'Unpin',
    propertyCategory: 'Category',
    propertyCategoryEmpty: 'Add category',
    categorySuggestions: 'Category suggestions',
    propertiesToggle: 'Properties',
    tagRemove(tag) {
      return `Remove tag ${tag}`;
    },
    dueFormat: 'YYYY-MM-DD',
    dueInvalid: 'Not a date. Use 2026-12-24 or 24.12.2026.',
    moreActions: 'More actions',
    exportLabel: 'Export',
    exportMarkdown: 'Markdown',
    exportHtml: 'HTML',
    exportText: 'Plain text',
    exportPdf: 'PDF',
    propertyTags: 'Tags',
    propertyTagsEmpty: 'project, idea',
    propertyDue: 'Due date',
    gatheringThoughts: 'Gathering Thoughts',
    beginWriting: 'Begin writing...',
    archiveTitle: 'Move this note to trash?',
    archiveConfirm(name) {
      return `${name} will disappear from notes, search, and the tree. You can restore it from Trash.`;
    },
    cancel: 'Cancel',
    archiving: 'Moving...',
    moveToTrash: 'Move to trash',
    saving: 'Saving…',
    saved: 'Saved',
    saveFailed: 'Save failed',
    retry: 'Retry',
    noteNotFound(target) {
      return `Note "${target}" not found.`;
    },
    conflictResolveHint: 'Pick a side for each conflicting part, then apply. Everything outside them stays untouched.',
    conflictKeepOurs: 'Keep mine',
    conflictKeepTheirs: 'Keep theirs',
    conflictKeepBoth: 'Keep both',
    conflictKeepAllOurs: 'Keep mine everywhere',
    conflictKeepAllTheirs: 'Keep theirs everywhere',
    conflictApply: 'Apply',
    conflictRegionLabel: 'Conflicting part',
    conflictResolved: 'Conflict resolved in this note.',
    conflictSaving: 'Applying your choice…',
    conflictRegion(index, total) {
      return total === 1 ? 'Conflicting part' : `Conflicting part ${index} of ${total}`;
    },
    conflictBase: 'Original (both started here)',
    conflictOurs: 'This device',
    conflictTheirs: 'Other device',
    conflictTitle: 'This note has an unresolved sync conflict',
    conflictHint: 'It is read-only on purpose: opening it in the editor would rewrite the merge markers and damage the note. Resolve the conflict in Settings, then reopen.',
    conflictCount(count) {
      return `${count} conflict${count === 1 ? '' : 's'} in this note`;
    },
    deleteError(message) {
      return `Could not move the note to trash: ${message}`;
    },
    localNavigation: 'Related',
    unlinkedMentions: 'Unlinked mentions',
    linkMention: 'Link',
    mentionOf: 'mentions “{phrase}”',
    localGraph: 'Local graph',
    linkMentionFailed: 'Could not link the mention',
    outline: 'Outline',
    outlineEmpty: 'No headings yet',
    closeOutline: 'Close outline',
    hideOutline: 'Hide outline',
    showOutline: 'Show outline',
    imageUploadFailed: 'Image upload failed',
    attachmentUploadFailed: 'Could not attach the file',
    imageRenameFailed: 'Image rename failed',
    renameImageTitle: 'Rename image',
    renameImageHint: 'The file will be renamed on disk and the Markdown link in this note will be updated.',
    renameImage: 'Rename',
    focusOn: 'Focus mode',
    focusOff: 'Leave focus mode',
    rawMode: 'Markdown source',
    richMode: 'Rich editor',
    due: 'Due date',
    dueClear: 'Clear due date',
    dueToday: 'today',
    dueTomorrow: 'tomorrow',
    dueOverdue(days) {
      return `${days} ${days === 1 ? 'day' : 'days'} overdue`;
    },
    dueInDays(days) {
      return `in ${days} ${days === 1 ? 'day' : 'days'}`;
    },
    noteColor: 'Note color',
    noColor: 'No',
  },
  history: {
    title: 'Note history',
    loading: 'Reading history…',
    notSynced: 'This note is not in a git repository yet, so there is no history to show. Sync once and its versions will appear here.',
    empty: 'No earlier versions recorded.',
    pickRevision: 'Pick a version on the left to see what changed.',
    diffTitle: 'Differences against the current note',
    restore: 'Restore this version',
    restoring: 'Restoring…',
    unchanged: 'This is the version the note already has.',
    noMessage: '(no message)',
  },
  editorHeader: {
    noteTitle: 'Note Title',
    created: 'Created',
    modified: 'Modified',
    stats: {
      words(count) {
        return `${count} ${count === 1 ? 'word' : 'words'}`;
      },
      readingMinutes(count) {
        return `${count} min read`;
      },
      empty: 'No words yet',
    },
    taskProgress: {
      label(done, total) {
        return `${done}/${total}`;
      },
      percent(value) {
        return `${value}%`;
      },
      complete: 'All tasks done',
    },
    tagPlaceholder: '+ tag',
    revealInTree: 'Reveal in tree',
    historyButton: 'History',
    print: 'Print',
  },
  sourceEditor: {
    beginWriting: 'Begin writing...',
    linkedMentions: 'Linked notes',
    backlink: 'Backlink',
    mention: 'Mention',
    wikiSuggestions: 'Note suggestions',
    duplicateNameShort: 'duplicate',
    duplicateName: 'Another note has this name — the link will be ambiguous',
    resizeContent: 'Resize source content',
  },
  richEditor: {
    bodyLabel: 'Note text',
    more: 'More tools',
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
    insertLink: 'Insert link',
    insertImage: 'Insert image',
    imagePrompt: 'Image URL:',
    slashMenuLabel: 'Slash commands',
    slashHint: 'Type / for commands',
    pdfOpen: 'Open PDF',
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
  fileInfo: {
    identifier: 'Identifier',
    dimensions: 'Dimensions',
    nature: 'Nature',
    collection: 'Collection',
    thought: 'Thought',
    conceived: 'Conceived',
    refined: 'Refined',
    connections: 'Connections',
    awaitingFocus: 'Awaiting Focus',
    unknown: 'Unknown',
  },
  modal: {
    close: 'Close modal',
    closeBackdrop: 'Close modal by clicking backdrop',
    confirm: 'Confirm',
    cancel: 'Cancel',
    promptLabel: 'Value',
  },
};

const ruText = {
  lock: {
    title: 'Блокировка',
    lockedTitle: 'Заметка заблокирована',
    lockedHint: 'Введите парольную фразу, чтобы открыть заметку на этот сеанс. До этого текст заметки не показывается.',
    passphrase: 'Парольная фраза',
    repeatPassphrase: 'Повторите парольную фразу',
    unlock: 'Открыть',
    wrongPassphrase: 'Парольная фраза неверна',
    unlockFailed: 'Не удалось открыть заметку',
    lockHint: 'Запечатывает заметку парольной фразой. Без неё заметку больше не открыть.',
    lockButton: 'Заблокировать заметку',
    passphraseRequired: 'Введите парольную фразу',
    passphraseMismatch: 'Парольные фразы не совпадают',
    openForSession: 'Открыта на этот сеанс. После перезапуска приложение снова спросит парольную фразу.',
    relock: 'Закрыть сейчас',
    removeLock: 'Снять блокировку',
    removeLockHint: 'Заметка вернётся в обычный текст.',
    actionFailed: 'Изменение не сохранилось',
  },
  properties: {
    title: 'Свойства',
    empty: 'Свойств пока нет. Добавьте свойство ниже.',
    name: 'Имя',
    type: 'Тип',
    value: 'Значение',
    add: 'Добавить свойство',
    remove: 'Удалить {name}',
    invalidName: 'Допустимы буквы, цифры, пробелы, дефис и подчёркивание. Имена собственных полей приложения занять нельзя.',
    invalidValue: 'Значение не подходит к типу «{type}»',
    saveFailed: 'Не удалось сохранить свойство',
    typeNames: { text: 'Текст', number: 'Число', date: 'Дата', checkbox: 'Флажок', list: 'Список' },
    tableTitle: 'Свойства',
    tableSearch: 'Поиск, например prop:status=done',
    columns: 'Колонки',
    noteColumn: 'Заметка',
    modified: 'Изменена',
    yes: 'Да',
    no: 'Нет',
    emptyTable: 'Нет заметок по этому фильтру.',
    noProperties: 'Ни у одной заметки пока нет своих свойств.',
    sidebar: 'Свойства',
    syntaxHint: 'prop:имя (есть), prop:имя=значение, prop:priority>=3, prop:due<2026-12-01; исключить: -prop:имя=значение.',
    loading: 'Загружаю свойства…',
    loadFailed: 'Не удалось загрузить свойства',
  },
  app: {
    closeSidebar: 'Закрыть боковую панель',
    linksUpdated(count) {
      return `Ссылок обновлено: ${count}`;
    },
    linksNotUpdated(count) {
      return `Заметок не обновлено: ${count}`;
    },
    closeMenu: 'Закрыть меню',
    resizeSidebar: 'Изменить ширину сайдбара',
    emptyDesktop: 'Ваши заметки — обычные файлы Markdown на вашем диске, а не строки в чужой базе. Monos просто удобный способ их читать, писать и находить.',
    emptyMobile: 'Ваши заметки — обычные файлы Markdown на вашем диске. Откройте меню, чтобы выбрать или начать писать.',
    tips: {
      search: 'Найти любую заметку или команду',
      links: 'Связать заметки: введите [[ и название заметки',
      commands: 'Введите / в заметке, чтобы вставить заголовок, список или блок',
    },
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
      importNotes: 'Импорт заметок',
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
      loadFailed: 'Не удалось загрузить заметки.',
      loadFailedHint: 'Файлы на диске в порядке. Это только проблема отображения.',
      retry: 'Повторить',
      filter: 'Поиск по заметкам',
      filterPlaceholder: 'Искать заметки...',
      columnsShort: 'кол.',
      opened: 'Открыта',
      modified: 'Изменена',
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
  tags: {
    title: 'Теги',
    filter: 'Фильтр тегов',
    loading: 'Загружаем теги',
    empty: 'Тегов пока нет',
    emptyFiltered: 'Ничего не найдено',
    save: 'Переименовать',
    cancel: 'Отмена',
    rename(tag) {
      return `Переименовать тег ${tag}`;
    },
    drop(tag) {
      return `Убрать тег ${tag} из всех заметок`;
    },
    dropConfirmTitle: 'Убрать тег',
    dropConfirm(tag, count) {
      return `Убрать #${tag} из заметок: ${count}? Файлы этих заметок будут изменены.`;
    },
    dropConfirmAction: 'Убрать тег',
  },
  savedSearches: {
    title: 'Сохранённые поиски',
    saveCurrent: 'Сохранить текущий поиск',
    queryPlaceholder: 'Сначала введите запрос в строке поиска',
    namePlaceholder: 'Название',
    save: 'Сохранить',
    renameHint: 'Переименовать',
    remove(name) {
      return `Удалить сохранённый поиск ${name}`;
    },
    rename(name) {
      return `Переименовать сохранённый поиск ${name}`;
    },
    nothingToSave: 'Сначала введите запрос в строке поиска',
    empty: 'Сохранённых поисков пока нет',
  },
  header: {
    search: 'Поиск',
    searchHint: 'Поиск. Операторы: body:слово — внутри заметки, path:папка — внутри папки, tag:слово — по тегу, updated:2026-10 — изменена с, -слово — исключить. Значения с пробелами — в кавычках.',
    closeSearch: 'Закрыть поиск',
    toggleSidebar: 'Показать или скрыть боковую панель',
    quickNote: 'Быстрая заметка',
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
    noResultsHint: 'Попробуйте другие слова или посмотрите операторы поиска в настройках.',
    clear: 'Очистить поиск',
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
      continueWork: 'Продолжить работу',
      openSettings: 'Открыть настройки',
      toggleSidebar: 'Переключить боковую панель',
      newNote: 'Новая заметка',
      openTemplates: 'Открыть шаблоны',
      openTags: 'Открыть теги',
      openTrash: 'Открыть корзину',
      toggleTheme: 'Переключить тему',
    },
    commandDetails: {
      quickOpen: 'Перейти к поиску только по заметкам',
      continueWork: 'Вернуться к недавно открытой заметке',
      openSettings: 'Открыть экран настроек',
      toggleSidebar: 'Показать или скрыть дерево знаний',
      newNote: 'Создать заметку с названием',
      openTemplates: 'Управлять шаблонами заметок',
      openTags: 'Посмотреть теги, переименовать или убрать их',
      openTrash: 'Восстановить или очистить удалённые заметки',
      toggleTheme: 'Переключить светлую и тёмную тему',
    },
  },
  sidebar: {
    untitledNote: 'Без названия',
    close: 'Закрыть боковую панель',
    delete: 'Удалить',
    mobileNavigation: 'Навигация',
    pinned: 'Закреплённые',
    recentThoughts: 'Недавно открытые',
    knowledgeTree: 'Заметки',
    new: '+ Создать',
    today: 'Сегодня',
    templates: 'Шаблоны',
    templatesHint: 'Заметки из готовых структур',
    templateLibrary: 'Шаблоны',
    templateLibrarySubtitle: 'Выберите структуру для заметки — поля и секции подставятся из шаблона.',
    templateSearch: 'Поиск шаблонов',
    templateSearchPlaceholder: 'встреча, проект, исследование...',
    templateFolder: 'Папка',
    templateNewFolder(name) {
      return `Папка «${name}» будет создана вместе с заметкой.`;
    },
    nameProblem(problem) {
      switch (problem) {
        case 'empty': return 'Введите название.';
        case 'forbidden-characters': return 'В названиях нельзя использовать символы: < > : " / \\ | ? *';
        case 'edge-dot-or-space': return 'Название не может заканчиваться точкой или пробелом.';
        case 'reserved': return 'Такое название зарезервировано системой.';
        case 'too-long': return 'Слишком длинное название.';
        default: return '';
      }
    },
    templatePreview: 'Предпросмотр',
    templatePreviewEmpty: 'Шаблон не выбран',
    templatePreviewEmptyHint: 'Выберите шаблон слева, чтобы увидеть, как будет выглядеть заметка.',
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
    selectedNotes(count) {
      return `${count} выбрано`;
    },
    dropToRoot: 'Переместить в корень',
    syncWithGit: 'Резервная копия',
    conflictsWaiting: 'Конфликты — разобрать в настройках',
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
      deleteSelected: 'Удалить выбранные',
    },
    modals: {
      renameTitle(kind) {
        return `Переименовать ${kind}`;
      },
      tagSelectedTitle(count) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        if (mod10 === 1 && mod100 !== 11) return `Пометить тегом ${count} заметку`;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `Пометить тегом ${count} заметки`;
        return `Пометить тегом ${count} заметок`;
      },
      tagHint: 'Тег добавится ко всем выбранным заметкам. Всё остальное в заметке останется как есть.',
      tagPlaceholder: 'Название тега',
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
      folderPlaceholder: 'Новая папка',
      creating: 'Создание...',
      create: 'Создать',
      newNote: 'Новая заметка',
      createStart: 'Начать с',
      openExisting: 'Открыть существующую',
      createNumbered(name) {
        return `Создать как ${name}`;
      },
      blankNote: 'С чистого листа',
      blankNoteHint: 'Для мысли, которой нужен простор',
      todayNote: 'Дневная заметка',
      todayNoteHint: 'Создать заметку с текущей датой и временем',
      fromTemplate: 'Заметка из шаблона',
      fromTemplateHint: 'Создать заметку по выбранному шаблону',
      title: 'Заголовок',
      titleHint: 'Необязательно. Без названия заметка получит имя «Без названия», его можно изменить потом.',
      noteTitlePlaceholder: 'Название (необязательно)...',
      quickNoteSaved: 'Быстрая заметка сохранена',
      quickNoteSavedHint: 'Содержимое буфера обмена сохранено в Quick Notes. Измените имя и откройте или оставайтесь здесь.',
      openNote: 'Открыть',
      stayHere: 'Остаться здесь',
      quickNoteWillRenameTo: (target) => `Будет переименовано в ${target}`,
      quickNoteNotCreated: 'Быстрая заметка не создана',
      quickNoteClipboardEmptyHint: 'Буфер обмена пуст или не содержит текст/изображение. Скопируйте что-нибудь и попробуйте ещё раз.',
      quickNoteClipboardUnavailableHint: 'Браузер не дал Monos прочитать буфер обмена. Скопируйте текст или изображение ещё раз либо разрешите доступ к буферу, затем повторите.',
      understood: 'Понятно',
    },
    errors: {
      move(message) {
        return `Не удалось переместить: ${message}`;
      },
      loadTree(message) {
        return `Не удалось загрузить дерево: ${message}`;
      },
      createFolder(message) {
        return `Не удалось создать папку: ${message}`;
      },
      createNote(message) {
        return `Не удалось создать заметку: ${message}`;
      },
      duplicateNote: 'Заметка с таким названием уже есть в этой папке. Выберите другое название.',
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
    confirmDeleteMany(count) {
      const mod10 = count % 10;
      const mod100 = count % 100;
      const form = mod10 === 1 && mod100 !== 11
        ? 'выбранную заметку'
        : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
          ? 'выбранные заметки'
          : 'выбранных заметок';
      return `Переместить ${count} ${form} в корзину?`;
    },
  },
  trash: {
    loadFailed: 'Не удалось загрузить корзину.',
    restoreFailed: 'Не удалось восстановить заметку.',
    deleteFailed: 'Не удалось удалить заметку.',
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
    tagsPlaceholder: 'проект, идея',
    content: 'Markdown-содержимое',
    placeholders: 'Переменные: {{title}}, {{date}}, {{shortDate}}, {{time}}.',
    createTemplate: 'Создать шаблон',
    createTemplateHint: 'Сначала задайте шаблону название.',
    saveChanges: 'Сохранить',
    myTemplates: 'Мои шаблоны',
    myTemplatesHint: 'Они показываются перед библиотечными шаблонами при создании заметки.',
    noCustomTemplates: 'Пользовательских шаблонов пока нет.',
    emptyItem: '— пусто',
    noDescription: 'Без описания',
    libraryTitle: 'Библиотечные шаблоны',
    libraryHint: 'Скрытые шаблоны не будут появляться в создании заметки из шаблона.',
    searchPlaceholder: 'Поиск шаблонов...',
    hide: 'Скрыть шаблон',
    show: 'Показать шаблон',
    createNote: 'Создать заметку',
    edit: 'Редактировать шаблон',
    delete: 'Удалить шаблон',
    deleteConfirm(name) {
      return `Удалить пользовательский шаблон ${name}?`;
    },
  },
  optionLabels: {
    fontSize: {
      small: 'Маленький',
      medium: 'Средний',
      large: 'Большой',
      xlarge: 'Очень большой',
      xs: 'Очень маленький',
      sm: 'Маленький',
      md: 'Средний',
      lg: 'Большой',
      xl: 'Очень большой',
    },
    fontCategory: {
      mono: 'моно',
      sans: 'гротеск',
      serif: 'с засечками',
    },
    lineHeight: {
      compact: 'Компактный',
      cozy: 'Удобный',
      normal: 'Обычный',
      spaced: 'Просторный',
      relaxed: 'Свободный',
    },
    contentWidth: {
      narrow: 'Узкая',
      snug: 'Плотная',
      medium: 'Средняя',
      broad: 'Широкая',
      wide: 'Очень широкая',
    },
  },
  settings: {
    title: 'Настройки',
    hint: 'Настройте интерфейс, редактор, синхронизацию, шаблоны и резервные копии.',
    back: 'Назад',
    version: 'Версия',
    language: 'Язык',
    interfaceLanguage: 'Язык интерфейса',
    theme: 'Тема',
    themeMode: 'Режим темы',
    resetGitTitle: 'Выйти из GitHub',
    resetGitMessage: 'Сохранённый токен и выбор репозитория будут удалены из приложения. Войти снова можно в любой момент.',
    resetGitAction: 'Выйти',
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
    printReady: 'PDF сохранён.',
    exportFailed: 'Не удалось экспортировать',
    importTitle: 'Импорт заметок',
    attachmentsFound: '{count} неиспользуемых, {size} попадает в ZIP-бэкапы',
    attachmentsTitle: 'Вложения',
    attachmentsLoading: 'Ищу неиспользуемые вложения…',
    attachmentsError: 'Не удалось прочитать список вложений',
    attachmentsClean: 'Каждое вложение используется хотя бы одной заметкой',
    attachmentsLocked: 'Часть заметок заперта, и картинки в них не проверить. Разблокируйте заметки, чтобы увидеть неиспользуемые картинки.',
    publishTitle: 'Публикация сайтом',
    publishHint: 'Записывает заметки в папку на этом компьютере как обычные веб-страницы. Ничего не загружается.',
    publishFolder: 'Папка на этом компьютере',
    publishFolderHint: 'Сайт попадёт в папку monos-site внутри неё. Папка, в которой уже есть чужие файлы, не трогается.',
    publishButton: 'Опубликовать',
    publishing: 'Записываю сайт…',
    publishedTo: 'Опубликовано заметок: {pages}, папка: {path}',
    publishFailed: 'Не удалось опубликовать сайт',
    lanTitle: 'Телефон и другие устройства',
    lanHint: 'Откройте Monos на телефоне или другом компьютере в той же сети Wi-Fi. Заметки остаются на этом компьютере; устройство получает доступ по ссылке с токеном.',
    lanToggle: 'Разрешить доступ с других устройств',
    lanUrlsTitle: 'Откройте на устройстве один из этих адресов',
    lanCopy: 'Копировать',
    lanCopied: 'Ссылка скопирована',
    lanCopyFailed: 'Не удалось скопировать: выделите ссылку и скопируйте её сами',
    lanNoNetwork: 'Адрес в сети не найден. Подключите компьютер к сети и включите доступ снова.',
    lanRestart: 'Чтобы изменение вступило в силу, перезапустите Monos.',
    lanRenew: 'Новый токен',
    lanRenewTitle: 'Создать новый токен?',
    lanRenewMessage: 'Устройства, которые уже открывали Monos, потеряют доступ, и им понадобится новая ссылка.',
    lanRenewAction: 'Создать токен',
    lanRemoteOnly: 'Настройки доступа можно менять только на этом компьютере.',
    lanLoadFailed: 'Не удалось прочитать настройки доступа',
    lanFailed: 'Не удалось изменить доступ с других устройств',
    lanSecurity: 'Пока Monos запущен, заметки открывает любой, у кого есть ссылка, а соединение не шифруется. Включайте доступ только в своей сети и отправляйте ссылку только своим устройствам.',
    storageTitle: 'Папка заметок',
    storageHint: 'Заметки читаются из этой папки. Выберите папку, где уже лежат ваши заметки: хранилище Obsidian или папку, которую синхронизирует облачный сервис. Monos ничего не переносит: заметки в прежней папке остаются на месте.',
    storageChoose: 'Выбрать папку…',
    storageReset: 'Вернуть папку по умолчанию',
    storageRestart: 'Перезапустите Monos, чтобы открыть {folder}.',
    storageUnavailable: 'Папка {folder} недоступна, поэтому Monos пока открывает папку по умолчанию. Подключите её и перезапустите Monos.',
    storageInAppOnly: 'Папку можно выбрать в приложении Monos.',
    storageInvalid: 'Выберите существующую папку вне данных Monos.',
    storageFailed: 'Не удалось выбрать папку',
    storageRemoteOnly: 'Папку заметок можно менять только на этом компьютере.',
    conflictCopies: 'Конфликтные копии',
    conflictCopyOf: 'Конфликтная копия {original}',
    conflictSameText: 'Тот же текст, что у {original}',
    conflictTrash: 'В корзину',
    conflictTrashTitle: 'Переместить копию в корзину?',
    conflictTrashMessage: 'Копию можно вернуть из корзины, заметка {original} останется как есть. Копия с другим текстом может содержать правки, которые нужно сохранить, поэтому сначала откройте её.',
    conflictTrashAction: 'В корзину',
    conflictTrashFailed: 'Не удалось переместить копию в корзину',
    connectionsTitle: 'Связи и заметки',
    connectionsLoading: 'Проверяю связи…',
    connectionsError: 'Не удалось проверить связи и заметки',
    connectionsClean: 'Битых ссылок, заметок без связей и давно не трогаемых заметок нет',
    brokenLinks: 'Битые ссылки',
    brokenLinkFrom: 'в заметке {note}',
    orphanNotes: 'Заметки без связей',
    staleNotes: 'Не открывали и не правили {days} дней',
    staleSince: 'Последняя активность: {date}',
    moreItems: 'и ещё {count}',
    chooseArchive: 'Выбрать ZIP',
    printAllNotes: 'Печать всех заметок одним PDF',
    noArchiveSelected: 'Архив не выбран',
    clipper: 'Веб-клиппер',
    clipperHint: 'Расширение браузера отправляет страницу или выделенный текст прямо в заметку. Скопируйте токен в расширение.',
    clipperShowToken: 'Показать токен',
    clipperEndpoint: 'Адрес приложения',
    clipperTokenLabel: 'Токен',
    clipperError(message) {
      return `Не удалось получить токен клиппера: ${message}`;
    },
    documentation: 'Документация',
    documentationHint: 'Всё это доступно в любой момент — здесь не бывает разовых туров.',
    docsGettingStarted: 'С чего начать',
    docsStepNew: 'Написать заметку',
    docsStepNewHint: 'Создаёт один файл Markdown в папке заметок.',
    docsStepImport: 'Перенести из другого места',
    docsStepImportHint: 'Импортируйте ZIP с файлами .md. После импорта они останутся .md.',
    docsStepBackup: 'Хранить копию',
    docsStepBackupHint: 'Экспортируйте ZIP в любой момент или подключите Git для версионируемой копии.',
    docsKeyboard: 'Клавиатура',
    docsNotesLive: 'Где лежат ваши заметки',
    docsNotesLiveHint: 'Обычные файлы. Откройте папку в Finder или проводнике, либо прочитайте в любом текстовом редакторе — они останутся читаемыми и без Monos.',
    docsFileFormat: 'Формат файла',
    docsFrontmatter: 'Фронтматтер в начале заметки хранит заголовок, теги и даты.',
    docsWikiLinks: 'Ввод [[ и названия заметки создаёт ссылку; заметка перечисляет, кто на неё ссылается.',
    docsShortcutCommands: 'Палитра команд',
    docsShortcutOpen: 'Открыть заметку по имени',
    docsShortcutSidebar: 'Показать или скрыть боковую панель',
    docsShortcutSearch: 'Поиск',
    docsShortcutSave: 'Сохранить текущую заметку',
    docsOperators: 'Операторы поиска',
    docsOperatorsHint: 'Пишите их в переключателе заметок (Ctrl+O) — отдельно или вместе со словами.',
    docsOpTag: 'tag:работа',
    docsOpTagHint: 'Заметки с этим тегом',
    docsOpFolder: 'folder:base',
    docsOpFolderHint: 'Заметки внутри этой папки',
    docsOpPath: 'path:llm',
    docsOpPathHint: 'Заметки, в пути которых есть этот текст',
    docsOpTitle: 'title:Отчёт',
    docsOpTitleHint: 'Заметки, в заголовке которых есть этот текст',
    docsOpCreated: 'created:2026-10',
    docsOpCreatedHint: 'Заметки, созданные в этом месяце',
    docsOpNegation: '-tag:архив',
    docsOpNegationHint: 'Исключить всё, что подходит',
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
    publicRepoTitle: 'Этот репозиторий публичный',
    publicRepoHint: 'Заметки в нём станут публичным текстом и останутся в истории git даже после удаления. Лучше приватный репозиторий.',
    tokenScopeTitle: 'У этого токена больше прав, чем нужно Monos',
    tokenScopeHint: 'Достаточно тонкого токена, ограниченного одним репозиторием. Более широкий тоже сработает, но утёкший токен дотянется дальше ваших заметок.',
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
    defaultCommitMessage: 'Синхронизация заметок из Monos',
  },
  editor: {
    pinDo: 'Закрепить',
    pinUnpin: 'Открепить',
    propertyCategory: 'Категория',
    propertyCategoryEmpty: 'Добавить категорию',
    categorySuggestions: 'Подсказки категорий',
    propertiesToggle: 'Свойства',
    tagRemove(tag) {
      return `Убрать тег ${tag}`;
    },
    dueFormat: 'ДД.ММ.ГГГГ',
    dueInvalid: 'Это не дата. Введите 2026-12-24 или 24.12.2026.',
    moreActions: 'Ещё',
    exportLabel: 'Экспорт',
    exportMarkdown: 'Markdown',
    exportHtml: 'HTML',
    exportText: 'Простой текст',
    exportPdf: 'PDF',
    propertyTags: 'Теги',
    propertyTagsEmpty: 'проект, идея',
    propertyDue: 'Срок',
    gatheringThoughts: 'Собираем мысли',
    beginWriting: 'Начните писать...',
    archiveTitle: 'Переместить заметку в корзину?',
    archiveConfirm(name) {
      return `${name} исчезнет из заметок, поиска и дерева. Её можно будет восстановить из корзины.`;
    },
    cancel: 'Отмена',
    archiving: 'Перемещение...',
    moveToTrash: 'В корзину',
    saving: 'Сохранение…',
    saved: 'Сохранено',
    saveFailed: 'Не удалось сохранить',
    retry: 'Повторить',
    noteNotFound(target) {
      return `Заметка "${target}" не найдена.`;
    },
    conflictResolveHint: 'Выберите сторону для каждой конфликтной части и примените. Всё остальное останется как есть.',
    conflictKeepOurs: 'Оставить мою',
    conflictKeepTheirs: 'Оставить чужую',
    conflictKeepBoth: 'Оставить обе',
    conflictKeepAllOurs: 'Оставить мою везде',
    conflictKeepAllTheirs: 'Оставить чужую везде',
    conflictApply: 'Применить',
    conflictRegionLabel: 'Конфликтная часть',
    conflictResolved: 'Конфликт в этой заметке разрешён.',
    conflictSaving: 'Применяем ваш выбор…',
    conflictBase: 'Исходник (от него отталкивались оба)',
    conflictOurs: 'Это устройство',
    conflictTheirs: 'Другое устройство',
    conflictTitle: 'В этой заметке неразрешён конфликт синхронизации',
    conflictHint: 'Она намеренно только для чтения: открытие в редакторе перепишет маркеры слияния и повредит заметку. Разрешите конфликт в настройках, затем откройте снова.',
    conflictCount(count) {
      const mod10 = count % 10;
      const mod100 = count % 100;
      if (mod10 === 1 && mod100 !== 11) return `${count} конфликт в этой заметке`;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} конфликта в этой заметке`;
      return `${count} конфликтов в этой заметке`;
    },
    conflictRegion(index, total) {
      return total === 1 ? 'Конфликтная часть' : `Конфликтная часть ${index} из ${total}`;
    },
    deleteError(message) {
      return `Ошибка при удалении: ${message}`;
    },
    localNavigation: 'Связанные',
    unlinkedMentions: 'Упоминания без ссылки',
    linkMention: 'Связать',
    mentionOf: 'упоминает «{phrase}»',
    localGraph: 'Локальный граф',
    linkMentionFailed: 'Не удалось связать упоминание',
    outline: 'Структура',
    outlineEmpty: 'Заголовков пока нет',
    closeOutline: 'Закрыть структуру',
    hideOutline: 'Скрыть структуру',
    showOutline: 'Показать структуру',
    imageUploadFailed: 'Не удалось загрузить изображение',
    attachmentUploadFailed: 'Не удалось прикрепить файл',
    imageRenameFailed: 'Не удалось переименовать изображение',
    renameImageTitle: 'Переименовать изображение',
    renameImageHint: 'Файл будет переименован на диске, а Markdown-ссылка в этой заметке обновится.',
    renameImage: 'Переименовать',
    focusOn: 'Режим фокуса',
    focusOff: 'Выйти из фокуса',
    rawMode: 'Исходный Markdown',
    richMode: 'Визуальный редактор',
    due: 'Срок',
    dueClear: 'Убрать срок',
    dueToday: 'сегодня',
    dueTomorrow: 'завтра',
    dueOverdue(days) {
      const mod10 = days % 10;
      const mod100 = days % 100;
      if (mod10 === 1 && mod100 !== 11) return `просрочено на ${days} день`;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `просрочено на ${days} дня`;
      return `просрочено на ${days} дней`;
    },
    dueInDays(days) {
      const mod10 = days % 10;
      const mod100 = days % 100;
      if (mod10 === 1 && mod100 !== 11) return `через ${days} день`;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `через ${days} дня`;
      return `через ${days} дней`;
    },
    noteColor: 'Цвет заметки',
    noColor: 'Нет',
  },
  history: {
    title: 'История заметки',
    loading: 'Читаем историю…',
    notSynced: 'Заметки ещё нет в git-репозитории, поэтому истории пока нет. Синхронизируйте один раз — и версии появятся здесь.',
    empty: 'Более ранних версий нет.',
    pickRevision: 'Выберите версию слева, чтобы увидеть изменения.',
    diffTitle: 'Отличия от текущей заметки',
    restore: 'Восстановить эту версию',
    restoring: 'Восстанавливаем…',
    unchanged: 'Это уже текущая версия заметки.',
    noMessage: '(без сообщения)',
  },
  editorHeader: {
    noteTitle: 'Заголовок заметки',
    created: 'Создано',
    modified: 'Изменено',
    stats: {
      words(count) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        if (mod10 === 1 && mod100 !== 11) return `${count} слово`;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} слова`;
        return `${count} слов`;
      },
      readingMinutes(count) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        if (mod10 === 1 && mod100 !== 11) return `${count} минута`;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} минуты`;
        return `${count} минут`;
      },
      empty: 'Пока нет слов',
    },
    taskProgress: {
      label(done, total) {
        return `${done}/${total}`;
      },
      percent(value) {
        return `${value}%`;
      },
      complete: 'Все задачи выполнены',
    },
    tagPlaceholder: '+ тег',
    revealInTree: 'Показать в дереве',
    historyButton: 'История',
    print: 'Печать',
  },
  sourceEditor: {
    beginWriting: 'Начните писать...',
    linkedMentions: 'Связанные заметки',
    backlink: 'Обратная ссылка',
    mention: 'Упоминание',
    wikiSuggestions: 'Подсказки заметок',
    duplicateNameShort: 'дубль',
    duplicateName: 'Заметка с таким именем уже есть — ссылка будет неоднозначной',
    resizeContent: 'Изменить ширину source-контента',
  },
  richEditor: {
    bodyLabel: 'Текст заметки',
    more: 'Ещё инструменты',
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
    insertLink: 'Вставить ссылку',
    insertImage: 'Вставить изображение',
    imagePrompt: 'URL изображения:',
    slashMenuLabel: 'Slash-команды',
    slashHint: 'Введите / для команд',
    pdfOpen: 'Открыть PDF',
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
  fileInfo: {
    identifier: 'Идентификатор',
    dimensions: 'Размер',
    nature: 'Тип',
    collection: 'Коллекция',
    thought: 'Заметка',
    conceived: 'Создано',
    refined: 'Изменено',
    connections: 'Связи',
    awaitingFocus: 'Ожидает выбора',
    unknown: 'Неизвестно',
  },
  modal: {
    close: 'Закрыть окно',
    closeBackdrop: 'Закрыть окно по фону',
    confirm: 'Подтвердить',
    cancel: 'Отмена',
    promptLabel: 'Значение',
  },
};

export const translations = {
  en: enText,
  ru: ruText,
};

export const uiText = enText;

export const localizedText = derived(locale, ($locale) => translations[$locale] || enText);
