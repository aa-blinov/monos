<script>
  import { onDestroy, onMount, createEventDispatcher, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { sidebarOpen, setSidebarOpen } from '../lib/sidebar.js';
  import EditorHeader from './EditorHeader.svelte';
  import ModalShell from './ModalShell.svelte';
  import RichEditor from './RichEditor.svelte';
  import OutlinePanel from './OutlinePanel.svelte';
  import CategoryInput from './CategoryInput.svelte';
  import { scrollBehavior } from '../lib/motion.js';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { editorState, editorAction, noteSaveSignal, activeTheme, outlineHidden, outlineWidth, focusNoteBody, propertiesChanged } from '../stores.js';
  import { getNoteColorOptions } from '../lib/note-colors.js';
  import { getModalButtonClass } from '../lib/modal-button.js';
  import { formFieldClass } from '../lib/form-field.js';
  import { announceNoteLinksUpdated, FLUSH_OPEN_NOTE_EVENT, NOTE_LINKS_UPDATED_EVENT, NOTES_PULLED_EVENT } from '../lib/note-refresh.js';
  import { mergeThreeWay } from '../lib/three-way-merge.js';
  import { markPinned, pinEvents } from '../lib/sidebar-pinned.js';
  import { syncState } from '../lib/git-conflicts.js';
  import { askAgentAboutNote, terminalBridge, terminalOpen, toggleTerminal } from '../lib/terminal.js';
  import { layoutLocalGraph, truncateLabel } from '../lib/local-graph.js';
  import { dueLabel, dueStatus, parseFrontmatter, replaceFrontmatterBody, setFrontmatterKey, splitFrontmatter, upsertFrontmatter } from '../lib/frontmatter.js';
  import { parseDueInput, formatDueInput } from '../lib/due-input.js';
  import { fileNameProblem } from '../lib/file-name.js';
  import { extractOutline } from '../lib/outline.js';
  import { hasRawHtml } from '../lib/raw-html.js';
  import { relatedRows } from '../lib/related-notes.js';
  import { notifyDue } from '../lib/reminders.js';
  import { downloadFile, exportFileName, fetchExportBundle, fetchNoteHtml, markdownToPlainText } from '../lib/note-export.js';
  import { printNoteToPdf } from '../lib/print.js';
  import {
    deleteFileRequest,
    linkMentionRequest,
    loadBacklinksRequest,
    loadCategoriesRequest,
    loadFileContent,
    loadFileInfo,
    loadNeighborsRequest,
    loadUnlinkedMentionsRequest,
    renameAttachment,
    saveFileContent,
    saveFileMetadata,
    setItemColorRequest,
    uploadAttachment,
  } from '../lib/editor-api.js';
  import { isFavoriteProperties, setFavoriteRequest } from '../lib/favorites.js';
  import { replaceTabs, tabsToSpaces } from '../lib/tabs.js';
  import { flushOpenNote } from '../lib/note-refresh.js';
  import { createFolderRequest, createNoteRequest, loadDirectoriesRequest, loadTagsRequest, moveItemRequest, renameItemRequest } from '../lib/sidebar-api.js';
  import { announceTrashed, trashedNote } from '../lib/trash-undo.js';
  import { conflictedFiles, conflictedNotes, conflictNotePath, refreshConflicts } from '../lib/git-conflicts.js';
  import { uploadsChanges } from '../lib/git-sync.js';
  import {
    convertImageToWebp,
    imageNameFor,
    displayImageSrc,
    replaceMarkdownImagePath,
    resolveMarkdownImagePath,
  } from '../lib/attachments.js';
  import { displayFolderName, localizedText, locale } from '../lib/strings.js';
  import { wordStats } from '../lib/word-stats.js';
  import { taskProgress as taskProgressOf } from '../lib/task-progress.js';
  import { resolveRegion, summarizeConflicts } from '../lib/conflict-markers.js';
  import ConflictNoteView from './ConflictNoteView.svelte';
  import ConflictDeletedView from './ConflictDeletedView.svelte';
  import LockedConflictView from './LockedConflictView.svelte';
  import { CalendarDays, Download, Folder, History, Link2, Lock, Palette, SlidersHorizontal, Tag, Trash2, FileText, X, Focus, Pin, Star, MoreHorizontal, Bot, TerminalSquare, ArrowLeft, ArrowLeftRight, ArrowRight, Waypoints } from 'lucide-svelte';
  import NoteProperties from './NoteProperties.svelte';
  import NoteLock from './NoteLock.svelte';
  import LockedNote from './LockedNote.svelte';

  let richEditor;

  const dispatch = createEventDispatcher();

  export let currentFile;

  let content = '';
  let editedContent = '';
  // Raw Markdown view: the note *is* a file in git, so seeing exactly the bytes
  // that will be committed matters — not only what the rich editor rebuilds.
  let rawMode = false;
  // A note with raw HTML opens as source text: the visual editor would save its tags as `&lt;div&gt;`. The mode the
  // person had chosen comes back when the next note has no HTML; choosing a mode by hand ends the automatic one.
  let rawForHtml = false;
  let rawModeBeforeHtml = false;
  function chooseRawMode(next) {
    rawMode = next;
    rawForHtml = false;
  }
  // Режим фокуса: одна мысль на экране — узкая колонка и никакой второстепенной
  // панели. Мера текста в дизайн-системе уже есть, мы её переиспользуем.
  let focusMode = false;
  // Оглавление на узком экране открывается поверх заметки (см. OutlinePanel).
  let outlineOpen = false;
  // One control, «Outline» in the note header, on every screen. On a wide window it shows or hides the
  // column beside the note, and the choice to hide it is remembered; on a narrow one it opens the panel over
  // the note. The column comes up by itself only when it helps: from three headings on. A shorter note
  // shows its headings in the text already, so a column repeating them is noise until asked for.
  const OUTLINE_MIN_HEADINGS = 3;
  let wideWindow = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(min-width: 1024px)')?.matches);
  onMount(() => {
    const query = window.matchMedia?.('(min-width: 1024px)');
    if (!query) return undefined;
    const update = () => { wideWindow = Boolean(query.matches); };
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  });
  function toggleOutline() {
    if (!wideWindow) {
      outlineOpen = !outlineOpen;
      return;
    }
    if (outlineColumnShown) {
      outlineHidden.set(true);
      outlineRevealed = false;
    } else {
      outlineHidden.set(false);
      outlineRevealed = true;
    }
  }
  // Дедлайн заметки живёт в YAML-шапке и потому переживает перезагрузку,
  // экспорт в PDF и попадает в git как обычная строка. В поле его можно печатать
  // в привычной записи, а в файл всегда пишется ISO (YYYY-MM-DD).
  let dueDate = '';
  let dueText = '';
  let dueFocused = false;
  let dueInvalid = false;
  let tagDraft = '';
  let footerMoreOpen = false;
  // Свойства открываются окошками над нижней панелью. Открыто не больше одного:
  // 'category' | 'tags' | 'due' | 'related' | 'color' | null.
  let propertyPanel = null;
  let propertyTriggers = {};
  // Экспорт: файлы для просмотра вне Monos. Ошибка показывается в самом окошке.
  let exporting = false;
  let exportError = '';

  $: dueDate = parseFrontmatter(editedContent).due;
  $: if (!dueFocused && !dueInvalid) dueText = formatDueInput(dueDate, $locale);
  $: notePath = currentFile?.path ?? null;
  $: notePath, resetPropertyPanel();
  $: exportFormats = [
    { id: 'md', label: $localizedText.editor.exportMarkdown, extension: 'md' },
    { id: 'html', label: $localizedText.editor.exportHtml, extension: 'html' },
    { id: 'txt', label: $localizedText.editor.exportText, extension: 'txt' },
    { id: 'pdf', label: $localizedText.editor.exportPdf, extension: 'pdf' },
  ];
  $: headingCount = extractOutline(splitFrontmatter(editedContent).body).length;
  // Asked for on this note with the button: shown even with few headings, until the next note opens.
  let outlineRevealed = false;
  $: if (currentFile?.path) outlineRevealed = false;
  $: outlineColumnShown = outlineRevealed || (!$outlineHidden && headingCount >= OUTLINE_MIN_HEADINGS);
  $: outlineCollapsed = !outlineColumnShown;
  let title = '';
  let editedTitle = '';
  let fileInfo = null;
  let isLoading = true;
  let isSaving = false;
  let isDeleting = false;
  let wordCharStats = '';
  let conflictCount = 0;
  /** The version of the text on disk this editor started from; sent with every save (see saveFileContent). */
  let diskVersion = '';
  /** Who wrote each side of this note's conflict, and when; null until known. */
  let conflictSides = null;
  /** One device deleted the note and the other changed it: `{ deletedHere }`, or null. */
  let deletedConflict = null;
  let resolvingDeleted = false;
  /** A locked note in a sync conflict (its entry from the conflict list), or null: see LockedConflictView. */
  let lockedConflictEntry = null;
  /** The note last loaded while the conflict list already named it: a later arrival of that list reloads once. */
  let conflictCheckedFor = null;
  // In conflict either way: markers in the text, a deletion against a change, or a sealed note.
  $: inConflict = conflictCount > 0 || Boolean(deletedConflict) || Boolean(lockedConflictEntry);

  // The conflict list loads after the app starts and after every sync; a note opened before it arrived
  // (straight from a link, or just as a sync finished) is read again once it names that note, so a locked
  // or deleted note in conflict gets its conflict screen instead of an ordinary one.
  $: {
    const openPath = loadedFilePath || lockedFilePath;
    if (openPath && $conflictedNotes.has(openPath) && conflictCheckedFor !== openPath && !isLoading && !isSaving && !hasUnsavedChanges()) {
      conflictCheckedFor = openPath;
      void loadFile();
    }
  }
  let conflictNotice = '';
  let showHistory = false;
  let historyNote = null;
  let formatToast = '';
  let formatToastTimer;
  let imageRename = null;
  let attachmentNewName = '';
  // Имя картинки — имя файла во вложениях: то же правило, что и для заметок.
  $: attachmentProblem = fileNameProblem(attachmentNewName);
  let autosaveTimer;
  let lastSaved = null;
  let saveMessage = '';
  let saveFailed = false;
  // Saving, saved, or a failure; a failure is drawn red so it is not mistaken for progress.
  $: saveMessageIsError = Boolean(saveMessage)
    && ![$localizedText.editor.saving, $localizedText.editor.saved].includes(saveMessage);
  let saveMessageTimeout;
  // 1250 + 250 мс на сбор разметки редактором = прежние 1500 мс от последнего
  // нажатия до сохранения. Без этой поправки отложенная сериализация незаметно
  // удлинила бы окно, за которым правка ещё не записана на диск.
  const AUTOSAVE_DELAY = 1250;
  let backlinks = [];
  // Plain-prose mentions of this note that do not link to it yet, and its neighbours for the local graph.
  let unlinkedMentions = [];
  let neighborhood = { nodes: [], edges: [] };
  let linkMentionFailed = false;
  // The note that is locked and waiting for its passphrase; its text is not loaded.
  let lockedFilePath = null;
  let editableTags = [];
  let editableCategory = '';
  // Подсказки для поля категории: категории, уже встречающиеся в хранилище.
  let categorySuggestions = [];
  let metadataTimer;
  const METADATA_DELAY = 1200;
  let loadedFilePath = null;
  let loadingFilePath = null;
  let displayedFile = null;
  let visibleFile = null;
  let loadRequestId = 0;
  let failedLoadPath = null;
  let currentNoteColor = '';
  let isColorSaving = false;

  $: colorOptions = getNoteColorOptions($activeTheme);

  function isCurrentLoad(requestId, filePath) {
    return requestId === loadRequestId && currentFile?.path === filePath;
  }

  $: dueStatusOf = dueStatus(dueDate);
  $: dueLabelOf = dueDate
    ? dueLabel(dueDate, new Date(), {
      overdue: (days) => $localizedText.editor.dueOverdue(days),
      today: $localizedText.editor.dueToday,
      tomorrow: $localizedText.editor.dueTomorrow,
      inDays: (days) => $localizedText.editor.dueInDays(days),
      onDate: (date) => new Intl.DateTimeFormat($locale === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' }).format(date),
    })
    : '';

  // Напоминание показывается один раз на каждую пару «заметка + срок»:
  // перезагрузка страницы не должна снова дёргать уведомлением.
  $: if (currentFile?.path && dueDate && dueStatusOf !== 'none') {
    notifyDue(
      { path: currentFile.path, name: editedTitle, due: dueDate, status: dueStatusOf },
      {
        title: editedTitle || $localizedText.editor.due,
        body: dueLabelOf,
      },
    );
  }

  function applyDue(value) {
    if (!currentFile?.path) return;
    editedContent = setFrontmatterKey(editedContent, 'due', value || '');
  }

  // Срок принимаем по Enter или при уходе из поля. Непонятную дату не угадываем: текст
  // остаётся, появляется подсказка, а файл не меняется.
  function commitDueText() {
    const result = parseDueInput(dueText);
    if (!result.ok) {
      dueInvalid = true;
      return;
    }
    dueInvalid = false;
    applyDue(result.due);
    dueText = formatDueInput(result.due, $locale);
  }

  function clearDue() {
    dueText = '';
    dueInvalid = false;
    applyDue('');
  }

  // A due date is usually today, tomorrow or a week out: one click instead of typing a date.
  // The calendar is the system's own date picker; the text field stays for any other date.
  const DUE_QUICK_DAYS = [0, 1, 7];
  let dueDateInput;
  function isoDayFromToday(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  function setDueIso(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    dueInvalid = false;
    applyDue(iso);
    dueText = formatDueInput(iso, $locale);
  }
  function openDueCalendar() {
    if (!dueDateInput) return;
    try {
      dueDateInput.showPicker();
    } catch {
      dueDateInput.focus();
      dueDateInput.click();
    }
  }

  // Окошко свойств открыто одно. Ввод, который ещё не принят (тег, срок), принимается
  // при закрытии, а не пропадает вместе с окошком.
  function togglePropertyPanel(panel) {
    if (propertyPanel === panel) {
      closePropertyPanel({ restoreFocus: true });
      return;
    }
    closePropertyPanel();
    footerMoreOpen = false;
    exportError = '';
    propertyPanel = panel;
  }

  function closePropertyPanel({ restoreFocus = false } = {}) {
    const panel = propertyPanel;
    if (!panel) return;
    if (panel === 'tags') addTagsFromDraft();
    if (panel === 'due' && dueFocused) commitDueText();
    dueFocused = false;
    dueInvalid = false;
    propertyPanel = null;
    if (restoreFocus) propertyTriggers[panel]?.focus();
  }

  // Окошко и черновики относятся к одной заметке. При переходе на другую они
  // закрываются без записи: ввод прежней заметки уже принят при уходе фокуса.
  function resetPropertyPanel() {
    propertyPanel = null;
    footerMoreOpen = false;
    exportError = '';
    tagDraft = '';
    dueFocused = false;
    dueInvalid = false;
  }

  // Нажатие вне окошка или меню закрывает его, как в обычных меню.
  function closePopoversOnPress(event) {
    const target = event.target;
    if (footerMoreOpen && !target.closest?.('[data-footer-more]')) footerMoreOpen = false;
    if (propertyPanel && !target.closest?.(`[data-panel-anchor="${propertyPanel}"]`)) closePropertyPanel();
  }

  function closePopoversOnEscape(event) {
    if (event.key !== 'Escape') return;
    // Escape leaves focus mode only when nothing else is open to close.
    if (focusMode && !footerMoreOpen && !propertyPanel && !document.querySelector('[aria-modal="true"]')) {
      setFocusMode(false);
      return;
    }
    footerMoreOpen = false;
    if (propertyPanel) closePropertyPanel({ restoreFocus: true });
  }

  // Focus mode leaves only the text: the sidebar closes (and comes back as it was), the bottom bar and
  // the stats go, the header folds to the title row with a way out. Escape leaves it too.
  let sidebarBeforeFocus = null;
  function setFocusMode(on) {
    if (on === focusMode) return;
    focusMode = on;
    if (on) {
      sidebarBeforeFocus = get(sidebarOpen);
      setSidebarOpen(false);
    } else if (sidebarBeforeFocus !== null) {
      setSidebarOpen(sidebarBeforeFocus);
      sidebarBeforeFocus = null;
    }
  }

  // Экспорт сначала отдаёт правки редактора и дожидается сохранения: HTML и PDF
  // собирает сервер из файла на диске, поэтому им нужна сохранённая версия.
  async function exportNote(format) {
    if (!currentFile?.path || exporting) return;
    exporting = true;
    exportError = '';
    try {
      await flushPendingEdits();
      const name = editedTitle || title || currentFile.name?.replace(/\.md$/, '') || 'note';
      if (format === 'md' || format === 'txt') {
        const fileName = exportFileName(name, format);
        const text = format === 'md' ? editedContent : markdownToPlainText(splitFrontmatter(editedContent).body);
        // With pictures or PDFs the note leaves as a folder (a zip): the file and its _attachments side by side.
        const bundle = await fetchExportBundle(currentFile.path, fileName, format === 'md' ? editedContent : text, editedContent).catch((error) => {
          console.error('Export with attachments failed, saving the plain file:', error);
          return null;
        });
        if (bundle) downloadFile(bundle.fileName, bundle.blob);
        else downloadFile(fileName, text, format === 'md' ? 'text/markdown' : 'text/plain');
      } else if (format === 'html') {
        downloadFile(exportFileName(name, 'html'), await fetchNoteHtml(currentFile.path), 'text/html');
      } else {
        await printNoteToPdf(currentFile.path);
      }
      if (propertyPanel === 'export') closePropertyPanel({ restoreFocus: true });
    } catch (error) {
      exportError = error?.message || String(error);
    } finally {
      exporting = false;
    }
  }

  // Окошко получает фокус сразу: поле ввода или первый пункт.
  function focusFirstControl(node) {
    tick().then(() => (node.querySelector('input') || node.querySelector('button'))?.focus());
  }

  // Окошко над нижней панелью. На телефоне это широкая шторка над той же панелью.
  const panelClass = 'absolute bottom-full left-0 z-30 mb-2 w-72 rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3 shadow-2xl max-sm:fixed max-sm:inset-x-3 max-sm:bottom-14 max-sm:w-auto';
  const panelLabelClass = 'mb-2 text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]';

  function richEditorBody(noteContent) {
    return splitFrontmatter(noteContent).body;
  }

  /**
   * Отдать отложенную разметку редактора до того, как содержимое заметки
   * прочитают снаружи. Без этого последние нажатия (до 250 мс) попали бы в
   * файл только по счастливому совпадению таймингов.
   */
  function flushEditorMarkdown() {
    try {
      richEditor?.flushMarkdown?.();
    } catch {
      // Редактора ещё нет или он уже уничтожен — читать нечего.
    }
  }

  function tagsEqual(a = [], b = []) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function hasMetadataChanges() {
    const currentTags = fileInfo?.metadata?.tags || [];
    return editedTitle !== title
      || !tagsEqual(editableTags, currentTags)
      || editableCategory !== (fileInfo?.metadata?.category || '')
      // Закрепление живёт в той же шапке. Без этой строки переключение
      // меняло содержимое в памяти и уходило дальше по коду: saveMetadataFields
      // видел, что метаданные не тронуты, и выходил, ничего не записав.
      || noteIsPinned() !== Boolean(fileInfo?.metadata?.pinned);
  }

  async function fetchBacklinks(filePath = currentFile?.path) {
    if (!filePath || currentFile?.isDir) return [];
    try {
      return await loadBacklinksRequest(filePath);
    } catch (error) {
      console.error('Failed to load backlinks:', error);
      return [];
    }
  }

  async function loadBacklinks(filePath = currentFile?.path) {
    backlinks = await fetchBacklinks(filePath);
  }

  function openLinkedNote(item) {
    if (!item?.path) return;
    dispatch('navigate', { path: item.path, name: item.name, isDir: false });
  }

  // The title is the file's name. Editing it and leaving the field (or pressing Enter) renames the file,
  // and the server rewrites the links to it. A note whose frontmatter title differs from its file name,
  // as imported notes can, keeps both until its title is edited here.
  let titleTouched = false;
  // Reading down a long note folds the big title and the stats into the top row; scrolling back up
  // unfolds them. The toolbar stays where it is.
  // Hysteresis: folding makes the text area taller, which can pull the scroll back a little; unfolding
  // only near the very top keeps the header from flickering at the threshold. A note that barely
  // scrolls is never folded.
  const HEADER_FOLD_AFTER = 48;
  const HEADER_UNFOLD_BEFORE = 8;
  const HEADER_FOLD_MIN_ROOM = 240;
  let headerCompact = false;
  function updateHeaderCompact({ top, room }) {
    if (!headerCompact && top > HEADER_FOLD_AFTER && room > HEADER_FOLD_MIN_ROOM) headerCompact = true;
    else if (headerCompact && top < HEADER_UNFOLD_BEFORE) headerCompact = false;
  }
  $: if (currentFile?.path) headerCompact = false;
  const fileBaseName = (path) => String(path || '').split('/').pop().replace(/\.md$/i, '');

  async function commitTitle() {
    if (!titleTouched || !currentFile?.path || currentFile.isDir || inConflict) return;
    titleTouched = false;
    const filePath = currentFile.path;
    const currentName = fileBaseName(filePath);
    const next = editedTitle.trim();
    if (!next) {
      editedTitle = currentName;
      return;
    }
    if (next === currentName) return;
    const problem = fileNameProblem(next);
    if (problem) {
      saveMessage = $localizedText.sidebar.nameProblem(problem);
      editedTitle = currentName;
      return;
    }
    try {
      // The frontmatter title follows the name first, so the card and search do not keep the old one.
      editedTitle = next;
      await saveMetadataFields();
      await flushPendingEdits();
      const data = await renameItemRequest(filePath, `${next}.md`);
      announceNoteLinksUpdated(data);
      dispatch('renamed', { path: data.path, name: data.name, isDir: false });
    } catch (error) {
      saveMessage = error?.status === 409
        ? $localizedText.sidebar.errors.duplicateNote
        : $localizedText.sidebar.errors.rename(error?.message || String(error));
      editedTitle = currentName;
    }
  }

  function finishTitle() {
    // Enter moves on to the text, as in a document: the title is done.
    richEditor?.focusStart?.();
  }

  // A link that leads nowhere creates its note, as Obsidian does: in the folder the link names, or at the top.
  // A note of that name made meanwhile is opened instead of a copy.
  async function createLinkedNote({ title, category }) {
    if (!title) return;
    try {
      const note = await createNoteRequest({ title, category, tags: [], content: '', openIfExists: true });
      openLinkedNote({ path: note.path, name: note.name || title });
    } catch (error) {
      console.error('Failed to create the linked note:', error);
      saveMessage = $localizedText.editor.linkedNoteFailed;
    }
  }

  // Mentions and the local graph are read next to the backlinks. A failed read leaves them empty.
  async function fetchConnections(filePath = currentFile?.path) {
    const empty = { mentions: [], graph: { nodes: [], edges: [] } };
    if (!filePath || currentFile?.isDir) return empty;
    try {
      const [mentions, graph] = await Promise.all([
        loadUnlinkedMentionsRequest(filePath),
        loadNeighborsRequest(filePath),
      ]);
      return {
        mentions: Array.isArray(mentions) ? mentions : [],
        graph: Array.isArray(graph?.nodes) ? graph : empty.graph,
      };
    } catch (error) {
      console.error('Failed to load connections:', error);
      return empty;
    }
  }

  async function refreshConnections() {
    if (!loadedFilePath) return;
    const [nextBacklinks, nextConnections] = await Promise.all([
      fetchBacklinks(loadedFilePath),
      fetchConnections(loadedFilePath),
    ]);
    backlinks = nextBacklinks;
    unlinkedMentions = nextConnections.mentions;
    neighborhood = nextConnections.graph;
  }

  // Links the mention in another note to this note. The lists are read again either way.
  async function linkMention(item) {
    if (!item?.path || !loadedFilePath) return;
    linkMentionFailed = false;
    try {
      announceNoteLinksUpdated(await linkMentionRequest(item.path, loadedFilePath));
    } catch (error) {
      console.error('Failed to link mention:', error);
      linkMentionFailed = true;
    }
    await refreshConnections();
  }

  $: relatedCount = new Set([
    ...backlinks.map((item) => item.path),
    ...neighborhood.nodes.filter((node) => !node.center).map((node) => node.path),
    ...unlinkedMentions.map((item) => item.path),
  ]).size;
  $: graphLayout = layoutLocalGraph(neighborhood);
  $: relatedList = relatedRows(neighborhood, backlinks);
  const relationText = (relation) => relation === 'both' ? $localizedText.editor.relationBoth : relation === 'out' ? $localizedText.editor.relationOut : $localizedText.editor.relationIn;
  // The due date has its own button in this bar; counted again under Properties it read as two settings.
  $: customProperties = (fileInfo?.properties || []).filter((property) => !['due', 'monos-favorite'].includes(String(property.key).toLowerCase()));

  function resolveEditorImageSrc(src) {
    return displayImageSrc(visibleFile?.path, src);
  }

  function resolveEditorImagePath(src) {
    return resolveMarkdownImagePath(visibleFile?.path, src);
  }

  function markFileSaved(filePath, response = {}) {
    const modified = response?.modified || new Date().toISOString();
    if (loadedFilePath === filePath) {
      fileInfo = fileInfo ? { ...fileInfo, modified } : fileInfo;
      if (response?.version) diskVersion = response.version;
    }
    const detail = { path: filePath, modified, savedAt: Date.now() };
    noteSaveSignal.set(detail);
    dispatch('fileSaved', detail);
  }

  async function handleImageFile(file) {
    const filePath = visibleFile?.path || currentFile?.path;
    if (!filePath) return null;
    try {
      const converted = await convertImageToWebp(file, { name: imageNameFor(file) });
      const uploaded = await uploadAttachment(filePath, converted, converted.name);
      return uploaded;
    } catch (error) {
      console.error('Image upload failed:', error);
      formatToast = $localizedText.editor.imageUploadFailed;
      if (formatToastTimer) clearTimeout(formatToastTimer);
      formatToastTimer = setTimeout(() => formatToast = '', 3000);
      return null;
    }
  }

  function openImageRename(event) {
    if (!event.detail?.path) return;
    imageRename = event.detail;
    attachmentNewName = event.detail.path.split('/').pop() || '';
  }

  // A PDF is attached as it is (no picture conversion), next to the note.
  async function handleDocumentFile(file) {
    const filePath = visibleFile?.path || currentFile?.path;
    if (!filePath) return null;
    try {
      return await uploadAttachment(filePath, file, file.name);
    } catch (error) {
      console.error('Attachment upload failed:', error);
      formatToast = $localizedText.editor.attachmentUploadFailed;
      if (formatToastTimer) clearTimeout(formatToastTimer);
      formatToastTimer = setTimeout(() => formatToast = '', 3000);
      return null;
    }
  }

  async function saveImageRename() {
    const filePath = visibleFile?.path || loadedFilePath || currentFile?.path;
    if (!filePath || !imageRename?.path || !attachmentNewName.trim() || attachmentProblem) return;
    try {
      await flushPendingEdits();
      const renamed = await renameAttachment(filePath, imageRename.path, attachmentNewName.trim());
      if (loadedFilePath !== filePath) return;
      // The server already rewrote the link in this note (and in every other): read it back rather than
      // rewrite it a second time here, which would differ in small ways and look like a conflict.
      if ((renamed.updatedPaths || []).includes(filePath)) {
        const data = await loadFileContent(filePath);
        if (loadedFilePath !== filePath) return;
        content = data.content;
        editedContent = data.content;
        diskVersion = data.version || '';
        if (richEditor) richEditor.setMarkdown(richEditorBody(data.content));
        imageRename = null;
        attachmentNewName = '';
        return;
      }
      const nextContent = replaceMarkdownImagePath(
        editedContent,
        renamed.oldRelativePath,
        renamed.relativePath,
      );
      editedContent = nextContent;
      if (richEditor) richEditor.setMarkdown(richEditorBody(nextContent));
      if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
      isSaving = true;
      saveFailed = false;
      saveMessage = $localizedText.editor.saving;
      // The server rewrites the link in the file as well: the two edits are combined, not refused.
      const saved = await saveOrCombine(filePath, nextContent);
      if (loadedFilePath === filePath) {
        content = nextContent;
        markFileSaved(filePath, saved);
        saveMessage = $localizedText.editor.saved;
        lastSaved = Date.now();
        if (saveMessageTimeout) clearTimeout(saveMessageTimeout);
        saveMessageTimeout = setTimeout(() => {
          if (saveMessage === $localizedText.editor.saved) saveMessage = '';
        }, 3000);
        imageRename = null;
        attachmentNewName = '';
      }
    } catch (error) {
      console.error('Image rename failed:', error);
      formatToast = $localizedText.editor.imageRenameFailed;
      if (formatToastTimer) clearTimeout(formatToastTimer);
      formatToastTimer = setTimeout(() => formatToast = '', 3000);
    } finally {
      isSaving = false;
    }
  }

  async function loadFile() {
    if (!currentFile || currentFile.isDir) return;
    const filePath = currentFile.path;
    const fileName = currentFile.name;
    const requestId = ++loadRequestId;
    const previousFilePath = loadedFilePath;
    loadingFilePath = filePath;
    failedLoadPath = null;

    try {
      if (previousFilePath && previousFilePath !== filePath) {
        await savePendingLoadedFile(previousFilePath);
        if (!isCurrentLoad(requestId, filePath)) return;
      }
      isLoading = true;
      lockedConflictEntry = null;
      conflictCheckedFor = $conflictedNotes.has(filePath) ? filePath : null;
      // A locked note in conflict is not opened with its own passphrase screen: that would show this device's
      // version alone and let it be edited, while the other one waits unseen.
      if ($conflictedNotes.has(filePath)) {
        const entry = await fetchConflictEntry(filePath);
        if (!isCurrentLoad(requestId, filePath)) return;
        if (entry?.locked) {
          lockedConflictEntry = entry;
          lockedFilePath = null;
          loadedFilePath = filePath;
          displayedFile = { ...currentFile };
          title = fileName.replace('.md', '');
          editedTitle = title;
          content = '';
          editedContent = '';
          conflictCount = 0;
          deletedConflict = null;
          return;
        }
      }
      const data = await loadFileContent(filePath);
      if (!isCurrentLoad(requestId, filePath)) return;
      const nextContent = data.content;

      const nextFileInfo = await loadFileInfo(filePath);
      if (!isCurrentLoad(requestId, filePath)) return;
      const [nextBacklinks, nextConnections] = await Promise.all([
        fetchBacklinks(filePath),
        fetchConnections(filePath),
      ]);
      if (!isCurrentLoad(requestId, filePath)) return;

      // Known before the text is shown, so a note in conflict never opens editable for a moment.
      const conflictEntry = summarizeConflicts(nextContent).count > 0 || $conflictedNotes.has(filePath)
        ? await fetchConflictEntry(filePath)
        : null;
      if (!isCurrentLoad(requestId, filePath)) return;
      content = nextContent;
      editedContent = nextContent;
      if (hasRawHtml(nextContent)) {
        if (!rawForHtml) rawModeBeforeHtml = rawMode;
        rawMode = true;
        rawForHtml = true;
      } else if (rawForHtml) {
        rawMode = rawModeBeforeHtml;
        rawForHtml = false;
      }
      diskVersion = data.version || '';
      conflictCount = summarizeConflicts(nextContent).count;
      applyConflictEntry(conflictEntry);
      fileInfo = nextFileInfo;
      currentNoteColor = nextFileInfo.color || '';
      title = fileInfo.metadata?.title || fileName.replace('.md', '');
      editedTitle = title;
      editableTags = fileInfo.metadata?.tags || [];
      editableCategory = fileInfo.metadata?.category || '';
      backlinks = nextBacklinks;
      unlinkedMentions = nextConnections.mentions;
      neighborhood = nextConnections.graph;
      linkMentionFailed = false;
      loadedFilePath = filePath;
      lockedFilePath = null;
      displayedFile = { ...currentFile };
      dispatch('fileOpened', filePath);
      if ($focusNoteBody === filePath) {
        focusNoteBody.set(null);
        // The editor mounts after the loading state clears; wait for it, then put the caret in the text.
        tick().then(() => setTimeout(() => richEditor?.focusStart?.(), 0));
      }
    } catch (error) {
      if (!isCurrentLoad(requestId, filePath)) return;
      if (error?.status === 423) {
        // A locked note shows its passphrase form instead of its text. Nothing is loaded, so nothing is saved.
        lockedFilePath = filePath;
        loadedFilePath = null;
        failedLoadPath = filePath;
        return;
      }
      console.error('Failed to load file:', error);
      failedLoadPath = filePath;
      if (!displayedFile) {
        content = '';
        editedContent = '';
        title = '';
        editedTitle = '';
        fileInfo = null;
        currentNoteColor = '';
      }
      dispatch('fileDeleted');
    } finally {
      // Последний запрос завершает загрузку и тогда, когда пользователь уже
      // вернулся на открытую заметку: новой загрузки в этом случае не будет.
      // Без сброса loadingFilePath следующий клик по той же заметке тоже ничего
      // не загрузит, а панели останутся в inert.
      if (requestId === loadRequestId) {
        isLoading = false;
        loadingFilePath = null;
      }
    }
  }

  async function savePendingLoadedFile(filePath) {
    if (!filePath) return;
    flushEditorMarkdown();
    if (!hasUnsavedChanges() || isSaving) return;
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    if (saveMessageTimeout) clearTimeout(saveMessageTimeout);
    const savedContent = editedContent;

    try {
      isSaving = true;
      saveFailed = false;
      saveMessage = $localizedText.editor.saving;
      const saved = await saveOrCombine(filePath, savedContent);
      if (loadedFilePath === filePath && editedContent === savedContent) content = savedContent;
      markFileSaved(filePath, saved);
    } catch (error) {
      console.error('Save before note switch failed:', error);
      // A failed save stays visible until a later save succeeds: the text is not on disk.
      saveMessage = saveFailureMessage(error);
      saveFailed = true;
    } finally {
      isSaving = false;
    }
  }

  function scheduleAutosave() {
    if (!loadedFilePath || !hasUnsavedChanges() || isSaving) return;
    if (autosaveTimer) return;
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      void saveContent();
    }, AUTOSAVE_DELAY);
  }

  /**
   * Write whatever the editor still holds before the window goes away. The
   * autosave timer would otherwise be dropped with the page, taking the last
   * edits (up to AUTOSAVE_DELAY old) with it. Waits briefly for a save already
   * in flight, then saves through the same guarded path as autosave.
   */
  async function flushPendingEdits() {
    flushEditorMarkdown();
    const deadline = Date.now() + 3000;
    while (isSaving && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (hasUnsavedChanges() && !isSaving) await saveContent();
  }

  /**
   * Apply per-region choices made in the conflict view.
   *
   * The result is composed from the raw file text, never from the editor, so
   * everything outside a conflict survives byte-for-byte. The backend writes it
   * and stages the path so git can finish the merge.
   */
  const baseFor = (filePath) => (loadedFilePath === filePath ? diskVersion : '');

  /**
   * Save, and when a sync changed the file since this editor read it, combine the two instead of writing
   * over the other device's edit: parts changed on one side are taken, parts changed on both become a
   * conflict to resolve. `content` is the text the edit started from.
   */
  async function saveOrCombine(filePath, text) {
    try {
      return await saveFileContent(filePath, text, baseFor(filePath));
    } catch (error) {
      if (error?.status !== 409 || !error.body?.changed) throw error;
      // The marker lines carry the device names too, so the file itself says whose each side is.
      const sides = error.body.sides || null;
      const merged = mergeThreeWay(content, text, error.body.content, {
        ours: sides?.ours?.device || 'this device',
        theirs: sides?.theirs?.device || 'synced',
      });
      const saved = await saveFileContent(filePath, merged.text, error.body.version);
      if (loadedFilePath === filePath) {
        content = merged.text;
        // Typing that arrived while the save was out is not dropped: it is applied on top only if nothing else changed.
        editedContent = editedContent === text ? merged.text : editedContent;
        diskVersion = saved?.version || '';
        conflictCount = summarizeConflicts(content).count;
        if (conflictCount > 0) conflictSides = sides;
        const other = sides?.theirs?.device || '';
        showToast(conflictCount > 0 ? $localizedText.editor.syncedWhileOpenConflict(other) : $localizedText.editor.syncedWhileOpenMerged(other), 7000);
      }
      void refreshConflicts();
      return saved;
    }
  }

  /** After a sync: the open note reads its file again, unless it holds edits not yet saved (those combine on save). */
  async function reloadAfterPull() {
    const filePath = loadedFilePath;
    if (!filePath || hasUnsavedChanges() || isSaving) return;
    let data;
    try {
      data = await loadFileContent(filePath);
    } catch (error) {
      if (error?.status === 404 && loadedFilePath === filePath) {
        showToast($localizedText.editor.deletedElsewhere, 7000);
        dispatch('goHome');
      }
      return;
    }
    if (loadedFilePath !== filePath || hasUnsavedChanges() || isSaving || !data?.version || data.version === diskVersion) return;
    content = data.content;
    editedContent = data.content;
    diskVersion = data.version;
    conflictCount = summarizeConflicts(data.content).count;
    applyConflictEntry(conflictCount > 0 || $conflictedNotes.has(filePath) ? await fetchConflictEntry(filePath) : null);
    try {
      fileInfo = await loadFileInfo(filePath);
      editableTags = fileInfo.metadata?.tags || [];
      editableCategory = fileInfo.metadata?.category || '';
      currentNoteColor = fileInfo.color || '';
    } catch { /* the text is what matters; details refresh on the next open */ }
  }

  /** This note's entry in the server's conflict list, or null. */
  async function fetchConflictEntry(filePath) {
    try {
      const list = await (await fetch('/api/git/conflicts')).json();
      return (Array.isArray(list) ? list : []).find((entry) => conflictNotePath(entry?.path) === filePath) || null;
    } catch {
      return null;
    }
  }

  function applyConflictEntry(entry) {
    conflictSides = entry?.sides || null;
    deletedConflict = entry && !entry.binary && (!entry.oursExists || !entry.theirsExists)
      ? { deletedHere: !entry.oursExists }
      : null;
  }

  async function loadConflictSides(filePath) {
    const entry = await fetchConflictEntry(filePath);
    if ((loadedFilePath || currentFile?.path) === filePath) applyConflictEntry(entry);
  }

  /** A locked note's conflict: keep one sealed side whole, or save the merged text (sealed by the server). */
  async function resolveLockedConflict(body) {
    const filePath = loadedFilePath || currentFile?.path;
    if (!filePath || resolvingDeleted) return;
    resolvingDeleted = true;
    try {
      const response = await fetch('/api/git/resolve-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, ...body }),
      });
      const answer = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(answer.detail || `HTTP ${response.status}`);
      lockedConflictEntry = null;
      await sendResolution(Boolean(body.keep));
      await loadFile();
    } catch (error) {
      showToast($localizedText.editor.conflictFailed(error?.message || String(error)), 7000);
    } finally {
      resolvingDeleted = false;
    }
  }

  /** Keep the note or let the deletion stand (ConflictDeletedView), then send the result. */
  async function resolveDeletedConflict(event) {
    const filePath = loadedFilePath || currentFile?.path;
    if (!filePath || resolvingDeleted) return;
    resolvingDeleted = true;
    try {
      const response = await fetch('/api/git/resolve-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, keep: event.detail.side }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || `HTTP ${response.status}`);
      deletedConflict = null;
      void refreshConflicts();
      if (body.removed) {
        dispatch('goHome');
        await sendResolution(false);
        showToast($localizedText.editor.conflictDeletedDone, 7000);
        return;
      }
      await sendResolution(false);
      await reloadAfterPull();
    } catch (error) {
      showToast($localizedText.editor.conflictFailed(error?.message || String(error)), 7000);
    } finally {
      resolvingDeleted = false;
    }
  }

  function showToast(message, ms = 3000) {
    formatToast = message;
    if (formatToastTimer) clearTimeout(formatToastTimer);
    formatToastTimer = setTimeout(() => formatToast = '', ms);
  }

  /**
   * A resolved conflict is only half done until the other devices have it. When sync sends changes on its
   * own, the result goes out now; otherwise the person is told when it will.
   */
  async function sendResolution(whole) {
    const kept = whole ? ` ${$localizedText.editor.conflictWholeKeptDone}` : '';
    // Nothing goes out while another note is still in conflict: say how many are left instead.
    await refreshConflicts();
    const left = $conflictedNotes.size + $conflictedFiles.size;
    if (left > 0) {
      showToast($localizedText.editor.conflictResolvedWaiting(left) + kept, 7000);
      return;
    }
    if (!uploadsChanges()) {
      showToast($localizedText.editor.conflictResolvedManual + kept, 7000);
      return;
    }
    let sent = false;
    let newConflict = false;
    try {
      const response = await fetch('/api/git/sync', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      sent = response.ok && !data.conflicts;
      newConflict = response.ok && Boolean(data.conflicts);
    } catch {
      sent = false;
    }
    await refreshConflicts();
    if (newConflict) {
      // The sync brought another conflict along: that is the news, not "it goes out later".
      showToast($localizedText.editor.conflictResolvedNewConflict + kept, 7000);
      return;
    }
    if (sent) void reloadAfterPull();
    showToast((sent ? $localizedText.editor.conflictResolvedSent : $localizedText.editor.conflictResolvedLater) + kept, 7000);
  }

  async function applyConflictResolution(event) {
    const filePath = loadedFilePath || currentFile?.path;
    if (!filePath) return;
    const choices = event.detail?.choices || {};
    let next = editedContent;
    // From the last part back: resolving a part removes it, so the parts after it would move up one
    // place and a choice made for them would land on the wrong part, or on none.
    const ordered = Object.entries(choices).map(([index, choice]) => [Number(index), choice]).sort((a, b) => b[0] - a[0]);
    for (const [index, choice] of ordered) {
      next = resolveRegion(next, index, choice);
    }
    if (next === editedContent) return;

    conflictNotice = $localizedText.editor.conflictSaving;
    try {
      const response = await fetch('/api/git/resolve-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: next }),
      });
      const answer = response.ok ? {} : await response.json().catch(() => ({}));
      // Git has no say over this note in two cases, and then the resolved text is saved as an ordinary edit.
      // 409: git has no conflict for this note, but its text still holds markers (left over from an earlier
      // merge). 400 "Git not initialized": there is no repository at all, the default for a local vault; the
      // markers were then written by the app itself, when the file changed on disk between reading and saving.
      const noGitConflict = response.status === 409 || (response.status === 400 && answer.detail === 'Git not initialized');
      if (!response.ok && !noGitConflict) throw new Error(answer.detail || `HTTP ${response.status}`);
      void refreshConflicts();
      await saveFileContent(filePath, next);
      editedContent = next;
      content = next;
      conflictCount = summarizeConflicts(next).count;
      if (conflictCount > 0) {
        conflictNotice = $localizedText.editor.conflictPartlyResolved(conflictCount);
      } else {
        conflictNotice = '';
        await sendResolution(Boolean(event.detail?.whole));
      }
    } catch (error) {
      conflictNotice = $localizedText.editor.conflictFailed(error?.message || String(error));
    }
  }

  // One line for six different refusals said nothing: the server named the reason, and it was thrown away.
  // The code in the answer says which 403 it is, so a request from another address is not blamed on the path.
  function saveFailureMessage(error) {
    const reason = $localizedText.editor.saveFailedReason(error?.status, error?.body?.code);
    return reason ? `${$localizedText.editor.saveFailed}: ${reason}` : $localizedText.editor.saveFailed;
  }

  async function saveContent() {
    const filePath = loadedFilePath || currentFile?.path;
    if (!filePath) return;
    flushEditorMarkdown();
    if (!hasUnsavedChanges() || isSaving) return;
    // A note with conflict markers cannot survive the editor round-trip: `marked`
    // turns the `=======` separator into a setext underline and the markers are
    // gone. Saving would write that damage over the file, so refuse instead.
    if (inConflict) return;

    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    if (saveMessageTimeout) clearTimeout(saveMessageTimeout);
    // With "tabs to spaces" on, the editor's text is normalised first, so what it holds is what the file holds.
    const normalizedTabs = replaceTabs(editedContent, get(tabsToSpaces));
    if (normalizedTabs !== editedContent) editedContent = normalizedTabs;
    const savedContent = editedContent;
    const savedTitle = editedTitle;

    try {
      isSaving = true;
      saveFailed = false;
      saveMessage = $localizedText.editor.saving;
      const saved = await saveOrCombine(filePath, savedContent);

      if (loadedFilePath === filePath && editedContent === savedContent) content = savedContent;
      if (loadedFilePath === filePath && editedTitle === savedTitle) title = savedTitle;
      markFileSaved(filePath, saved);
      saveMessage = $localizedText.editor.saved;
      lastSaved = Date.now();
      saveMessageTimeout = setTimeout(() => {
        if (saveMessage === $localizedText.editor.saved) saveMessage = '';
      }, 3000);
    } catch (error) {
      // Stays on screen until the next save succeeds; the text is still in the editor.
      saveMessage = saveFailureMessage(error);
      saveFailed = true;
      console.error('Save failed:', error);
    } finally {
      isSaving = false;
      if (hasUnsavedChanges()) scheduleAutosave();
    }
  }

  function handleKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      saveContent();
    }
  }

  $: editedContent, editedTitle, isSaving, scheduleAutosave();

  $: if (fileInfo) editedTitle, scheduleMetadataSave();

  /** Теги вводятся через запятую — формат тот же, что у Obsidian. */
  // Теги — чипами: Enter или запятая добавляют, Backspace в пустом поле убирает последний.
  function addTagsFromDraft() {
    const incoming = tagDraft.split(',').map((tag) => tag.trim()).filter(Boolean);
    tagDraft = '';
    const merged = [...editableTags];
    for (const tag of incoming) if (!merged.includes(tag)) merged.push(tag);
    if (merged.length === editableTags.length) return;
    editableTags = merged;
    void saveMetadataFields();
  }

  // Tags already in use, offered under the field so a tag is picked rather than remembered (and typed
  // the same way every time). Loaded when the panel opens; filtered by what is being typed.
  let knownTags = [];
  async function loadKnownTags() {
    try {
      const tags = await loadTagsRequest();
      knownTags = (Array.isArray(tags) ? tags : []).map((tag) => (typeof tag === 'string' ? tag : tag?.name)).filter(Boolean);
    } catch {
      knownTags = [];
    }
  }
  $: if (propertyPanel === 'tags') void loadKnownTags();
  $: tagQuery = tagDraft.split(',').pop().trim().toLowerCase();
  $: offeredTags = knownTags
    .filter((tag) => !editableTags.includes(tag) && (!tagQuery || tag.toLowerCase().includes(tagQuery)))
    .slice(0, 12);

  function addTag(tag) {
    if (!tag || editableTags.includes(tag)) return;
    const parts = tagDraft.split(',');
    parts.pop();
    tagDraft = parts.join(',');
    editableTags = [...editableTags, tag];
    void saveMetadataFields();
  }

  function removeTag(tag) {
    editableTags = editableTags.filter((item) => item !== tag);
    void saveMetadataFields();
  }

  function onTagDraftKeydown(event) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTagsFromDraft();
    } else if (event.key === 'Backspace' && !tagDraft && editableTags.length) {
      removeTag(editableTags[editableTags.length - 1]);
    }
  }

  function togglePinned() {
    const pinning = !noteIsPinned();
    editedContent = setFrontmatterKey(editedContent, 'pinned', pinning ? 'true' : '');
    markPinned(currentFile?.path, pinning, editedTitle);
    void saveMetadataFields();
    // The effect is on the board and in the sidebar, not here: say where to look.
    showToast(pinning ? $localizedText.editor.pinnedToast : $localizedText.editor.unpinnedToast);
  }

  // The note's folder is where its file is: this button shows it and moves the note. (The `category` key in a
  // note's properties is a separate label from older versions; it is left as it is.)
  const folderOf = (notePath) => {
    const parts = String(notePath || '').replace(/^notes\//, '').split('/');
    parts.pop();
    return parts.join('/');
  };
  const folderLabel = (folder) => (folder
    ? folder.split('/').map((part, index) => (index === 0 ? displayFolderName(part, $localizedText) : part)).join(' / ')
    : $localizedText.editor.noFolder);
  $: currentFolder = folderOf(loadedFilePath || currentFile?.path);
  $: currentFolderLabel = folderLabel(currentFolder);

  // The path of the document itself: the folders it lies in and the note at the end of them.
  const pathLabel = (notePath, text) => {
    const parts = String(notePath || '').replace(/^notes\//, '').split('/').filter(Boolean);
    const name = (parts.pop() || '').replace(/\.md$/, '');
    const folder = parts.map((part, index) => (index === 0 ? displayFolderName(part, text) : part)).join(' / ');
    return folder ? `${folder} / ${name}` : name;
  };
  $: currentPathLabel = pathLabel(loadedFilePath || currentFile?.path, $localizedText);

  // The hints of the property buttons: the name of the field and, if it has one, its value.
  $: tagsLabel = editableTags.length
    ? `${$localizedText.editor.propertyTags}: ${editableTags.map((tag) => `#${tag}`).join(' ')}`
    : $localizedText.editor.propertyTags;
  $: dueFieldLabel = dueDate ? `${$localizedText.editor.propertyDue}: ${dueLabelOf}` : $localizedText.editor.propertyDue;
  $: propertiesLabel = customProperties.length
    ? `${$localizedText.properties.title}: ${customProperties.length}`
    : $localizedText.properties.title;
  let folderOptions = [];

  async function loadFolderOptions() {
    try {
      const folders = await loadDirectoriesRequest();
      folderOptions = (Array.isArray(folders) ? folders : []).map((raw) => ({ name: folderLabel(raw), raw, count: 0 }));
    } catch {
      folderOptions = [];
    }
  }

  async function moveToFolder(event) {
    const filePath = loadedFilePath || currentFile?.path;
    const typed = String(event.detail || '').trim();
    if (!filePath || !typed) return;
    const known = folderOptions.find((option) => option.name.toLowerCase() === typed.toLowerCase());
    const target = known ? known.raw : typed.replace(/\s*\/\s*/g, '/').replace(/^\/+|\/+$/g, '');
    if (target === currentFolder) return;
    const name = filePath.split('/').pop();
    try {
      await flushPendingEdits();
      if (!known) await createFolderRequest(`notes/${target}`);
      await moveItemRequest(filePath, target ? `notes/${target}` : 'notes');
      propertyPanel = null;
      const nextPath = target ? `notes/${target}/${name}` : `notes/${name}`;
      dispatch('renamed', { path: nextPath, name, isDir: false });
      showToast($localizedText.editor.movedToFolder(folderLabel(target)));
    } catch (error) {
      showToast(error?.status === 409 ? $localizedText.editor.moveExists(folderLabel(target)) : $localizedText.editor.moveFailed, 5000);
    }
  }

  async function loadCategorySuggestions() {
    try {
      categorySuggestions = await loadCategoriesRequest();
    } catch (error) {
      // Без подсказок поле продолжает работать как обычное текстовое.
      console.error('Failed to load category suggestions:', error);
      categorySuggestions = [];
    }
  }

  function commitCategory(event) {
    editableCategory = event.detail;
    void saveMetadataFields();
  }

  async function saveMetadataFields() {
    // A note in conflict is not written: the rewrite would drop the merge markers in its properties.
    if (!currentFile || !fileInfo || !hasMetadataChanges() || inConflict) return;
    if (metadataTimer) clearTimeout(metadataTimer);
    // Срок не передаём: он уже стоит в тексте, и его строка сохраняется как есть.
    const nextContent = upsertFrontmatter(editedContent, {
      title: editedTitle,
      category: editableCategory,
      tags: editableTags,
      pinned: noteIsPinned(),
    });
    if (nextContent !== editedContent) editedContent = nextContent;

    const filePath = currentFile.path;
    const payload = { title: editedTitle, tags: editableTags, content: nextContent, base_version: baseFor(filePath) };
    try {
      const meta = await saveFileMetadata(filePath, payload);
      if (currentFile?.path !== filePath) return;

      title = meta.title || title;
      if (Array.isArray(meta.tags)) editableTags = meta.tags;
      fileInfo = {
        ...fileInfo,
        metadata: {
          ...(fileInfo.metadata || {}),
          title: meta.title || '',
          category: meta.category || '',
          tags: Array.isArray(meta.tags) ? meta.tags : editableTags,
          pinned: Boolean(parseFrontmatter(meta.content || nextContent).pinned),
        },
      };

      if (meta.content && editedContent === nextContent) {
        content = meta.content;
        editedContent = meta.content;
      }
      if (meta.version) diskVersion = meta.version;
    } catch (e) {
      // A sync changed the note since it was read: the property change is combined with it like any edit.
      if (e?.status === 409 && e.body?.changed) {
        try {
          markFileSaved(filePath, await saveOrCombine(filePath, nextContent));
        } catch (error) {
          console.error('Metadata save failed:', error);
        }
        return;
      }
      console.error('Metadata save failed:', e);
    }
  }

  function scheduleMetadataSave() {
    if (!fileInfo || !hasMetadataChanges()) return;
    if (metadataTimer) clearTimeout(metadataTimer);
    metadataTimer = setTimeout(saveMetadataFields, METADATA_DELAY);
  }

  // The note goes to the trash at once: the move is reversible, and the app's notice offers to undo it.
  async function deleteFile() {
    const filePath = currentFile?.path;
    if (!filePath || isDeleting) return;
    const note = trashedNote(filePath, currentFile?.name);
    try {
      isDeleting = true;
      await deleteFileRequest(filePath);
      announceTrashed([note]);
      if (currentFile?.path === filePath || loadedFilePath === filePath) {
        dispatch('fileDeleted');
        dispatch('syncComplete');
      }
    } catch (error) {
      saveMessage = $localizedText.editor.deleteError(error.message);
    } finally {
      isDeleting = false;
    }
  }

  function handleOutlineNavigate(event) {
    const { text, occurrence = 0 } = event.detail || {};
    outlineOpen = false;
    if (!text || !richEditor) return;
    if (!richEditor.scrollToHeadingText?.(text, occurrence)) {
      // fallback: попробуем найти по anchor id, если рендерер когда-то добавит
      const target = document.getElementById(event.detail.anchor || '');
      if (target) target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    }
  }

  async function setNoteColor(color) {
    if (!currentFile?.path || isColorSaving) return;
    const filePath = currentFile.path;
    const nextColor = color || '';
    try {
      isColorSaving = true;
      await setItemColorRequest(filePath, nextColor || null);
      if (currentFile?.path !== filePath || loadedFilePath !== filePath) return;
      currentNoteColor = nextColor;
      fileInfo = fileInfo ? { ...fileInfo, color: nextColor || null } : fileInfo;
      dispatch('noteColorChanged', { path: filePath, color: nextColor || null });
    } catch (error) {
      console.error('Failed to recolor note:', error);
    } finally {
      isColorSaving = false;
    }
  }

  function hasUnsavedChanges() {
    return editedContent !== content || editedTitle !== title;
  }

  $: editorState.set({
    path: currentFile?.path || null,
    dirty: hasUnsavedChanges(),
    saving: isSaving,
  });

  // The desktop shell asks the page to flush before it closes the window; see
  // electron/main.cjs. Components are not destroyed on window close, so this hook
  // is the only chance to save then.
  onMount(() => {
    window.monosFlushPendingEdits = flushPendingEdits;
    // In a browser, leaving the page with unsaved text asks first. The desktop shell
    // saves before it closes, and a prompt there would keep the window from closing.
    const inDesktopShell = /Electron\//.test(navigator.userAgent);
    const warnBeforeLeaving = (event) => {
      if (!hasUnsavedChanges() || isSaving) return;
      event.preventDefault();
      event.returnValue = '';
    };
    if (!inDesktopShell) window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => {
      if (!inDesktopShell) window.removeEventListener('beforeunload', warnBeforeLeaving);
      if (window.monosFlushPendingEdits === flushPendingEdits) delete window.monosFlushPendingEdits;
    };
  });

  // Rename coordination (lib/note-refresh.js): save before the sidebar renames a file,
  // and reload when the server rewrote links in the note that is open.
  onMount(() => {
    const flushOnRequest = (event) => event.detail.pending.push(flushPendingEdits());
    const reloadIfRewritten = (event) => {
      if (loadedFilePath && event.detail.updatedPaths.includes(loadedFilePath)) loadFile();
    };
    const reloadOnPull = () => { void reloadAfterPull(); };
    window.addEventListener(FLUSH_OPEN_NOTE_EVENT, flushOnRequest);
    window.addEventListener(NOTE_LINKS_UPDATED_EVENT, reloadIfRewritten);
    window.addEventListener(NOTES_PULLED_EVENT, reloadOnPull);
    return () => {
      window.removeEventListener(FLUSH_OPEN_NOTE_EVENT, flushOnRequest);
      window.removeEventListener(NOTE_LINKS_UPDATED_EVENT, reloadIfRewritten);
      window.removeEventListener(NOTES_PULLED_EVENT, reloadOnPull);
    };
  });

  onDestroy(() => {
    flushEditorMarkdown();
    // Leaving the note in focus mode gives the sidebar back as it was.
    if (focusMode && sidebarBeforeFocus !== null) setSidebarOpen(sidebarBeforeFocus);
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    // Same guard as saveContent: a note with conflict markers must not be written
    // back from the editor, where the markers no longer survive the round-trip.
    if (loadedFilePath && hasUnsavedChanges() && !isSaving && !inConflict) {
      const filePath = loadedFilePath;
      const savedContent = editedContent;
      const savedTitle = editedTitle;
      isSaving = true;
      saveOrCombine(filePath, savedContent).then((saved) => {
        if (loadedFilePath === filePath && editedContent === savedContent) content = savedContent;
        if (loadedFilePath === filePath && editedTitle === savedTitle) title = savedTitle;
        markFileSaved(filePath, saved);
        lastSaved = Date.now();
      }).catch((error) => {
        console.error('Save on destroy failed:', error);
      }).finally(() => {
        isSaving = false;
      });
    }
    editorState.set({ path: null, dirty: false, saving: false });
  });

  $: {
    const { words, readingMinutes } = wordStats(editedContent);
    wordCharStats = words === 0
      ? $localizedText.editorHeader.stats.empty
      : `${$localizedText.editorHeader.stats.words(words)}, ${$localizedText.editorHeader.stats.readingMinutes(readingMinutes)}`;
  }

  $: taskProgress = taskProgressOf(editedContent);
  // Логика читает содержимое напрямую: `$:`-переменная пересчитывается позже
  // текущего блока, и снятие закрепления успевало записать старое значение
  // обратно. Шаблон же должен видеть реактивную переменную — обычную функцию
  // Svelte не пересчитывает, и кнопка не перерисовывалась до перезагрузки.
  function noteIsPinned() {
    return Boolean(parseFrontmatter(editedContent).pinned);
  }
  $: pinnedNow = Boolean(parseFrontmatter(editedContent).pinned);

  // A pin changed anywhere else (the sidebar, the board) reaches the open note at once: its text and the saved
  // baseline take the new flag together, so the note neither shows the old state nor writes it back.
  function followPinEvent(event) {
    if (!event || !loadedFilePath) return;
    if (String(event.path).replace(/^notes\//, '') !== String(loadedFilePath).replace(/^notes\//, '')) return;
    if (noteIsPinned() === event.pinned) return;
    const value = event.pinned ? 'true' : '';
    editedContent = setFrontmatterKey(editedContent, 'pinned', value);
    content = setFrontmatterKey(content, 'pinned', value);
    if (fileInfo?.metadata) fileInfo = { ...fileInfo, metadata: { ...fileInfo.metadata, pinned: event.pinned } };
  }
  // A subscription, not a `$:` statement: the note's own reactive marks must run after the change, not in the same pass.
  onMount(() => pinEvents.subscribe(followPinEvent));

  // A favourite is a property of the note (lib/favorites.js); the list of them is its own page.
  $: favoriteNow = isFavoriteProperties(fileInfo?.properties);
  async function toggleFavorite() {
    if (!loadedFilePath || inConflict) return;
    const on = !favoriteNow;
    try {
      await flushOpenNote();
      await setFavoriteRequest(loadedFilePath, on);
      await loadFile();
      showToast(on ? $localizedText.editor.favoriteToast : $localizedText.editor.unfavoriteToast);
    } catch (error) {
      console.error('Failed to change the favourite mark:', error);
      showToast($localizedText.properties.saveFailed);
    }
  }

  $: if (currentFile?.path && !currentFile.isDir && currentFile.path !== loadedFilePath && currentFile.path !== loadingFilePath && currentFile.path !== failedLoadPath) loadFile();
  $: visibleFile = displayedFile || currentFile;

  let ignoreRichUpdate = false;
  $: richContentForEditor = richEditorBody(editedContent);

  $: if (richEditor && !ignoreRichUpdate) {
    const md = richEditor.getMarkdown();
    if (md !== richContentForEditor) {
      richEditor.setMarkdown(richContentForEditor);
    }
  }

  // The note's colour belongs to its header, as on its card: a tint and a soft glow behind the title.
  // The page the text is written on stays the theme's own, so the colour never sits under every line.
  // Focus mode narrows the column and drops the colour: only the text being written is left.
  const NEUTRAL_PAGE = '--note-page-bg: var(--bg-primary); --note-page-panel: var(--bg-primary); --note-page-border: var(--border-subtle);';
  // The Structure column sits beside the text but not beside the header: the header leaves the same room, so the
  // title and the text are centred on one axis.
  $: outlineInset = wideWindow && !focusMode && !inConflict && outlineColumnShown ? `min(${$outlineWidth}px, 45vw)` : '0px';
  $: noteSurfaceStyle = `--outline-inset: ${outlineInset}; ${surfaceStyle}`;
  $: surfaceStyle = focusMode
    ? `--content-width: 48rem; ${NEUTRAL_PAGE}`
    : currentNoteColor
    ? `${NEUTRAL_PAGE} --note-accent: ${currentNoteColor}; --note-header-tint: color-mix(in srgb, ${currentNoteColor} 13%, transparent); --note-header-glow: color-mix(in srgb, ${currentNoteColor} 18%, transparent);`
    : NEUTRAL_PAGE;

  $: if ($editorAction && currentFile) {
    const action = $editorAction;
    editorAction.set(null);
    if (action === 'delete') void deleteFile();
  }
</script>

<svelte:window on:pointerdown={closePopoversOnPress} on:keydown={closePopoversOnEscape} />

<div
  class="h-full flex flex-col bg-[var(--note-page-bg)] overflow-hidden relative min-h-0"
  style={noteSurfaceStyle}
  data-testid="editor-shell"
>
  {#if lockedFilePath}
    <div class="absolute inset-0 z-40 flex items-center justify-center bg-[var(--note-page-bg)] p-6" data-testid="locked-overlay">
      <LockedNote filePath={lockedFilePath} on:unlocked={() => loadFile()} />
    </div>
  {/if}
  <EditorHeader
    bind:editedTitle
    currentFile={visibleFile}
    {fileInfo}
    syncInfo={$syncState}
    {wordCharStats}
    {taskProgress}
    outlineOpen={wideWindow ? outlineColumnShown : outlineOpen}
    onToggleOutline={toggleOutline}
    outlineAvailable={!inConflict}
    titleLocked={inConflict}
    compact={headerCompact || focusMode}
    {focusMode}
    onExitFocus={() => setFocusMode(false)}
    onBack={() => dispatch('goHome')}
    onTitleInput={() => { titleTouched = true; }}
    onCommitTitle={commitTitle}
    onFinishTitle={finishTitle}
  />

  {#if showHistory && historyNote?.path}
    {#await import('./NoteHistoryModal.svelte') then historyModal}
      <svelte:component
        this={historyModal.default}
        notePath={(historyNote.path || '').replace(/^notes\//, '')}
        on:close={() => { showHistory = false; }}
        on:openSettings={() => { showHistory = false; dispatch('openSettings'); }}
        on:restored={async () => { if (loadedFilePath) await loadFile(); }}
      />
    {/await}
  {/if}
  <div class="border-b border-[var(--note-page-border)]"></div>
  <!-- Content Area -->
  {#if isLoading && !displayedFile}
    <div class="flex-1 flex items-center justify-center">
      <span class="text-xs uppercase tracking-widest motion-safe:animate-pulse">{$localizedText.editor.gatheringThoughts}</span>
    </div>
  {:else}
    <div class="flex-1 flex min-w-0 min-h-0">
      <div class="flex-1 flex flex-col min-w-0 min-h-0">
        {#if lockedConflictEntry}
          <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-12 lg:py-8" data-testid="conflict-surface">
            <div class="mx-auto max-w-[var(--content-width,56rem)]">
              <LockedConflictView
                filePath={loadedFilePath}
                sides={lockedConflictEntry.sides}
                busy={resolvingDeleted}
                on:keep={(event) => resolveLockedConflict({ keep: event.detail.side })}
                on:resolveText={(event) => resolveLockedConflict({ content: event.detail.content })}
              />
            </div>
          </div>
        {:else if deletedConflict}
          <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-12 lg:py-8" data-testid="conflict-surface">
            <div class="mx-auto max-w-[var(--content-width,56rem)]">
              <ConflictDeletedView
                content={editedContent}
                deletedHere={deletedConflict.deletedHere}
                otherDevice={conflictSides?.theirs?.device || ''}
                busy={resolvingDeleted}
                on:keep={resolveDeletedConflict}
              />
            </div>
          </div>
        {:else if conflictCount > 0}
          <!-- The conflict sits in the same column as the text: the banner says what happened and the parts
               below are where it is resolved, right here. -->
          <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-12 lg:py-8" data-testid="conflict-surface">
            <div class="mx-auto max-w-[var(--content-width,56rem)] space-y-4">
              <div class="rounded-ui border border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-3">
                <p class="text-sm font-bold text-[var(--red)]">{$localizedText.editor.conflictTitle}</p>
                <p class="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {$localizedText.editor.conflictHint}
                </p>
                <p class="mt-1 text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">
                  {$localizedText.editor.conflictCount(conflictCount)}
                </p>
                {#if conflictNotice}
                  <p class="mt-1 text-[length:var(--text-whisper)] text-[var(--text-primary)]">{conflictNotice}</p>
                {/if}
              </div>
              <ConflictNoteView content={editedContent} sides={conflictSides} on:resolve={applyConflictResolution} />
            </div>
          </div>
        {:else if rawMode}
          <div class="flex h-full min-h-0 flex-col">
          {#if rawForHtml}
            <p class="shrink-0 border-b border-[var(--border-subtle)] px-4 py-2 text-[length:var(--text-whisper-lg)] leading-relaxed text-[var(--text-secondary)] lg:px-12" data-testid="raw-html-notice">{$localizedText.editor.rawHtmlNotice}</p>
          {/if}
          <textarea
            data-testid="raw-source"
            class="min-h-0 w-full flex-1 resize-none bg-transparent px-4 py-4 font-mono text-[length:var(--editor-font-size,16px)] leading-[var(--line-height,1.625)] text-[var(--text-primary)] outline-none lg:px-12 lg:py-10"
            placeholder={isLoading ? '' : $localizedText.editor.beginWriting}
            spellcheck="false"
            bind:value={editedContent}
          />
          </div>
        {:else}
        <RichEditor
          bind:this={richEditor}
          content={richContentForEditor}
          editable={true}
          placeholder={isLoading ? '' : $localizedText.editor.beginWriting}
          notePath={visibleFile?.path}
          onImageFile={handleImageFile}
          onDocumentFile={handleDocumentFile}
          resolveImageSrc={resolveEditorImageSrc}
          resolveImagePath={resolveEditorImagePath}
          onUpdate={(md) => { ignoreRichUpdate = true; editedContent = replaceFrontmatterBody(editedContent, md); ignoreRichUpdate = false; }}
          on:imageClick={openImageRename}
          on:openNote={(event) => openLinkedNote(event.detail)}
          on:scrolled={(event) => updateHeaderCompact(event.detail)}
          on:createLinkedNote={(event) => createLinkedNote(event.detail)}
        />
        {/if}
      </div>
      <!-- No outline over a conflict: the merge markers would read as Markdown headings and list both
           versions of a title as if they were the note's structure. -->
      {#if !focusMode && !inConflict}
        <OutlinePanel
          content={editedContent}
          open={outlineOpen}
          collapsed={outlineCollapsed}
          on:navigate={handleOutlineNavigate}
          on:close={() => { if (wideWindow) toggleOutline(); else outlineOpen = false; }}
        />
      {/if}
    </div>
  {/if}

  {#if displayedFile && !displayedFile.isDir && !focusMode}
    <!-- Нижняя панель: свойства заметки открываются окошками над ней, поэтому текст
         не сдвигается. Во время загрузки следующей заметки панель inert: её контролы
         относятся к запрошенной заметке, а текст ещё от прежней. -->
    <div class="relative flex h-11 shrink-0 items-center gap-2 max-sm:h-auto max-sm:gap-0 max-sm:py-1 border-t border-[var(--note-page-border)] bg-[var(--note-page-panel)] px-2 sm:px-4" data-testid="editor-footer" inert={isLoading}>
      <!-- In a conflict the properties are part of what is being resolved: they wait, dimmed, until it is. -->
      <div class="flex min-w-0 flex-1 items-center gap-2 transition-opacity" class:opacity-40={inConflict} data-testid="note-properties" inert={isLoading || inConflict} title={inConflict ? $localizedText.editor.conflictPropertiesLocked : undefined}>
        <div class="relative min-w-0 sm:flex-1" data-panel-anchor="category">
          <button
            type="button"
            bind:this={propertyTriggers.category}
            data-testid="property-category-button"
            aria-haspopup="dialog"
            aria-expanded={propertyPanel === 'category'}
            aria-label={`${$localizedText.editor.propertyCategory}: ${currentPathLabel}`}
            class="inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-ui px-2 text-xs transition max-sm:h-auto max-sm:min-h-11 max-sm:min-w-11 max-sm:flex-col max-sm:justify-center max-sm:gap-0.5 max-sm:px-1 hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] hover:text-[var(--text-primary)] {propertyPanel === 'category' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
            on:click={() => togglePropertyPanel('category')}
          >
            <Folder size="14" strokeWidth="1.7" aria-hidden="true" />
            <span class="whitespace-nowrap text-[length:var(--text-whisper)] leading-none sm:hidden">{$localizedText.editor.footerShort.folder}</span>
            <span class="hidden min-w-0 truncate sm:inline">{currentPathLabel}</span>
          </button>
          {#if propertyPanel === 'category'}
            <div use:focusFirstControl role="dialog" aria-label={$localizedText.editor.propertyCategory} data-testid="property-panel" data-panel="category" class={panelClass}>
              <p class={panelLabelClass}>{$localizedText.editor.propertyCategory}</p>
              <CategoryInput
                value={currentFolderLabel}
                suggestions={folderOptions}
                placeholder={$localizedText.editor.folderPlaceholder}
                label={$localizedText.editor.propertyCategory}
                listLabel={$localizedText.editor.folderSuggestions}
                testid="property-category"
                on:open={loadFolderOptions}
                on:commit={moveToFolder}
              />
              <p class="mt-2 max-w-[16rem] text-[length:var(--text-whisper)] leading-relaxed text-[var(--text-tertiary)]">{$localizedText.editor.folderHint}</p>
            </div>
          {/if}
        </div>

        <!-- Надпись о сохранении стоит слева от иконок, а не между ними: она длинная и в ряд с кнопками
             раздвигала их. Пока надписи нет, она не занимает место: пустой элемент в ряду с отступами
             раздвигает иконки вдвое. На телефоне места в ряду нет вовсе — там надпись ложится полосой
             над нижней панелью, как окошки свойств. -->
        <p role="status" aria-live="polite" class="flex items-center gap-2 whitespace-nowrap text-xs {saveMessage ? '' : 'sr-only'} {saveMessageIsError ? 'text-[var(--red)]' : 'text-[var(--text-tertiary)]'} max-sm:absolute max-sm:inset-x-2 max-sm:bottom-full max-sm:mb-1 max-sm:whitespace-normal max-sm:rounded-ui max-sm:border max-sm:border-[var(--border-subtle)] max-sm:bg-[var(--note-page-panel)] max-sm:px-2 max-sm:py-1">{saveMessage}{#if saveFailed}<button type="button" class="underline underline-offset-2 hover:opacity-70" on:click={saveContent}>{$localizedText.editor.retry}</button>{/if}</p>

        <div class="relative" data-panel-anchor="tags">
          <TooltipIconButton
            type="button"
            bind:buttonEl={propertyTriggers.tags}
            data-testid="property-tags-button"
            aria-haspopup="dialog"
            aria-expanded={propertyPanel === 'tags'}
            label={tagsLabel}
            tooltip={tagsLabel}
            tooltipPosition="top"
            tooltipAlign="end"
            on:click={() => togglePropertyPanel('tags')}
            class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-ui transition max-sm:h-auto max-sm:w-auto max-sm:min-h-11 max-sm:min-w-11 max-sm:flex-col max-sm:gap-0.5 max-sm:px-1 hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] hover:text-[var(--text-primary)] {propertyPanel === 'tags' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
          >
            <Tag size="14" strokeWidth="1.7" aria-hidden="true" />
            <span class="whitespace-nowrap text-[length:var(--text-whisper)] leading-none sm:hidden">{$localizedText.editor.footerShort.tags}{editableTags.length ? ` ${editableTags.length}` : ''}</span>
          </TooltipIconButton>
          {#if propertyPanel === 'tags'}
            <div use:focusFirstControl role="dialog" aria-label={$localizedText.editor.propertyTags} data-testid="property-panel" data-panel="tags" class="{panelClass} sm:left-auto sm:right-0">
              <p class={panelLabelClass}>{$localizedText.editor.propertyTags}</p>
              <div class="flex flex-wrap gap-1.5">
                {#each editableTags as tag (tag)}
                  <span class="inline-flex items-center gap-1 rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-secondary)] py-0.5 pl-2.5 pr-1 text-xs text-[var(--text-primary)]">
                    #{tag}
                    <button
                      type="button"
                      class="inline-flex h-6 w-5 items-center justify-center rounded-ui text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      aria-label={$localizedText.editor.tagRemove(tag)}
                      on:click={() => removeTag(tag)}
                    >
                      <X size="12" aria-hidden="true" />
                    </button>
                  </span>
                {/each}
              </div>
              <input
                type="text"
                data-testid="property-tags"
                aria-label={$localizedText.editor.propertyTags}
                bind:value={tagDraft}
                on:keydown={onTagDraftKeydown}
                on:blur={addTagsFromDraft}
                placeholder={editableTags.length ? $localizedText.editor.propertyTagsMore : $localizedText.editor.propertyTagsEmpty}
                class="mt-2 h-8 w-full rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--text-secondary)]"
              />
              {#if offeredTags.length}
                <div class="mt-2 flex flex-wrap gap-1.5" aria-label={$localizedText.editor.tagSuggestions} role="group" data-testid="tag-suggestions">
                  {#each offeredTags as tag (tag)}
                    <button
                      type="button"
                      class="rounded-ui border border-dashed border-[var(--border-subtle)] px-2 py-0.5 text-xs text-[var(--text-secondary)] transition hover:border-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      on:mousedown|preventDefault
                      on:click={() => addTag(tag)}
                    >#{tag}</button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <div class="relative" data-panel-anchor="due">
          <TooltipIconButton
            type="button"
            bind:buttonEl={propertyTriggers.due}
            data-testid="property-due-button"
            aria-haspopup="dialog"
            aria-expanded={propertyPanel === 'due'}
            label={dueFieldLabel}
            tooltip={dueFieldLabel}
            tooltipPosition="top"
            tooltipAlign="end"
            on:click={() => togglePropertyPanel('due')}
            class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-ui transition max-sm:h-auto max-sm:w-auto max-sm:min-h-11 max-sm:min-w-11 max-sm:flex-col max-sm:gap-0.5 max-sm:px-1 hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] hover:text-[var(--text-primary)] {propertyPanel === 'due' ? 'bg-[var(--bg-secondary)]' : ''} {dueStatusOf === 'overdue' ? 'text-[var(--red)]' : dueStatusOf === 'today' ? 'text-[var(--yellow)]' : propertyPanel === 'due' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
          >
            <CalendarDays size="14" strokeWidth="1.7" aria-hidden="true" />
            <span class="whitespace-nowrap text-[length:var(--text-whisper)] leading-none sm:hidden">{$localizedText.editor.footerShort.due}</span>
          </TooltipIconButton>
          {#if propertyPanel === 'due'}
            <div use:focusFirstControl role="dialog" aria-label={$localizedText.editor.propertyDue} data-testid="property-panel" data-panel="due" class="{panelClass} sm:left-auto sm:right-0">
              <p class={panelLabelClass}>{$localizedText.editor.propertyDue}</p>
              <div class="flex items-center gap-2">
                <div class="relative flex items-center">
                  <input
                    type="text"
                    inputmode="numeric"
                    data-testid="property-due"
                    aria-label={$localizedText.editor.propertyDue}
                    aria-invalid={dueInvalid}
                    placeholder={$localizedText.editor.dueFormat}
                    bind:value={dueText}
                    on:focus={() => dueFocused = true}
                    on:blur={() => { dueFocused = false; commitDueText(); }}
                    on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitDueText(); } }}
                    on:input={() => dueInvalid = false}
                    class="h-8 w-36 rounded-ui border bg-[var(--bg-primary)] px-2 pr-7 text-xs outline-none {dueInvalid ? 'border-[var(--red)] text-[var(--red)]' : 'border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--text-secondary)]'}"
                  />
                  {#if dueText}
                    <button
                      type="button"
                      data-testid="clear-due"
                      aria-label={$localizedText.editor.dueClear}
                      class="absolute right-1 inline-flex h-6 w-5 items-center justify-center rounded-ui text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      on:click={clearDue}
                    >
                      <X size="12" strokeWidth="1.7" aria-hidden="true" />
                    </button>
                  {/if}
                </div>
                {#if dueDate}
                  <span
                    data-testid="due-label"
                    data-status={dueStatusOf}
                    class="rounded-ui px-2.5 py-1 text-[length:var(--text-whisper-lg)] uppercase tracking-[0.12em] {dueStatusOf === 'overdue'
                      ? 'bg-[color-mix(in_srgb,var(--red)_14%,transparent)] text-[var(--red)]'
                      : dueStatusOf === 'today'
                        ? 'bg-[color-mix(in_srgb,var(--yellow)_18%,transparent)] text-[var(--yellow)]'
                        : 'text-[var(--text-tertiary)]'}"
                  >
                    {dueLabelOf}
                  </span>
                {/if}
              </div>
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                {#each DUE_QUICK_DAYS as days}
                  <button
                    type="button"
                    data-testid="due-quick"
                    aria-pressed={dueDate === isoDayFromToday(days)}
                    class="rounded-ui border px-2 py-1 text-xs transition {dueDate === isoDayFromToday(days) ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
                    on:click={() => setDueIso(isoDayFromToday(days))}
                  >{$localizedText.editor.dueQuick[days]}</button>
                {/each}
                <span class="relative">
                  <button
                    type="button"
                    data-testid="due-calendar"
                    class="inline-flex items-center gap-1.5 rounded-ui border border-[var(--border-subtle)] px-2 py-1 text-xs text-[var(--text-secondary)] transition hover:border-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    on:click={openDueCalendar}
                  ><CalendarDays size="12" strokeWidth="1.7" aria-hidden="true" />{$localizedText.editor.dueCalendar}</button>
                  <input
                    type="date"
                    bind:this={dueDateInput}
                    value={dueDate || ''}
                    tabindex="-1"
                    aria-hidden="true"
                    class="pointer-events-none absolute inset-0 h-full w-full opacity-0"
                    on:change={(event) => setDueIso(event.currentTarget.value)}
                  />
                </span>
              </div>
              {#if dueInvalid}
                <p role="alert" class="mt-2 text-[length:var(--text-whisper-lg)] text-[var(--red)]">{$localizedText.editor.dueInvalid}</p>
              {/if}
            </div>
          {/if}
        </div>

        {#if loadedFilePath && !currentFile?.isDir}
          <div class="relative" data-panel-anchor="properties">
            <TooltipIconButton
              type="button"
              bind:buttonEl={propertyTriggers.properties}
              data-testid="property-properties-button"
              aria-haspopup="dialog"
              aria-expanded={propertyPanel === 'properties'}
              label={propertiesLabel}
              tooltip={propertiesLabel}
              tooltipPosition="top"
              tooltipAlign="end"
              on:click={() => togglePropertyPanel('properties')}
              class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-ui transition max-sm:h-auto max-sm:w-auto max-sm:min-h-11 max-sm:min-w-11 max-sm:flex-col max-sm:gap-0.5 max-sm:px-1 hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] hover:text-[var(--text-primary)] {propertyPanel === 'properties' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
            >
              <SlidersHorizontal size="14" strokeWidth="1.7" aria-hidden="true" />
              <span class="whitespace-nowrap text-[length:var(--text-whisper)] leading-none sm:hidden">{$localizedText.editor.footerShort.properties}{customProperties.length ? ` ${customProperties.length}` : ''}</span>
            </TooltipIconButton>
            {#if propertyPanel === 'properties'}
              <div use:focusFirstControl role="dialog" aria-label={$localizedText.properties.title} data-testid="property-panel" data-panel="properties" class="{panelClass} sm:left-auto sm:right-0 sm:!w-96 max-h-[70vh] overflow-y-auto">
                <p class={panelLabelClass}>{$localizedText.properties.title}</p>
                <p class="mb-2 max-w-[16rem] text-[length:var(--text-whisper)] leading-relaxed text-[var(--text-tertiary)]">{$localizedText.properties.hint}</p>
                <NoteProperties filePath={loadedFilePath} properties={customProperties} on:changed={() => { propertiesChanged.update((n) => n + 1); loadFile(); }} />
              </div>
            {/if}
          </div>
        {/if}
        {#if relatedCount > 0}
          <div class="relative" data-panel-anchor="related">
            <button
              type="button"
              bind:this={propertyTriggers.related}
              data-testid="property-related-button"
              aria-haspopup="dialog"
              aria-expanded={propertyPanel === 'related'}
              aria-label={`${$localizedText.editor.localNavigation}: ${relatedCount}`}
              class="inline-flex h-7 items-center gap-1.5 rounded-ui px-2 text-xs transition max-sm:h-auto max-sm:min-h-11 max-sm:min-w-11 max-sm:flex-col max-sm:justify-center max-sm:gap-0.5 max-sm:px-1 hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] hover:text-[var(--text-primary)] {propertyPanel === 'related' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
              on:click={() => togglePropertyPanel('related')}
            >
              <Link2 size="14" strokeWidth="1.7" aria-hidden="true" />
              <span class="whitespace-nowrap text-[length:var(--text-whisper)] leading-none sm:hidden">{$localizedText.editor.footerShort.links} {relatedCount}</span>
              <span class="hidden sm:inline">{$localizedText.editor.localNavigation}</span>
              <span class="tabular-nums max-sm:hidden">{relatedCount}</span>
            </button>
            {#if propertyPanel === 'related'}
              <div use:focusFirstControl role="dialog" aria-label={$localizedText.editor.localNavigation} data-testid="property-panel" data-panel="related" class="{panelClass} max-h-[70vh] overflow-y-auto">
                <p class={panelLabelClass}>{$localizedText.editor.localNavigation}</p>
                <ul class="-mx-1 max-h-64 overflow-y-auto">
                  {#each relatedList as item (item.path)}
                    <li>
                      <button
                        type="button"
                        aria-label={`${item.name}, ${relationText(item.relation)}`}
                        title={item.path}
                        data-testid="related-row"
                        data-relation={item.relation}
                        class="flex w-full min-w-0 items-center justify-between gap-3 rounded-ui px-2 py-1.5 text-left text-xs hover:bg-[var(--bg-secondary)]"
                        on:click={() => { closePropertyPanel(); openLinkedNote(item); }}
                      >
                        <span class="min-w-0 truncate font-medium text-[var(--text-primary)]">{item.name}</span>
                        <span class="inline-flex shrink-0 items-center gap-1.5 text-[length:var(--text-whisper-lg)] text-[var(--text-tertiary)]">
                          {#if item.relation === 'both'}<ArrowLeftRight size="12" strokeWidth="1.7" aria-hidden="true" />
                          {:else if item.relation === 'out'}<ArrowRight size="12" strokeWidth="1.7" aria-hidden="true" />
                          {:else}<ArrowLeft size="12" strokeWidth="1.7" aria-hidden="true" />{/if}
                          {relationText(item.relation)}
                        </span>
                      </button>
                    </li>
                  {/each}
                </ul>
                {#if neighborhood.missing?.length}
                  <p class="mt-2 text-[length:var(--text-whisper-lg)] leading-relaxed text-[var(--text-tertiary)]" data-testid="related-missing">
                    {$localizedText.editor.missingLinks}: {neighborhood.missing.join(', ')}
                  </p>
                {/if}
                {#if graphLayout.nodes.length > 1}
                  <p class="{panelLabelClass} mt-3">{$localizedText.editor.localGraph}</p>
                  <!-- A shortcut for the pointer: the list above is the accessible way to open these notes. -->
                  <svg viewBox="0 0 240 180" class="h-44 w-full" aria-hidden="true" data-testid="local-graph">
                    {#each graphLayout.edges as edge (`${edge.from}->${edge.to}`)}
                      <line x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} class="stroke-[var(--border-subtle)]" stroke-width="1.2" />
                    {/each}
                    {#each graphLayout.nodes as node (node.path)}
                      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                      <g class={node.center ? '' : 'cursor-pointer'} data-testid={node.center ? undefined : 'local-graph-node'} on:click={() => { if (!node.center) { closePropertyPanel(); openLinkedNote({ path: node.path, name: node.title }); } }}>
                        <title>{node.title}</title>
                        <circle cx={node.x} cy={node.y} r={14} fill="transparent" />
                        <circle cx={node.x} cy={node.y} r={node.center ? 6 : 4.5} class={node.center ? 'fill-[var(--text-primary)]' : 'fill-[var(--text-tertiary)]'} />
                      </g>
                      <!-- A crowd of names smears into one line: past a dozen only the title tip (hover) names a dot. -->
                      {#if graphLayout.nodes.length <= 12 || node.center}
                        <text x={node.x} y={node.y + 17} text-anchor="middle" font-size="9" class="fill-[var(--text-secondary)]">{truncateLabel(node.title)}</text>
                      {/if}
                    {/each}
                  </svg>
                {/if}
                {#if unlinkedMentions.length > 0}
                  <p class="{panelLabelClass} mt-3">{$localizedText.editor.unlinkedMentions}</p>
                  <ul class="-mx-1 max-h-48 overflow-y-auto">
                    {#each unlinkedMentions as item (item.path)}
                      <li class="flex min-w-0 items-center justify-between gap-3 rounded-ui px-2 py-1.5 text-xs">
                        <span class="min-w-0">
                          <span class="block truncate font-medium text-[var(--text-primary)]">{item.title}</span>
                          <span class="block truncate text-[length:var(--text-whisper-lg)] text-[var(--text-tertiary)]">{$localizedText.editor.mentionOf.replace('{phrase}', item.phrase)}</span>
                        </span>
                        <button
                          type="button"
                          data-testid="link-mention-button"
                          class="shrink-0 rounded-ui px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
                          on:click={() => linkMention(item)}
                        >{$localizedText.editor.linkMention}</button>
                      </li>
                    {/each}
                  </ul>
                {/if}
                <button
                  type="button"
                  data-testid="show-on-map"
                  class="mt-3 inline-flex min-h-9 items-center gap-2 rounded-ui px-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--text-primary)] transition hover:bg-[var(--bg-secondary)]"
                  on:click={() => { closePropertyPanel(); dispatch('showOnMap', { path: loadedFilePath }); }}
                >
                  <Waypoints size="14" strokeWidth="1.7" aria-hidden="true" />{$localizedText.editor.showOnMap}
                </button>
                {#if linkMentionFailed}
                  <p class="mt-2 text-xs text-[var(--red)]" role="status">{$localizedText.editor.linkMentionFailed}</p>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        <TooltipIconButton
          type="button"
          data-testid="property-pin"
          aria-pressed={pinnedNow}
          label={pinnedNow ? $localizedText.editor.pinUnpin : $localizedText.editor.pinDo}
          tooltip={pinnedNow ? $localizedText.editor.pinUnpin : $localizedText.editor.pinDo}
          tooltipPosition="top"
          tooltipAlign="end"
          on:click={togglePinned}
          class="max-sm:!hidden inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-ui transition hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] hover:text-[var(--text-primary)] {pinnedNow ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
        >
          <Pin size="14" strokeWidth="1.7" fill={pinnedNow ? 'currentColor' : 'none'} aria-hidden="true" />
        </TooltipIconButton>
      </div>

      <div class="ml-auto flex shrink-0 items-center gap-2">
        {#if propertyPanel === 'color'}
          <div class="relative" data-panel-anchor="color">
            <div use:focusFirstControl role="group" aria-label={$localizedText.editor.noteColor} data-testid="property-panel" data-panel="color" class="{panelClass} sm:left-auto sm:right-0">
              <p class={panelLabelClass}>{$localizedText.editor.noteColor}</p>
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={currentNoteColor === ''}
                  class="flex h-8 shrink-0 items-center rounded-ui border px-3 text-[length:var(--text-whisper-lg)] font-bold uppercase tracking-[0.12em] transition hover:border-[var(--text-secondary)] disabled:opacity-40 {currentNoteColor === '' ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'}"
                  disabled={isColorSaving}
                  on:click={() => setNoteColor('')}
                >
                  {$localizedText.editor.noColor}
                </button>
                {#each colorOptions as color}
                  <button
                    type="button"
                    class="h-8 w-8 shrink-0 rounded-ui border-2 transition hover:scale-105 disabled:opacity-40 {currentNoteColor === color ? 'border-[var(--text-primary)]' : 'border-transparent'}"
                    style="background: {color};"
                    disabled={isColorSaving}
                    aria-label={$localizedText.app.board.applyColor(color)}
                    aria-pressed={currentNoteColor === color}
                    on:click={() => setNoteColor(color)}
                  ></button>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <!-- History lives by Export: the browser print view it replaced is the same PDF under Export → PDF. -->
        {#if loadedFilePath && !inConflict}
          <TooltipIconButton
            type="button"
            data-testid="footer-history"
            on:click={() => { showHistory = true; historyNote = visibleFile; }}
            class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-ui text-[var(--text-secondary)] transition max-sm:h-11 max-sm:w-11 hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] hover:text-[var(--text-primary)]"
            label={$localizedText.editor.history}
            tooltip={$localizedText.editor.history}
            tooltipPosition="top"
            tooltipAlign="end"
          >
            <History size="14" strokeWidth="1.7" aria-hidden="true" />
          </TooltipIconButton>
        {/if}

        <!-- The terminal next to the note it works on (⌘J does the same). Desktop app only. -->
        {#if terminalBridge}
          <TooltipIconButton
            type="button"
            data-testid="footer-terminal"
            aria-pressed={$terminalOpen}
            on:click={toggleTerminal}
            class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-ui transition max-sm:hidden hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] hover:text-[var(--text-primary)] {$terminalOpen ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
            label={$localizedText.terminal.open}
            tooltip={$localizedText.terminal.toggleHint}
            tooltipPosition="top"
            tooltipAlign="end"
          >
            <TerminalSquare size="14" strokeWidth="1.7" aria-hidden="true" />
          </TooltipIconButton>
        {/if}
        <div class="relative" data-panel-anchor="export">
          <TooltipIconButton
            type="button"
            bind:buttonEl={propertyTriggers.export}
            data-testid="export-button"
            aria-haspopup="dialog"
            aria-expanded={propertyPanel === 'export'}
            on:click={() => togglePropertyPanel('export')}
            class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-ui transition max-sm:h-11 max-sm:w-11 hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] hover:text-[var(--text-primary)] {propertyPanel === 'export' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
            label={$localizedText.editor.exportLabel}
            tooltip={$localizedText.editor.exportLabel}
            tooltipPosition="top"
            tooltipAlign="end"
          >
            <Download size="14" strokeWidth="1.7" aria-hidden="true" />
          </TooltipIconButton>
          {#if propertyPanel === 'export'}
            <div use:focusFirstControl role="dialog" aria-label={$localizedText.editor.exportLabel} data-testid="property-panel" data-panel="export" class="{panelClass} sm:left-auto sm:right-0">
              <p class={panelLabelClass}>{$localizedText.editor.exportLabel}</p>
              <ul class="flex flex-col">
                {#each exportFormats as format (format.id)}
                  <li>
                    <button
                      type="button"
                      data-testid="export-{format.id}"
                      disabled={exporting}
                      class="flex w-full items-center justify-between gap-3 rounded-ui px-2 py-1.5 text-left text-xs transition hover:bg-[var(--bg-secondary)] disabled:opacity-40"
                      on:click={() => exportNote(format.id)}
                    >
                      <span class="text-[var(--text-primary)]">{format.label}</span>
                      <span class="text-[length:var(--text-whisper-lg)] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">.{format.extension}</span>
                    </button>
                  </li>
                {/each}
              </ul>
              {#if exportError}
                <p role="alert" class="mt-2 text-[length:var(--text-whisper-lg)] leading-relaxed text-[var(--red)]">{exportError}</p>
              {/if}
            </div>
          {/if}
        </div>
        <!-- The trash stands next to the last button of the bar, apart from the ones used all the time.
             Quiet until reached for: a red icon that always glows is the loudest thing on a calm page. On a
             phone the bar has no room for it, so it waits in "More". -->
        <span class="max-sm:hidden">
          <TooltipIconButton
            type="button"
            data-testid="footer-trash"
            on:click={() => void deleteFile()}
            class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-ui text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--red)_12%,transparent)] hover:text-[var(--red)]"
            label={$localizedText.editor.moveToTrash}
            tooltip={$localizedText.editor.moveToTrash}
            tooltipPosition="top"
            tooltipAlign="end"
          >
            <Trash2 size="14" strokeWidth="1.7" aria-hidden="true" />
          </TooltipIconButton>
        </span>
        <!-- The ⋯ button also anchors the password panel: locking a note is an action on the note, not one of its fields. -->
        <div class="relative" data-footer-more data-panel-anchor="lock">
          <TooltipIconButton
            type="button"
            data-testid="editor-more"
            class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-ui text-[var(--text-primary)] max-sm:h-11 max-sm:w-11 transition hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] focus-visible:outline-none {footerMoreOpen ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : ''}"
            label={$localizedText.editor.moreActions}
            tooltip={$localizedText.editor.moreActions}
            tooltipPosition="top"
            tooltipAlign="end"
            on:click={() => footerMoreOpen = !footerMoreOpen}
          >
            <MoreHorizontal class="h-4 w-4" strokeWidth="1.7" aria-hidden="true" />
          </TooltipIconButton>
          {#if footerMoreOpen}
            <div class="absolute bottom-full right-0 z-30 mb-2 w-56 rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-1 shadow-2xl" role="menu" aria-label={$localizedText.editor.moreActions} data-testid="editor-more-menu">
              <!-- On a phone the bottom bar has room for six buttons; pinning moves here. -->
              <button type="button" role="menuitem" data-testid="menu-pin" class="flex w-full items-center gap-3 rounded-ui px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)] sm:hidden" on:click={() => { footerMoreOpen = false; togglePinned(); }}>
                <Pin size="16" strokeWidth="1.7" fill={pinnedNow ? 'currentColor' : 'none'} aria-hidden="true" />{pinnedNow ? $localizedText.editor.pinUnpin : $localizedText.editor.pinDo}
              </button>
              {#if !fileInfo?.locked}<button type="button" role="menuitem" data-testid="menu-favorite" class="flex w-full items-center gap-3 rounded-ui px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)]" on:click={() => { footerMoreOpen = false; toggleFavorite(); }}>
                <Star size="16" strokeWidth="1.7" fill={favoriteNow ? 'currentColor' : 'none'} aria-hidden="true" />{favoriteNow ? $localizedText.editor.favoriteRemove : $localizedText.editor.favoriteAdd}
              </button>{/if}
              <!-- Narrow window: the footer has no room for the terminal button, so the terminal opens from here. -->
              {#if terminalBridge}
                <button type="button" role="menuitem" data-testid="menu-terminal" class="flex w-full items-center gap-3 rounded-ui px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)] sm:hidden" on:click={() => { footerMoreOpen = false; toggleTerminal(); }}>
                  <TerminalSquare size="16" strokeWidth="1.7" aria-hidden="true" />{$localizedText.terminal.open}
                </button>
              {/if}
              <!-- The agent reads the note from the notes folder; a locked note is sealed there, so it is not offered. -->
              {#if terminalBridge && loadedFilePath && !fileInfo?.locked}
                <button type="button" role="menuitem" data-testid="menu-ask-agent" class="flex w-full items-center gap-3 rounded-ui px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)]" on:click={() => { footerMoreOpen = false; askAgentAboutNote(loadedFilePath); }}>
                  <Bot size="16" strokeWidth="1.7" aria-hidden="true" />{$localizedText.terminal.askAboutNote}
                </button>
              {/if}
              <button type="button" role="menuitem" data-testid="menu-lock" class="flex w-full items-center gap-3 rounded-ui px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)]" on:click={() => { propertyTriggers.lock = document.querySelector('[data-testid="editor-more"]'); togglePropertyPanel('lock'); }}>
                <Lock size="16" strokeWidth="1.7" aria-hidden="true" />{$localizedText.editor.lockMenu}
              </button>
              <button type="button" role="menuitem" data-testid="toggle-focus-mode" class="flex w-full items-center gap-3 rounded-ui px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)]" on:click={() => { footerMoreOpen = false; setFocusMode(!focusMode); }}>
                <Focus size="16" strokeWidth="1.7" aria-hidden="true" />{focusMode ? $localizedText.editor.focusOff : $localizedText.editor.focusOn}
              </button>
              <button type="button" role="menuitem" data-testid="toggle-raw-mode" class="flex w-full items-center gap-3 rounded-ui px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)]" on:click={() => { flushEditorMarkdown(); chooseRawMode(!rawMode); footerMoreOpen = false; }}>
                <FileText size="16" strokeWidth="1.7" aria-hidden="true" />{rawMode ? $localizedText.editor.richMode : $localizedText.editor.rawMode}
              </button>
              <button type="button" role="menuitem" data-testid="toggle-note-color" class="flex w-full items-center gap-3 rounded-ui px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)]" on:click={() => { footerMoreOpen = false; togglePropertyPanel('color'); }}>
                <Palette size="16" strokeWidth="1.7" aria-hidden="true" />{$localizedText.editor.noteColor}
              </button>
              <!-- The trash goes last here, like everywhere: it is the one action that is not worth a misclick. -->
              <button type="button" role="menuitem" data-testid="menu-trash" class="flex w-full items-center gap-3 rounded-ui px-3 py-2 text-left text-sm text-[var(--red)] hover:bg-[color-mix(in_srgb,var(--red)_12%,transparent)] sm:hidden" on:click={() => { footerMoreOpen = false; void deleteFile(); }}>
                <Trash2 size="16" strokeWidth="1.7" aria-hidden="true" />{$localizedText.editor.moveToTrash}
              </button>
            </div>
          {/if}
          {#if propertyPanel === 'lock'}
            <div use:focusFirstControl role="dialog" aria-label={$localizedText.lock.title} data-testid="property-panel" data-panel="lock" class="{panelClass} sm:left-auto sm:right-0 sm:!w-96">
              <NoteLock filePath={loadedFilePath} locked={Boolean(fileInfo?.locked)} unlocked={Boolean(fileInfo?.unlocked)} on:changed={() => loadFile()} />
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>


{#if imageRename}
  <ModalShell title={$localizedText.editor.renameImageTitle} widthClass="w-[90%] lg:w-[30rem]" closeOnEscape={true} on:close={() => imageRename = null}>
    <div class="space-y-5">
      <p class="text-sm leading-relaxed text-[var(--text-secondary)]">
        {$localizedText.editor.renameImageHint}
      </p>
      <input
        type="text"
        bind:value={attachmentNewName}
        class={formFieldClass()}
        on:keydown={(e) => { if (e.key === 'Enter') saveImageRename(); if (e.key === 'Escape') imageRename = null; }}
      />
      {#if attachmentProblem && attachmentProblem !== 'empty'}
        <p role="alert" class="text-xs leading-relaxed text-[var(--red)]">{$localizedText.sidebar.nameProblem(attachmentProblem)}</p>
      {/if}
    </div>
    <div class="mt-8 flex gap-6">
      <button on:click={() => imageRename = null} class={getModalButtonClass('secondary')}>
        {$localizedText.editor.cancel}
      </button>
      <button on:click={saveImageRename} disabled={!attachmentNewName.trim() || Boolean(attachmentProblem)} class={getModalButtonClass('primary', { disabled: !attachmentNewName.trim() || Boolean(attachmentProblem) })}>
        {$localizedText.editor.renameImage}
      </button>
    </div>
  </ModalShell>
{/if}

{#if formatToast}
  <!-- Above the note's bottom bar, not over its Export button. -->
  <div class="fixed bottom-16 right-6 z-[200] animate-toast-in max-sm:bottom-20 max-sm:left-4 max-sm:right-4" role="status" data-testid="editor-toast">
    <div class="rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-5 py-3 max-w-xs text-sm shadow-2xl max-sm:max-w-none">
      {formatToast}
    </div>
  </div>
{/if}
