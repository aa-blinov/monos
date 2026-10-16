<script>
  import { onDestroy, onMount, createEventDispatcher, tick } from 'svelte';
  import EditorHeader from './EditorHeader.svelte';
  import ModalShell from './ModalShell.svelte';
  import RichEditor from './RichEditor.svelte';
  import OutlinePanel from './OutlinePanel.svelte';
  import CategoryInput from './CategoryInput.svelte';
  import { scrollBehavior } from '../lib/motion.js';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { editorState, editorAction, noteSaveSignal, activeTheme, outlineHidden, focusNoteBody } from '../stores.js';
  import { getNoteColorOptions } from '../lib/note-colors.js';
  import { getModalButtonClass } from '../lib/modal-button.js';
  import { formFieldClass } from '../lib/form-field.js';
  import { announceNoteLinksUpdated, FLUSH_OPEN_NOTE_EVENT, NOTE_LINKS_UPDATED_EVENT } from '../lib/note-refresh.js';
  import { layoutLocalGraph, truncateLabel } from '../lib/local-graph.js';
  import { dueLabel, dueStatus, parseFrontmatter, replaceFrontmatterBody, setFrontmatterKey, splitFrontmatter, upsertFrontmatter } from '../lib/frontmatter.js';
  import { parseDueInput, formatDueInput } from '../lib/due-input.js';
  import { fileNameProblem } from '../lib/file-name.js';
  import { extractOutline } from '../lib/outline.js';
  import { notifyDue } from '../lib/reminders.js';
  import { downloadFile, exportFileName, fetchNoteHtml, markdownToPlainText } from '../lib/note-export.js';
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
  import { createNoteRequest } from '../lib/sidebar-api.js';
  import { announceTrashed, trashedNote } from '../lib/trash-undo.js';
  import {
    convertImageToWebp,
    defaultImageName,
    displayImageSrc,
    replaceMarkdownImagePath,
    resolveMarkdownImagePath,
  } from '../lib/attachments.js';
  import { displayFolderName, localizedText, locale } from '../lib/strings.js';
  import { wordStats } from '../lib/word-stats.js';
  import { taskProgress as taskProgressOf } from '../lib/task-progress.js';
  import { resolveRegion, summarizeConflicts } from '../lib/conflict-markers.js';
  import ConflictNoteView from './ConflictNoteView.svelte';
  import { CalendarDays, Download, Folder, Link2, Lock, Palette, SlidersHorizontal, Tag, Trash2, FileText, X, Focus, Pin, MoreHorizontal } from 'lucide-svelte';
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
    footerMoreOpen = false;
    if (propertyPanel) closePropertyPanel({ restoreFocus: true });
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
      if (format === 'md') {
        downloadFile(exportFileName(name, 'md'), editedContent, 'text/markdown');
      } else if (format === 'txt') {
        downloadFile(exportFileName(name, 'txt'), markdownToPlainText(splitFrontmatter(editedContent).body));
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

  function tagsSummaryText(tags, emptyLabel) {
    if (!tags.length) return emptyLabel;
    return tags.length > 1 ? `#${tags[0]} +${tags.length - 1}` : `#${tags[0]}`;
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
  $: customProperties = fileInfo?.properties || [];

  function relationLabel(type) {
    return type === 'mention' ? $localizedText.sourceEditor.mention : $localizedText.sourceEditor.backlink;
  }

  function relatedNoteLabel(item) {
    return `${item?.name || ''}, ${relationLabel(item?.type)}`;
  }

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
    }
    const detail = { path: filePath, modified, savedAt: Date.now() };
    noteSaveSignal.set(detail);
    dispatch('fileSaved', detail);
  }

  async function handleImageFile(file) {
    const filePath = visibleFile?.path || currentFile?.path;
    if (!filePath) return null;
    try {
      const converted = await convertImageToWebp(file, { name: defaultImageName() });
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
      saveMessage = $localizedText.editor.saving;
      const saved = await saveFileContent(filePath, nextContent);
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

      content = nextContent;
      editedContent = nextContent;
      conflictCount = summarizeConflicts(nextContent).count;
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
      saveMessage = $localizedText.editor.saving;
      const saved = await saveFileContent(filePath, savedContent);
      if (loadedFilePath === filePath && editedContent === savedContent) content = savedContent;
      markFileSaved(filePath, saved);
    } catch (error) {
      console.error('Save before note switch failed:', error);
      // A failed save stays visible until a later save succeeds: the text is not on disk.
      saveMessage = $localizedText.editor.saveFailed;
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
  async function applyConflictResolution(event) {
    const filePath = loadedFilePath || currentFile?.path;
    if (!filePath) return;
    const choices = event.detail?.choices || {};
    let next = editedContent;
    for (const [index, choice] of Object.entries(choices)) {
      next = resolveRegion(next, Number(index), choice);
    }
    if (next === editedContent) return;

    conflictNotice = $localizedText.editor.conflictSaving;
    try {
      const response = await fetch('/api/git/resolve-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: next }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail || `HTTP ${response.status}`);
      }
      await saveFileContent(filePath, next);
      editedContent = next;
      content = next;
      conflictCount = 0;
      conflictNotice = $localizedText.editor.conflictResolved;
    } catch (error) {
      conflictNotice = $localizedText.settings.backupError(error?.message || String(error));
    }
  }

  async function saveContent() {
    const filePath = loadedFilePath || currentFile?.path;
    if (!filePath) return;
    flushEditorMarkdown();
    if (!hasUnsavedChanges() || isSaving) return;
    // A note with conflict markers cannot survive the editor round-trip: `marked`
    // turns the `=======` separator into a setext underline and the markers are
    // gone. Saving would write that damage over the file, so refuse instead.
    if (conflictCount > 0) return;

    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    if (saveMessageTimeout) clearTimeout(saveMessageTimeout);
    const savedContent = editedContent;
    const savedTitle = editedTitle;

    try {
      isSaving = true;
      saveMessage = $localizedText.editor.saving;
      const saved = await saveFileContent(filePath, savedContent);

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
      saveMessage = $localizedText.editor.saveFailed;
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
    editedContent = setFrontmatterKey(editedContent, 'pinned', noteIsPinned() ? '' : 'true');
    void saveMetadataFields();
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
    if (!currentFile || !fileInfo || !hasMetadataChanges()) return;
    if (metadataTimer) clearTimeout(metadataTimer);
    const nextContent = upsertFrontmatter(editedContent, {
      title: editedTitle,
      category: editableCategory,
      tags: editableTags,
      // Срок живёт в тех же ключах, что и заголовок: если его не передать,
      // upsertFrontmatter сочтёт его неуправляемым и молча удалит при
      // переименовании заметки.
      due: dueDate,
      pinned: noteIsPinned(),
    });
    if (nextContent !== editedContent) editedContent = nextContent;

    const filePath = currentFile.path;
    const payload = { title: editedTitle, tags: editableTags, content: nextContent };
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
    } catch (e) {
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
    window.addEventListener(FLUSH_OPEN_NOTE_EVENT, flushOnRequest);
    window.addEventListener(NOTE_LINKS_UPDATED_EVENT, reloadIfRewritten);
    return () => {
      window.removeEventListener(FLUSH_OPEN_NOTE_EVENT, flushOnRequest);
      window.removeEventListener(NOTE_LINKS_UPDATED_EVENT, reloadIfRewritten);
    };
  });

  onDestroy(() => {
    flushEditorMarkdown();
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    // Same guard as saveContent: a note with conflict markers must not be written
    // back from the editor, where the markers no longer survive the round-trip.
    if (loadedFilePath && hasUnsavedChanges() && !isSaving && conflictCount === 0) {
      const filePath = loadedFilePath;
      const savedContent = editedContent;
      const savedTitle = editedTitle;
      isSaving = true;
      saveFileContent(filePath, savedContent).then((saved) => {
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
      : `${$localizedText.editorHeader.stats.words(words)} · ${$localizedText.editorHeader.stats.readingMinutes(readingMinutes)}`;
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
  $: noteSurfaceStyle = focusMode
    ? `--content-width: 46rem; ${NEUTRAL_PAGE}`
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
    {wordCharStats}
    {taskProgress}
    historyAvailable={Boolean(loadedFilePath) && conflictCount === 0}
    onOpenHistory={() => { showHistory = true; historyNote = visibleFile; }}
    outlineOpen={wideWindow ? outlineColumnShown : outlineOpen}
    onToggleOutline={toggleOutline}
  />

  {#if showHistory && historyNote?.path}
    {#await import('./NoteHistoryModal.svelte') then historyModal}
      <svelte:component
        this={historyModal.default}
        notePath={(historyNote.path || '').replace(/^notes\//, '')}
        on:close={() => { showHistory = false; }}
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
        {#if conflictCount > 0}
          <div class="rounded-ui mb-4 border border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-3">
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
        {/if}

        {#if conflictCount > 0}
          <ConflictNoteView content={editedContent} on:resolve={applyConflictResolution} />
        {:else if rawMode}
          <textarea
            data-testid="raw-source"
            class="h-full min-h-0 w-full resize-none bg-transparent px-4 pb-6 font-mono text-[length:var(--editor-font-size,16px)] leading-[var(--line-height,1.625)] text-[var(--text-primary)] outline-none lg:px-8"
            placeholder={isLoading ? '' : $localizedText.editor.beginWriting}
            spellcheck="false"
            bind:value={editedContent}
          />
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
          on:createLinkedNote={(event) => createLinkedNote(event.detail)}
        />
        {/if}
      </div>
      {#if !focusMode}
        <OutlinePanel
          content={editedContent}
          open={outlineOpen}
          collapsed={outlineCollapsed}
          on:navigate={handleOutlineNavigate}
          on:close={() => { outlineOpen = false; }}
        />
      {/if}
    </div>
  {/if}

  {#if displayedFile && !displayedFile.isDir}
    <!-- Нижняя панель: свойства заметки открываются окошками над ней, поэтому текст
         не сдвигается. Во время загрузки следующей заметки панель inert: её контролы
         относятся к запрошенной заметке, а текст ещё от прежней. -->
    <div class="relative flex h-11 shrink-0 items-center gap-2 max-sm:h-auto max-sm:gap-0 max-sm:py-1 border-t border-[var(--note-page-border)] bg-[var(--note-page-panel)] px-2 sm:px-3 lg:px-6" data-testid="editor-footer" inert={isLoading}>
      <div class="flex min-w-0 items-center gap-1" data-testid="note-properties" inert={isLoading}>
        <div class="relative" data-panel-anchor="category">
          <button
            type="button"
            bind:this={propertyTriggers.category}
            data-testid="property-category-button"
            aria-haspopup="dialog"
            aria-expanded={propertyPanel === 'category'}
            aria-label={editableCategory ? `${$localizedText.editor.propertyCategory}: ${editableCategory}` : $localizedText.editor.propertyCategoryEmpty}
            class="inline-flex h-7 items-center gap-1.5 rounded-ui px-2 text-xs transition max-sm:h-auto max-sm:min-h-11 max-sm:min-w-11 max-sm:flex-col max-sm:justify-center max-sm:gap-0.5 max-sm:px-1 hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--text-primary)] {propertyPanel === 'category' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
            on:click={() => togglePropertyPanel('category')}
          >
            <Folder size="14" strokeWidth="1.7" aria-hidden="true" />
            <span class="whitespace-nowrap text-[length:var(--text-whisper)] leading-none sm:hidden">{$localizedText.editor.footerShort.folder}</span>
            <span class="hidden max-w-[9rem] truncate sm:inline">{editableCategory ? displayFolderName(editableCategory, $localizedText) : $localizedText.editor.propertyCategoryEmpty}</span>
          </button>
          {#if propertyPanel === 'category'}
            <div use:focusFirstControl role="dialog" aria-label={$localizedText.editor.propertyCategory} data-testid="property-panel" data-panel="category" class={panelClass}>
              <p class={panelLabelClass}>{$localizedText.editor.propertyCategory}</p>
              <CategoryInput
                value={editableCategory}
                suggestions={categorySuggestions}
                placeholder={$localizedText.editor.propertyCategoryEmpty}
                label={$localizedText.editor.propertyCategory}
                listLabel={$localizedText.editor.categorySuggestions}
                testid="property-category"
                on:open={loadCategorySuggestions}
                on:commit={commitCategory}
              />
            </div>
          {/if}
        </div>

        <div class="relative" data-panel-anchor="tags">
          <button
            type="button"
            bind:this={propertyTriggers.tags}
            data-testid="property-tags-button"
            aria-haspopup="dialog"
            aria-expanded={propertyPanel === 'tags'}
            aria-label={editableTags.length ? `${$localizedText.editor.propertyTags}: ${editableTags.map((tag) => `#${tag}`).join(' ')}` : $localizedText.editor.propertyTags}
            class="inline-flex h-7 items-center gap-1.5 rounded-ui px-2 text-xs transition max-sm:h-auto max-sm:min-h-11 max-sm:min-w-11 max-sm:flex-col max-sm:justify-center max-sm:gap-0.5 max-sm:px-1 hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--text-primary)] {propertyPanel === 'tags' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
            on:click={() => togglePropertyPanel('tags')}
          >
            <Tag size="14" strokeWidth="1.7" aria-hidden="true" />
            <span class="whitespace-nowrap text-[length:var(--text-whisper)] leading-none sm:hidden">{$localizedText.editor.footerShort.tags}{editableTags.length ? ` ${editableTags.length}` : ''}</span>
            <span class="hidden max-w-[9rem] truncate sm:inline">{tagsSummaryText(editableTags, $localizedText.editor.propertyTags)}</span>
                      </button>
          {#if propertyPanel === 'tags'}
            <div use:focusFirstControl role="dialog" aria-label={$localizedText.editor.propertyTags} data-testid="property-panel" data-panel="tags" class={panelClass}>
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
                placeholder={editableTags.length ? '' : $localizedText.editor.propertyTagsEmpty}
                class="mt-2 h-8 w-full rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--text-secondary)]"
              />
            </div>
          {/if}
        </div>

        <div class="relative" data-panel-anchor="due">
          <button
            type="button"
            bind:this={propertyTriggers.due}
            data-testid="property-due-button"
            aria-haspopup="dialog"
            aria-expanded={propertyPanel === 'due'}
            aria-label={dueDate ? `${$localizedText.editor.propertyDue}: ${dueLabelOf}` : $localizedText.editor.propertyDue}
            class="inline-flex h-7 items-center gap-1.5 rounded-ui px-2 text-xs transition max-sm:h-auto max-sm:min-h-11 max-sm:min-w-11 max-sm:flex-col max-sm:justify-center max-sm:gap-0.5 max-sm:px-1 hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--text-primary)] {propertyPanel === 'due' ? 'bg-[var(--bg-secondary)]' : ''} {dueStatusOf === 'overdue' ? 'text-[var(--red)]' : dueStatusOf === 'today' ? 'text-[var(--yellow)]' : propertyPanel === 'due' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
            on:click={() => togglePropertyPanel('due')}
          >
            <CalendarDays size="14" strokeWidth="1.7" aria-hidden="true" />
            <span class="whitespace-nowrap text-[length:var(--text-whisper)] leading-none sm:hidden">{$localizedText.editor.footerShort.due}</span>
            <span class="hidden sm:inline">{dueDate ? dueLabelOf : $localizedText.editor.propertyDue}</span>
          </button>
          {#if propertyPanel === 'due'}
            <div use:focusFirstControl role="dialog" aria-label={$localizedText.editor.propertyDue} data-testid="property-panel" data-panel="due" class={panelClass}>
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
                      <X size="12" aria-hidden="true" />
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
                        : 'text-[var(--text-muted)]'}"
                  >
                    {dueLabelOf}
                  </span>
                {/if}
              </div>
              {#if dueInvalid}
                <p role="alert" class="mt-2 text-[length:var(--text-whisper-lg)] text-[var(--red)]">{$localizedText.editor.dueInvalid}</p>
              {/if}
            </div>
          {/if}
        </div>

        {#if loadedFilePath && !currentFile?.isDir}
          <div class="relative" data-panel-anchor="properties">
            <button
              type="button"
              bind:this={propertyTriggers.properties}
              data-testid="property-properties-button"
              title={$localizedText.properties.hint}
              aria-haspopup="dialog"
              aria-expanded={propertyPanel === 'properties'}
              aria-label={`${$localizedText.properties.title}: ${customProperties.length}`}
              class="inline-flex h-7 items-center gap-1.5 rounded-ui px-2 text-xs transition max-sm:h-auto max-sm:min-h-11 max-sm:min-w-11 max-sm:flex-col max-sm:justify-center max-sm:gap-0.5 max-sm:px-1 hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--text-primary)] {propertyPanel === 'properties' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
              on:click={() => togglePropertyPanel('properties')}
            >
              <SlidersHorizontal size="14" strokeWidth="1.7" aria-hidden="true" />
              <span class="whitespace-nowrap text-[length:var(--text-whisper)] leading-none sm:hidden">{$localizedText.editor.footerShort.properties}{customProperties.length ? ` ${customProperties.length}` : ''}</span>
              <span class="hidden sm:inline">{$localizedText.properties.title}</span>
              {#if customProperties.length}<span class="tabular-nums max-sm:hidden">{customProperties.length}</span>{/if}
            </button>
            {#if propertyPanel === 'properties'}
              <div use:focusFirstControl role="dialog" aria-label={$localizedText.properties.title} data-testid="property-panel" data-panel="properties" class="{panelClass} sm:!w-96 max-h-[70vh] overflow-y-auto">
                <p class={panelLabelClass}>{$localizedText.properties.title}</p>
                <NoteProperties filePath={loadedFilePath} properties={customProperties} on:changed={() => loadFile()} />
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
              class="inline-flex h-7 items-center gap-1.5 rounded-ui px-2 text-xs transition max-sm:h-auto max-sm:min-h-11 max-sm:min-w-11 max-sm:flex-col max-sm:justify-center max-sm:gap-0.5 max-sm:px-1 hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--text-primary)] {propertyPanel === 'related' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
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
                  {#each backlinks as item}
                    <li>
                      <button
                        type="button"
                        aria-label={relatedNoteLabel(item)}
                        title={item.path}
                        class="flex w-full min-w-0 items-center justify-between gap-3 rounded-ui px-2 py-1.5 text-left text-xs hover:bg-[var(--bg-secondary)]"
                        on:click={() => { closePropertyPanel(); openLinkedNote(item); }}
                      >
                        <span class="min-w-0 truncate font-medium text-[var(--text-primary)]">{item.name}</span>
                        <span class="shrink-0 text-[length:var(--text-whisper-lg)] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{relationLabel(item.type)}</span>
                      </button>
                    </li>
                  {/each}
                </ul>
                {#if graphLayout.nodes.length > 1}
                  <p class="{panelLabelClass} mt-3">{$localizedText.editor.localGraph}</p>
                  <!-- Decorative: the lists above and below are the accessible way to open these notes. -->
                  <svg viewBox="0 0 240 180" class="h-44 w-full" aria-hidden="true" data-testid="local-graph">
                    {#each graphLayout.edges as edge (`${edge.from}->${edge.to}`)}
                      <line x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} class="stroke-[var(--border-subtle)]" stroke-width="1.2" />
                    {/each}
                    {#each graphLayout.nodes as node (node.path)}
                      <circle cx={node.x} cy={node.y} r={node.center ? 6 : 4.5} class={node.center ? 'fill-[var(--text-primary)]' : 'fill-[var(--text-tertiary)]'} />
                      <text x={node.x} y={node.y + 17} text-anchor="middle" font-size="9" class="fill-[var(--text-secondary)]">{truncateLabel(node.title)}</text>
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
                {#if linkMentionFailed}
                  <p class="mt-2 text-xs text-[var(--red)]" role="status">{$localizedText.editor.linkMentionFailed}</p>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        <button
          type="button"
          data-testid="property-pin"
          aria-pressed={pinnedNow}
          aria-label={$localizedText.editor.pinDo}
          class="max-sm:!hidden inline-flex h-7 items-center gap-1.5 rounded-ui px-2 text-xs transition max-sm:h-auto max-sm:min-h-11 max-sm:min-w-11 max-sm:flex-col max-sm:justify-center max-sm:gap-0.5 max-sm:px-1 hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--text-primary)] {pinnedNow ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
          on:click={togglePinned}
        >
          <Pin size="14" strokeWidth="1.7" fill={pinnedNow ? 'currentColor' : 'none'} aria-hidden="true" />
          <!-- A toggle keeps its name; being pinned shows as the pressed state and the filled pin. -->
          <span class="hidden sm:inline">{$localizedText.editor.pinDo}</span>
        </button>
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

        <p role="status" aria-live="polite" class="flex items-center gap-2 whitespace-nowrap text-xs {saveMessageIsError ? 'text-[var(--red)]' : 'text-[var(--text-tertiary)]'}">{saveMessage}{#if saveMessage === $localizedText.editor.saveFailed}<button type="button" class="underline underline-offset-2 hover:opacity-70" on:click={saveContent}>{$localizedText.editor.retry}</button>{/if}</p>

        <div class="relative" data-panel-anchor="export">
          <button
            type="button"
            bind:this={propertyTriggers.export}
            data-testid="export-button"
            aria-haspopup="dialog"
            aria-expanded={propertyPanel === 'export'}
            aria-label={$localizedText.editor.exportLabel}
            class="inline-flex h-7 items-center gap-1.5 rounded-ui px-2 text-xs transition max-sm:h-auto max-sm:min-h-11 max-sm:min-w-11 max-sm:flex-col max-sm:justify-center max-sm:gap-0.5 max-sm:px-1 hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--text-primary)] {propertyPanel === 'export' ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}"
            on:click={() => togglePropertyPanel('export')}
          >
            <Download size="14" strokeWidth="1.7" aria-hidden="true" />
            <span class="hidden sm:inline">{$localizedText.editor.exportLabel}</span>
          </button>
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
        <!-- The ⋯ button also anchors the password panel: locking a note is an action on the note, not one of its fields. -->
        <div class="relative" data-footer-more data-panel-anchor="lock">
          <TooltipIconButton
            type="button"
            data-testid="editor-more"
            class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-ui text-[var(--text-secondary)] max-sm:h-11 max-sm:w-11 transition hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--text-primary)] {footerMoreOpen ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : ''}"
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
              <button type="button" role="menuitem" data-testid="menu-lock" class="flex w-full items-center gap-3 rounded-ui px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)]" on:click={() => { propertyTriggers.lock = document.querySelector('[data-testid="editor-more"]'); togglePropertyPanel('lock'); }}>
                <Lock size="16" strokeWidth="1.7" aria-hidden="true" />{$localizedText.editor.lockMenu}
              </button>
              <button type="button" role="menuitem" data-testid="toggle-focus-mode" class="flex w-full items-center gap-3 rounded-ui px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)]" on:click={() => { focusMode = !focusMode; footerMoreOpen = false; }}>
                <Focus size="16" strokeWidth="1.7" aria-hidden="true" />{focusMode ? $localizedText.editor.focusOff : $localizedText.editor.focusOn}
              </button>
              <button type="button" role="menuitem" data-testid="toggle-raw-mode" class="flex w-full items-center gap-3 rounded-ui px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)]" on:click={() => { flushEditorMarkdown(); rawMode = !rawMode; footerMoreOpen = false; }}>
                <FileText size="16" strokeWidth="1.7" aria-hidden="true" />{rawMode ? $localizedText.editor.richMode : $localizedText.editor.rawMode}
              </button>
              <button type="button" role="menuitem" data-testid="toggle-note-color" class="flex w-full items-center gap-3 rounded-ui px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)]" on:click={() => { footerMoreOpen = false; togglePropertyPanel('color'); }}>
                <Palette size="16" strokeWidth="1.7" aria-hidden="true" />{$localizedText.editor.noteColor}
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
  <div class="fixed bottom-6 right-6 z-[200] animate-toast-in">
    <div class="rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-5 py-3 max-w-xs text-sm shadow-2xl">
      {formatToast}
    </div>
  </div>
{/if}
