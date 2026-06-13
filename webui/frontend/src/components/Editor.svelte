<script>
  import { onDestroy, createEventDispatcher } from 'svelte';
  import EditorHeader from './EditorHeader.svelte';
  import ModalShell from './ModalShell.svelte';
  import RichEditor from './RichEditor.svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { editorState, editorAction } from '../stores.js';
  import {
    deleteFileRequest,
    formatAllNotes,
    getWordCharStats,
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
  import { localizedText } from '../lib/strings.js';
  import { Palette, Trash2, Wand } from 'lucide-svelte';

  let richEditor;

  const dispatch = createEventDispatcher();

  export let currentFile;

  let content = '';
  let editedContent = '';
  let title = '';
  let editedTitle = '';
  let fileInfo = null;
  let isLoading = true;
  let isSaving = false;
  let isDeleting = false;
  let isFormatting = false;
  let formatToast = '';
  let formatToastTimer;
  let showDeleteConfirm = false;
  let imageRename = null;
  let attachmentNewName = '';
  let autosaveTimer;
  let lastSaved = null;
  let saveMessage = '';
  let saveMessageTimeout;
  const AUTOSAVE_DELAY = 1500;
  let backlinks = [];
  let editableTags = [];
  let metadataTimer;
  const METADATA_DELAY = 1200;
  let loadedFilePath = null;
  let loadRequestId = 0;
  let colorPaletteOpen = false;
  let currentNoteColor = '';
  let isColorSaving = false;

  const colorOptions = [
    '#a89984', '#928374', '#fb4934', '#fe8019', '#fabd2f',
    '#b8bb26', '#8ec07c', '#83a598', '#458588', '#d3869b'
  ];

  function isCurrentLoad(requestId, filePath) {
    return requestId === loadRequestId && currentFile?.path === filePath;
  }

  function quoteYamlString(value) {
    return JSON.stringify(String(value || ''));
  }

  function upsertContentFrontmatter(noteContent, metadata = {}) {
    const rawContent = String(noteContent || '');
    const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    const frontmatter = match ? match[1] : '';
    const body = match ? rawContent.slice(match[0].length) : rawContent;
    const reservedKeys = new Set(['title', 'category', 'tags']);
    const preservedLines = frontmatter
      .split(/\r?\n/)
      .filter((line) => {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex === -1) return line.trim();
        return !reservedKeys.has(line.slice(0, separatorIndex).trim().toLowerCase());
      });

    const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
    const lines = [];
    if (metadata.title) lines.push(`title: ${quoteYamlString(metadata.title)}`);
    if (metadata.category) lines.push(`category: ${quoteYamlString(metadata.category)}`);
    lines.push(`tags: [${tags.map((tag) => quoteYamlString(tag)).join(', ')}]`);
    lines.push(...preservedLines);

    return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\s*\n/, '')}`;
  }

  function splitContentFrontmatter(noteContent) {
    const rawContent = String(noteContent || '');
    const match = rawContent.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
    if (!match) return { frontmatter: '', body: rawContent };
    return {
      frontmatter: match[0].trimEnd(),
      body: rawContent.slice(match[0].length).replace(/^\s*\n/, ''),
    };
  }

  function richEditorBody(noteContent) {
    return splitContentFrontmatter(noteContent).body;
  }

  function replaceContentBody(noteContent, nextBody) {
    const { frontmatter } = splitContentFrontmatter(noteContent);
    return frontmatter
      ? `${frontmatter}\n\n${String(nextBody || '').replace(/^\s*\n/, '')}`
      : String(nextBody || '');
  }

  function tagsEqual(a = [], b = []) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function hasMetadataChanges() {
    const currentTags = fileInfo?.metadata?.tags || [];
    return editedTitle !== title || !tagsEqual(editableTags, currentTags);
  }

  async function loadBacklinks(filePath = currentFile?.path) {
    if (!filePath || currentFile?.isDir) return;
    try {
      backlinks = await loadBacklinksRequest(filePath);
    } catch (error) {
      console.error('Failed to load backlinks:', error);
    }
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
    return displayImageSrc(currentFile?.path, src);
  }

  function resolveEditorImagePath(src) {
    return resolveMarkdownImagePath(currentFile?.path, src);
  }

  async function handleImageFile(file) {
    if (!currentFile?.path) return null;
    try {
      const converted = await convertImageToWebp(file, { name: defaultImageName() });
      const uploaded = await uploadAttachment(currentFile.path, converted, converted.name);
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
    if (!currentFile?.path || !imageRename?.path || !attachmentNewName.trim()) return;
    try {
      const renamed = await renameAttachment(currentFile.path, imageRename.path, attachmentNewName.trim());
      const nextContent = replaceMarkdownImagePath(
        editedContent,
        renamed.oldRelativePath,
        renamed.relativePath,
      );
      editedContent = nextContent;
      if (richEditor) richEditor.setMarkdown(richEditorBody(nextContent));
      if (autosaveTimer) clearTimeout(autosaveTimer);
      isSaving = true;
      saveMessage = $localizedText.editor.saving;
      await saveFileContent(currentFile.path, nextContent);
      content = nextContent;
      saveMessage = $localizedText.editor.saved;
      lastSaved = Date.now();
      if (saveMessageTimeout) clearTimeout(saveMessageTimeout);
      saveMessageTimeout = setTimeout(() => {
        if (saveMessage === $localizedText.editor.saved) saveMessage = '';
      }, 3000);
      imageRename = null;
      attachmentNewName = '';
    } catch (error) {
      console.error('Image rename failed:', error);
      formatToast = $localizedText.editor.imageRenameFailed;
      if (formatToastTimer) clearTimeout(formatToastTimer);
      formatToastTimer = setTimeout(() => formatToast = '', 3000);
    } finally {
      isSaving = false;
    }
  }

  async function handleFormat() {
    if (isFormatting) return;
    isFormatting = true;
    try {
      formatToast = (await formatAllNotes()).message;
      dispatch('formatComplete');
    } catch (e) { formatToast = $localizedText.editor.formatFailed; }
    finally {
      isFormatting = false;
      if (formatToastTimer) clearTimeout(formatToastTimer);
      formatToastTimer = setTimeout(() => formatToast = '', 3000);
    }
  }

  async function loadFile() {
    if (!currentFile || currentFile.isDir) return;
    const filePath = currentFile.path;
    const fileName = currentFile.name;
    const requestId = ++loadRequestId;
    loadedFilePath = filePath;

    try {
      isLoading = true;
      const data = await loadFileContent(filePath);
      if (!isCurrentLoad(requestId, filePath)) return;
      content = data.content;
      editedContent = content;

      const nextFileInfo = await loadFileInfo(filePath);
      if (!isCurrentLoad(requestId, filePath)) return;
      fileInfo = nextFileInfo;
      currentNoteColor = nextFileInfo.color || '';
      title = fileInfo.metadata?.title || fileName.replace('.md', '');
      editedTitle = title;
      editableTags = fileInfo.metadata?.tags || [];
      
      await loadBacklinks(filePath);
      if (!isCurrentLoad(requestId, filePath)) return;
      dispatch('fileOpened', filePath);
    } catch (error) {
      if (!isCurrentLoad(requestId, filePath)) return;
      console.error('Failed to load file:', error);
      content = '';
      editedContent = '';
      title = '';
      editedTitle = '';
      fileInfo = null;
      currentNoteColor = '';
      dispatch('fileDeleted');
    } finally {
      if (isCurrentLoad(requestId, filePath)) isLoading = false;
    }
  }

  function scheduleAutosave() {
    if (!currentFile || !hasUnsavedChanges() || isSaving) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveContent, AUTOSAVE_DELAY);
  }

  async function saveContent() {
    if (!currentFile || !hasUnsavedChanges() || isSaving) return;

    if (autosaveTimer) clearTimeout(autosaveTimer);
    if (saveMessageTimeout) clearTimeout(saveMessageTimeout);
    const filePath = currentFile.path;
    const savedContent = editedContent;
    const savedTitle = editedTitle;

    try {
      isSaving = true;
      saveMessage = $localizedText.editor.saving;
      await saveFileContent(filePath, savedContent);

      if (currentFile?.path === filePath && editedContent === savedContent) content = savedContent;
      if (currentFile?.path === filePath && editedTitle === savedTitle) title = savedTitle;
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

  async function saveMetadataFields() {
    if (!currentFile || !fileInfo || !hasMetadataChanges()) return;
    if (metadataTimer) clearTimeout(metadataTimer);
    const nextContent = upsertContentFrontmatter(editedContent, {
      title: editedTitle,
      category: fileInfo.metadata?.category || '',
      tags: editableTags,
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
    try {
      isDeleting = true;
      await deleteFileRequest(currentFile.path);
      showDeleteConfirm = false;
      dispatch('fileDeleted');
      dispatch('syncComplete');
    } catch (error) {
      alert($localizedText.editor.deleteError(error.message));
    } finally {
      isDeleting = false;
    }
  }

  async function setNoteColor(color) {
    if (!currentFile?.path || isColorSaving) return;
    const nextColor = color || '';
    try {
      isColorSaving = true;
      await setItemColorRequest(currentFile.path, nextColor || null);
      currentNoteColor = nextColor;
      fileInfo = fileInfo ? { ...fileInfo, color: nextColor || null } : fileInfo;
      dispatch('noteColorChanged', { path: currentFile.path, color: nextColor || null });
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
    if (autosaveTimer) clearTimeout(autosaveTimer);
    if (currentFile && hasUnsavedChanges() && !isSaving) {
      const filePath = currentFile.path;
      const savedContent = editedContent;
      const savedTitle = editedTitle;
      isSaving = true;
      saveFileContent(filePath, savedContent).then(() => {
        if (currentFile?.path === filePath && editedContent === savedContent) content = savedContent;
        if (currentFile?.path === filePath && editedTitle === savedTitle) title = savedTitle;
        lastSaved = Date.now();
      }).catch((error) => {
        console.error('Save on destroy failed:', error);
      }).finally(() => {
        isSaving = false;
      });
    }
    editorState.set({ path: null, dirty: false, saving: false });
  });

  $: wordCharStats = getWordCharStats(editedContent);

  $: if (currentFile?.path && !currentFile.isDir && currentFile.path !== loadedFilePath) loadFile();

  let ignoreRichUpdate = false;
  $: richContentForEditor = richEditorBody(editedContent);

  $: if (richEditor && !ignoreRichUpdate) {
    const md = richEditor.getMarkdown();
    if (md !== richContentForEditor) {
      richEditor.setMarkdown(richContentForEditor);
    }
  }

  $: if ($editorAction && currentFile) {
    const action = $editorAction;
    editorAction.set(null);
    if (action === 'format') handleFormat();
    else if (action === 'delete') showDeleteConfirm = true;
  }
</script>

<div class="h-full flex flex-col bg-[var(--bg-primary)] overflow-hidden relative min-h-0">
  <EditorHeader
    bind:editedTitle
    {currentFile}
    {fileInfo}
    {wordCharStats}
  />
  <div class="border-b border-[var(--border-subtle)]"></div>
  {#if !isLoading && backlinks.length > 0}
    <div class="border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/20 px-4 py-2 lg:px-12" data-testid="local-navigation">
      <div class="flex items-center gap-3 overflow-x-auto">
        <span class="shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]/70">
          {$localizedText.editor.localNavigation}
        </span>
        {#each backlinks.slice(0, 8) as item}
          <TooltipIconButton
            type="button"
            class="group flex shrink-0 items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-1.5 text-left transition hover:border-[var(--text-secondary)]/50 hover:bg-[var(--bg-secondary)]"
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

  <!-- Content Area -->
  {#if isLoading}
    <div class="flex-1 flex items-center justify-center">
      <span class="text-xs uppercase tracking-widest animate-pulse">{$localizedText.editor.gatheringThoughts}</span>
    </div>
  {:else}
    <div class="flex-1 flex flex-col min-w-0 min-h-0">
      <RichEditor
        bind:this={richEditor}
        content={richContentForEditor}
        placeholder={$localizedText.editor.beginWriting}
        notePath={currentFile?.path}
        onImageFile={handleImageFile}
        resolveImageSrc={resolveEditorImageSrc}
        resolveImagePath={resolveEditorImagePath}
        onUpdate={(md) => { ignoreRichUpdate = true; editedContent = replaceContentBody(editedContent, md); ignoreRichUpdate = false; }}
        on:imageClick={openImageRename}
      />
    </div>
  {/if}

  {#if !isLoading && currentFile && !currentFile.isDir}
    <div class="h-16 shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]/95 px-3 sm:px-4 lg:px-8">
      <div class="flex h-full items-center gap-2">
        <TooltipIconButton
          type="button"
          class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--text-primary)] {colorPaletteOpen ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : ''}"
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
              class="flex h-8 shrink-0 items-center rounded-full border px-3 text-[11px] font-bold uppercase tracking-[0.12em] transition hover:border-[var(--text-secondary)] disabled:opacity-40 {currentNoteColor === '' ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'}"
              disabled={isColorSaving}
              on:click={() => setNoteColor('')}
            >
              {$localizedText.editor.noColor}
            </button>
            {#each colorOptions as color}
              <button
                type="button"
                class="h-8 w-8 shrink-0 rounded-full border-2 transition hover:scale-105 disabled:opacity-40 {currentNoteColor === color ? 'border-[var(--text-primary)]' : 'border-transparent'}"
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
  <ModalShell title={$localizedText.editor.archiveTitle} widthClass="w-[90%] lg:w-[32rem]" on:close={() => showDeleteConfirm = false}>
      <p class="text-[var(--text-secondary)] text-base lg:text-lg mb-10 font-serif italic">
        {$localizedText.editor.archiveConfirm(currentFile.name)}
      </p>
      <div class="flex flex-col lg:flex-row gap-4 lg:gap-8">
        <button on:click={() => showDeleteConfirm = false} class="flex-1 text-sm font-medium uppercase tracking-widest hover:opacity-60 transition py-2">{$localizedText.editor.cancel}</button>
        <button on:click={deleteFile} disabled={isDeleting} class="flex-1 text-sm font-bold uppercase tracking-widest text-red-500 hover:opacity-60 transition disabled:opacity-30 py-2">
          {isDeleting ? $localizedText.editor.archiving : $localizedText.editor.deletePermanently}
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
        class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none"
        on:keydown={(e) => { if (e.key === 'Enter') saveImageRename(); if (e.key === 'Escape') imageRename = null; }}
      />
    </div>
    <div class="mt-8 flex gap-6">
      <button on:click={() => imageRename = null} class="flex-1 text-sm font-medium hover:opacity-60 transition">
        {$localizedText.editor.cancel}
      </button>
      <button on:click={saveImageRename} disabled={!attachmentNewName.trim()} class="flex-1 text-sm font-bold uppercase tracking-widest hover:opacity-60 transition disabled:opacity-30">
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
