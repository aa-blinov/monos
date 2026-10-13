<script>
  import { onDestroy, createEventDispatcher } from 'svelte';
  import EditorHeader from './EditorHeader.svelte';
  import ModalShell from './ModalShell.svelte';
  import RichEditor from './RichEditor.svelte';
  import OutlinePanel from './OutlinePanel.svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { editorState, editorAction, noteSaveSignal, activeTheme } from '../stores.js';
  import { getNoteColorOptions } from '../lib/note-colors.js';
  import { getModalButtonClass } from '../lib/modal-button.js';
  import { formFieldClass } from '../lib/form-field.js';
  import { dueLabel, dueStatus, parseFrontmatter, setFrontmatterKey, splitFrontmatter, upsertFrontmatter } from '../lib/frontmatter.js';
  import { notifyDue } from '../lib/reminders.js';
  import {
    deleteFileRequest,
    loadBacklinksRequest,
    loadFileContent,
    loadFileInfo,
    renameAttachment,
    saveFileContent,
    saveFileMetadata,
    setItemColorRequest,
    uploadAttachment,
  } from '../lib/editor-api.js';
  import {
    convertImageToWebp,
    defaultImageName,
    displayImageSrc,
    replaceMarkdownImagePath,
    resolveMarkdownImagePath,
  } from '../lib/attachments.js';
  import { localizedText, locale } from '../lib/strings.js';
  import { wordStats } from '../lib/word-stats.js';
  import { taskProgress as taskProgressOf } from '../lib/task-progress.js';
  import { resolveRegion, summarizeConflicts } from '../lib/conflict-markers.js';
  import ConflictNoteView from './ConflictNoteView.svelte';
  import NoteHistoryModal from './NoteHistoryModal.svelte';
  import { Palette, Trash2, FileText, Pencil, CalendarDays, X, Focus, Pin } from 'lucide-svelte';

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
  // Дедлайн заметки живёт в YAML-шапке и потому переживает перезагрузку,
  // экспорт в PDF и попадает в git как обычная строка.
  let dueDate = '';
  let dueInput = '';
  let showDueInput = false;

  $: dueDate = parseFrontmatter(editedContent).due;
  $: if (dueDate !== dueInput && document.activeElement?.dataset?.testid !== 'due-input') {
    dueInput = dueDate;
  }
  let title = '';
  let editedTitle = '';
  let fileInfo = null;
  let isLoading = true;
  let isSaving = false;
  let isDeleting = false;
  let deleteError = '';
  let wordCharStats = '';
  let conflictCount = 0;
  let conflictNotice = '';
  let showHistory = false;
  let historyNote = null;
  let formatToast = '';
  let formatToastTimer;
  let showDeleteConfirm = false;
  let imageRename = null;
  let attachmentNewName = '';
  let autosaveTimer;
  let lastSaved = null;
  let saveMessage = '';
  let saveMessageTimeout;
  // 1250 + 250 мс на сбор разметки редактором = прежние 1500 мс от последнего
  // нажатия до сохранения. Без этой поправки отложенная сериализация незаметно
  // удлинила бы окно, за которым правка ещё не записана на диск.
  const AUTOSAVE_DELAY = 1250;
  let backlinks = [];
  let editableTags = [];
  let editableCategory = '';
  let metadataTimer;
  const METADATA_DELAY = 1200;
  let loadedFilePath = null;
  let loadingFilePath = null;
  let displayedFile = null;
  let visibleFile = null;
  let loadRequestId = 0;
  let failedLoadPath = null;
  let colorPaletteOpen = false;
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
    dueInput = value || '';
  }

  function richEditorBody(noteContent) {
    return splitFrontmatter(noteContent).body;
  }

  function replaceContentBody(noteContent, nextBody) {
    const { frontmatter } = splitFrontmatter(noteContent);
    return frontmatter
      ? `${frontmatter}\n\n${String(nextBody || '').replace(/^\s*\n/, '')}`
      : String(nextBody || '');
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

  function relationLabel(type) {
    return type === 'mention' ? $localizedText.sourceEditor.mention : $localizedText.sourceEditor.backlink;
  }

  function relatedNoteLabel(item) {
    return `${item?.name || ''} · ${relationLabel(item?.type)}`;
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

  async function saveImageRename() {
    const filePath = visibleFile?.path || loadedFilePath || currentFile?.path;
    if (!filePath || !imageRename?.path || !attachmentNewName.trim()) return;
    try {
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
      const nextBacklinks = await fetchBacklinks(filePath);
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
      loadedFilePath = filePath;
      displayedFile = { ...currentFile };
      dispatch('fileOpened', filePath);
    } catch (error) {
      if (!isCurrentLoad(requestId, filePath)) return;
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
      if (isCurrentLoad(requestId, filePath)) {
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
      saveMessage = $localizedText.editor.saveFailed;
      saveMessageTimeout = setTimeout(() => {
        if (saveMessage === $localizedText.editor.saveFailed) saveMessage = '';
      }, 5000);
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
      saveMessage = $localizedText.editor.saveFailed;
      saveMessageTimeout = setTimeout(() => {
        if (saveMessage === $localizedText.editor.saveFailed) saveMessage = '';
      }, 5000);
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
  function applyTagsInput(value) {
    editableTags = String(value || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    void saveMetadataFields();
  }

  function togglePinned() {
    editedContent = setFrontmatterKey(editedContent, 'pinned', noteIsPinned() ? '' : 'true');
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

  async function deleteFile() {
    const filePath = currentFile?.path;
    if (!filePath) return;
    try {
      isDeleting = true;
      await deleteFileRequest(filePath);
      showDeleteConfirm = false;
      if (currentFile?.path === filePath || loadedFilePath === filePath) {
        dispatch('fileDeleted');
        dispatch('syncComplete');
      }
    } catch (error) {
      deleteError = $localizedText.editor.deleteError(error.message);
    } finally {
      isDeleting = false;
    }
  }

  function handleOutlineNavigate(event) {
    const { text } = event.detail || {};
    if (!text || !richEditor) return;
    if (!richEditor.scrollToHeadingText?.(text)) {
      // fallback: попробуем найти по anchor id, если рендерер когда-то добавит
      const target = document.getElementById(event.detail.anchor || '');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  onDestroy(() => {
    flushEditorMarkdown();
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    if (loadedFilePath && hasUnsavedChanges() && !isSaving) {
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

  // Фокус сужает колонку и убирает подсветку цвета заметки: на экране остаётся
  // только текст, который пишется прямо сейчас.
  $: noteSurfaceStyle = focusMode
    ? '--content-width: 46rem; --note-page-bg: var(--bg-primary); --note-page-panel: var(--bg-primary); --note-page-soft: transparent; --note-page-border: var(--border-subtle);'
    : currentNoteColor
    ? `--note-accent: ${currentNoteColor}; --note-page-bg: color-mix(in srgb, ${currentNoteColor} 12%, var(--bg-primary)); --note-page-panel: color-mix(in srgb, ${currentNoteColor} 9%, var(--bg-primary)); --note-page-soft: color-mix(in srgb, ${currentNoteColor} 16%, transparent); --note-page-border: color-mix(in srgb, ${currentNoteColor} 30%, var(--border-subtle));`
    : '--note-page-bg: var(--bg-primary); --note-page-panel: var(--bg-primary); --note-page-soft: transparent; --note-page-border: var(--border-subtle);';

  $: if ($editorAction && currentFile) {
    const action = $editorAction;
    editorAction.set(null);
    if (action === 'delete') showDeleteConfirm = true;
  }
</script>

<div
  class="h-full flex flex-col bg-[var(--note-page-bg)] overflow-hidden relative min-h-0"
  style={noteSurfaceStyle}
  data-testid="editor-shell"
>
  <EditorHeader
    bind:editedTitle
    currentFile={visibleFile}
    {fileInfo}
    {wordCharStats}
    {taskProgress}
    historyAvailable={Boolean(loadedFilePath) && conflictCount === 0}
    onOpenHistory={() => { showHistory = true; historyNote = visibleFile; }}
  />

  {#if showHistory && historyNote?.path}
    <NoteHistoryModal
      notePath={(historyNote.path || '').replace(/^notes\//, '')}
      on:close={() => { showHistory = false; }}
      on:restored={async () => { if (loadedFilePath) await loadFile(); }}
    />
  {/if}
  <div class="border-b border-[var(--note-page-border)]"></div>
  {#if backlinks.length > 0}
    <div class="border-b border-[var(--note-page-border)] bg-[var(--note-page-soft)] px-4 py-2 lg:px-12" data-testid="local-navigation">
      <div class="flex items-center gap-3 overflow-x-auto">
        <span class="shrink-0 text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
          {$localizedText.editor.localNavigation}
        </span>
        {#each backlinks.slice(0, 8) as item}
          <TooltipIconButton
            type="button"
            class="group flex shrink-0 items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-1.5 text-left transition hover:border-[var(--text-secondary)]/50 hover:bg-[var(--bg-secondary)]"
            on:click={() => openLinkedNote(item)}
            label={relatedNoteLabel(item)}
            tooltip={`${item.path} · ${relationLabel(item.type)}`}
          >
            <span class="max-w-40 truncate text-xs font-medium">{item.name}</span>
          </TooltipIconButton>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Свойства заметки: то, что лежит в шапке файла, но редактировалось раньше
       только в настройках. Панель узкая и всегда на виду — иначе срок и теги
       приходилось бы искать по интерфейсу, чтобы поставить галочку.
       Во время загрузки следующей заметки свойства и нижняя панель не снимаются
       из DOM — иначе они моргали бы при каждом переключении. Вместо этого они
       inert: их контролы относятся к запрошенной заметке, а текст ещё от прежней. -->
  {#if displayedFile && !displayedFile.isDir}
    <div class="flex flex-wrap items-center gap-2 border-b border-[var(--note-page-border)] bg-[var(--note-page-soft)] px-4 py-2 lg:px-12" data-testid="note-properties" inert={isLoading}>
      <label class="flex items-center gap-1.5">
        <span class="text-[length:var(--text-whisper)] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{$localizedText.editor.propertyCategory}</span>
        <input
          type="text"
          data-testid="property-category"
          bind:value={editableCategory}
          on:change={saveMetadataFields}
          placeholder={$localizedText.editor.propertyCategoryEmpty}
          class="h-8 w-40 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)]"
        />
      </label>

      <label class="flex items-center gap-1.5">
        <span class="text-[length:var(--text-whisper)] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{$localizedText.editor.propertyTags}</span>
        <input
          type="text"
          data-testid="property-tags"
          value={editableTags.join(', ')}
          on:change={(e) => applyTagsInput(e.currentTarget.value)}
          placeholder={$localizedText.editor.propertyTagsEmpty}
          class="h-8 w-56 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)]"
        />
      </label>

      <label class="flex items-center gap-1.5">
        <span class="text-[length:var(--text-whisper)] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{$localizedText.editor.propertyDue}</span>
        <input
          type="date"
          data-testid="property-due"
          bind:value={dueInput}
          on:change={(e) => applyDue(e.currentTarget.value)}
          class="h-8 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)]"
        />
      </label>

      <TooltipIconButton
        type="button"
        data-testid="property-pin"
        class="flex h-8 w-8 items-center justify-center rounded-md border {pinnedNow ? 'border-[var(--text-secondary)] text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'} bg-[var(--bg-primary)] transition hover:border-[var(--text-secondary)]/50"
        on:click={togglePinned}
        label={pinnedNow ? $localizedText.editor.pinUnpin : $localizedText.editor.pinDo}
        tooltip={pinnedNow ? $localizedText.editor.pinUnpin : $localizedText.editor.pinDo}
      >
        <Pin size="14" strokeWidth="1.7" aria-hidden="true" />
      </TooltipIconButton>
    </div>
  {/if}

  <!-- Content Area -->
  {#if isLoading && !displayedFile}
    <div class="flex-1 flex items-center justify-center">
      <span class="text-xs uppercase tracking-widest animate-pulse">{$localizedText.editor.gatheringThoughts}</span>
    </div>
  {:else}
    <div class="flex-1 flex min-w-0 min-h-0">
      <div class="flex-1 flex flex-col min-w-0 min-h-0">
        {#if conflictCount > 0}
          <div class="mb-4 border border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-3">
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
          resolveImageSrc={resolveEditorImageSrc}
          resolveImagePath={resolveEditorImagePath}
          onUpdate={(md) => { ignoreRichUpdate = true; editedContent = replaceContentBody(editedContent, md); ignoreRichUpdate = false; }}
          on:imageClick={openImageRename}
        />
        {/if}
      </div>
      {#if !focusMode}
        <OutlinePanel content={content} on:navigate={handleOutlineNavigate} />
      {/if}
    </div>
  {/if}

  {#if displayedFile && !displayedFile.isDir}
    <div class="h-16 shrink-0 border-t border-[var(--note-page-border)] bg-[var(--note-page-panel)] px-3 sm:px-4 lg:px-8" data-testid="editor-footer" inert={isLoading}>
      <div class="flex h-full items-center gap-2">
        <TooltipIconButton
          type="button"
          data-testid="toggle-focus-mode"
          class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--text-primary)] {focusMode ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : ''}"
          label={focusMode ? $localizedText.editor.focusOff : $localizedText.editor.focusOn}
          tooltip={focusMode ? $localizedText.editor.focusOff : $localizedText.editor.focusOn}
          tooltipAlign="start"
          on:click={() => focusMode = !focusMode}
        >
          <Focus size="20" strokeWidth="1.7" aria-hidden="true" />
        </TooltipIconButton>

        <TooltipIconButton
          type="button"
          data-testid="toggle-raw-mode"
          class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--text-primary)] {rawMode ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : ''}"
          label={rawMode ? $localizedText.editor.richMode : $localizedText.editor.rawMode}
          tooltip={rawMode ? $localizedText.editor.richMode : $localizedText.editor.rawMode}
          tooltipAlign="start"
          on:click={() => { flushEditorMarkdown(); rawMode = !rawMode; }}
        >
          {#if rawMode}
            <Pencil class="h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
          {:else}
            <FileText class="h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
          {/if}
        </TooltipIconButton>

        {#if dueDate}
          <TooltipIconButton
            type="button"
            data-testid="clear-due"
            class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--text-primary)]"
            label={$localizedText.editor.dueClear}
            tooltip={$localizedText.editor.dueClear}
            tooltipAlign="start"
            on:click={() => applyDue('')}
          >
            <X class="h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
          </TooltipIconButton>
        {/if}

        <TooltipIconButton
          type="button"
          class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--text-primary)] {dueDate ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : ''}"
          label={$localizedText.editor.due}
          tooltip={$localizedText.editor.due}
          tooltipAlign="start"
          on:click={() => showDueInput = !showDueInput}
        >
          <CalendarDays class="h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
        </TooltipIconButton>

        {#if showDueInput}
          <div
            class="flex shrink-0 items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1.5"
            data-testid="due-popover"
          >
            <input
              data-testid="due-input"
              type="date"
              class="bg-transparent text-[length:var(--text-whisper-lg)] text-[var(--text-primary)] outline-none"
              bind:value={dueInput}
              on:change={(e) => applyDue(e.currentTarget.value)}
            />
          </div>
        {/if}

        {#if dueDate}
          <span
            data-testid="due-label"
            data-status={dueStatusOf}
            class="shrink-0 rounded-full px-2.5 py-1 text-[length:var(--text-whisper-lg)] uppercase tracking-[0.12em] {dueStatusOf === 'overdue'
              ? 'bg-[color-mix(in_srgb,var(--red)_14%,transparent)] text-[var(--red)]'
              : dueStatusOf === 'today'
                ? 'bg-[color-mix(in_srgb,var(--yellow)_18%,transparent)] text-[var(--yellow)]'
                : 'text-[var(--text-muted)]'}"
          >
            {dueLabelOf}
          </span>
        {/if}

        <TooltipIconButton
          type="button"
          class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--text-primary)] {colorPaletteOpen ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : ''}"
          label={$localizedText.editor.noteColor}
          tooltip={$localizedText.editor.noteColor}
          tooltipAlign="start"
          on:click={() => colorPaletteOpen = !colorPaletteOpen}
        >
          <Palette class="h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
        </TooltipIconButton>

        {#if colorPaletteOpen}
          <div class="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1" aria-label={$localizedText.editor.noteColor}>
            <button
              type="button"
              class="flex h-8 shrink-0 items-center rounded-md border px-3 text-[length:var(--text-whisper-lg)] font-bold uppercase tracking-[0.12em] transition hover:border-[var(--text-secondary)] disabled:opacity-40 {currentNoteColor === '' ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'}"
              disabled={isColorSaving}
              on:click={() => setNoteColor('')}
            >
              {$localizedText.editor.noColor}
            </button>
            {#each colorOptions as color}
              <button
                type="button"
                class="h-8 w-8 shrink-0 rounded-sm border-2 transition hover:scale-105 disabled:opacity-40 {currentNoteColor === color ? 'border-[var(--text-primary)]' : 'border-transparent'}"
                style="background: {color};"
                disabled={isColorSaving}
                aria-label={$localizedText.app.board.applyColor(color)}
                on:click={() => setNoteColor(color)}
              ></button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
  <ModalShell title={$localizedText.editor.archiveTitle} widthClass="w-[90%] lg:w-[32rem]" on:close={() => { showDeleteConfirm = false; deleteError = ''; }}>
      <p class="text-[var(--text-secondary)] text-base lg:text-lg mb-10 font-serif italic">
        {$localizedText.editor.archiveConfirm(currentFile.name)}
      </p>
      {#if deleteError}
        <p class="mb-6 border border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[color-mix(in_srgb,var(--red)_12%,transparent)] px-4 py-3 text-sm leading-relaxed text-[var(--red)]">
          {deleteError}
        </p>
      {/if}
      <div class="flex flex-col lg:flex-row gap-4 lg:gap-8">
        <button on:click={() => showDeleteConfirm = false} class={getModalButtonClass('secondary', { extraClass: 'py-2' })}>{$localizedText.editor.cancel}</button>
        <button
          on:click={deleteFile}
          disabled={isDeleting}
          class={getModalButtonClass('primary', { disabled: isDeleting, extraClass: 'text-[var(--red)] py-2' })}
        >
          {isDeleting ? $localizedText.editor.archiving : $localizedText.editor.moveToTrash}
        </button>
      </div>
  </ModalShell>
{/if}

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
    </div>
    <div class="mt-8 flex gap-6">
      <button on:click={() => imageRename = null} class={getModalButtonClass('secondary')}>
        {$localizedText.editor.cancel}
      </button>
      <button on:click={saveImageRename} disabled={!attachmentNewName.trim()} class={getModalButtonClass('primary', { disabled: !attachmentNewName.trim() })}>
        {$localizedText.editor.renameImage}
      </button>
    </div>
  </ModalShell>
{/if}

{#if formatToast}
  <div class="fixed bottom-6 right-6 z-[200] animate-toast-in">
    <div class="border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-5 py-3 max-w-xs text-sm shadow-2xl">
      {formatToast}
    </div>
  </div>
{/if}
