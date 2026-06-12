<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import EditorHeader from './EditorHeader.svelte';
  import ModalShell from './ModalShell.svelte';
  import RichEditor from './RichEditor.svelte';
  import SourceEditor from './SourceEditor.svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { editMode, editorState } from '../stores.js';
  import {
    deleteFileRequest,
    formatAllNotes,
    getWordCharStats,
    loadBacklinksRequest,
    loadFileContent,
    loadFileInfo,
    renameAttachment,
    resolveWikiLink,
    saveFileContent,
    saveFileMetadata,
    saveSettingsRequest,
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
  import { FileCode, PencilLine, Trash2, Wand } from 'lucide-svelte';

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
  let phoneEditor = typeof window !== 'undefined' && window.innerWidth < 640;

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

  async function handleWikiLinkClick(target) {
    try {
      const data = await resolveWikiLink(target);
      if (data && data.path) {
        dispatch('navigate', { path: data.path, name: data.name, isDir: false });
      } else {
        alert($localizedText.editor.noteNotFound(target));
      }
    } catch (error) {
      console.error('Error resolving wiki-link:', error);
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
      if (richEditor && $editMode === 'rich') richEditor.setMarkdown(richEditorBody(nextContent));
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

  function toggleEditorMode() {
    if (phoneEditor) return;
    const nextMode = $editMode === 'rich' ? 'source' : 'rich';
    $editMode = nextMode;
    saveSettingsRequest({ editMode: nextMode }).catch((error) => {
      console.error('Failed to save editor mode:', error);
    });
  }

  function updatePhoneEditorMode() {
    phoneEditor = window.innerWidth < 640;
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

  function hasUnsavedChanges() {
    return editedContent !== content || editedTitle !== title;
  }

  $: editorState.set({
    path: currentFile?.path || null,
    dirty: hasUnsavedChanges(),
    saving: isSaving,
  });

  onDestroy(() => {
    editorState.set({ path: null, dirty: false, saving: false });
  });

  $: wordCharStats = getWordCharStats(editedContent);
  $: effectiveEditMode = phoneEditor ? 'rich' : $editMode;

  $: if (currentFile?.path && !currentFile.isDir && currentFile.path !== loadedFilePath) loadFile();

  let ignoreRichUpdate = false;
  $: richContentForEditor = richEditorBody(editedContent);

  $: if (richEditor && effectiveEditMode === 'rich' && !ignoreRichUpdate) {
    const md = richEditor.getMarkdown();
    if (md !== richContentForEditor) {
      richEditor.setMarkdown(richContentForEditor);
    }
  }

  onMount(() => {
    updatePhoneEditorMode();
    window.addEventListener('resize', updatePhoneEditorMode);
    return () => window.removeEventListener('resize', updatePhoneEditorMode);
  });
</script>

<div class="h-full flex flex-col bg-[var(--bg-primary)] overflow-hidden relative min-h-0">
  <!-- Note actions (top-right corner) -->
  <div class="absolute top-2 right-3 lg:top-4 lg:right-12 flex items-center gap-2 z-10">
    {#if !phoneEditor}
      <TooltipIconButton
        on:click={toggleEditorMode}
        class="group relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)]/50 hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-subtle)]"
        label={`${$localizedText.header.switchEditorMode}: ${$editMode === 'rich' ? $localizedText.header.source : $localizedText.header.rich}`}
        tooltip={`${$localizedText.header.switchEditorMode}: ${$editMode === 'rich' ? $localizedText.header.source : $localizedText.header.rich}`}
        tooltipAlign="end"
      >
        {#if $editMode === 'rich'}
          <FileCode class="h-4 w-4" strokeWidth="1.7" aria-hidden="true" />
        {:else}
          <PencilLine class="h-4 w-4" strokeWidth="1.7" aria-hidden="true" />
        {/if}
      </TooltipIconButton>
    {/if}
    <TooltipIconButton
      on:click={handleFormat}
      disabled={isFormatting}
      class="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--bg-secondary)]/50 hover:opacity-60 transition disabled:opacity-30"
      label={$localizedText.editor.formatAllNotes}
      tooltip={$localizedText.editor.formatAllNotes}
      tooltipAlign="end"
    >
      <Wand size="18" class="lg:w-5 lg:h-5" />
    </TooltipIconButton>
    <TooltipIconButton
      on:click={() => showDeleteConfirm = true}
      class="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--bg-secondary)]/50 hover:opacity-60 transition"
      label={$localizedText.editor.deleteNote}
      tooltip={$localizedText.editor.deleteNote}
      tooltipAlign="end"
    >
      <Trash2 class="w-4 h-4 lg:w-5 lg:h-5" color="var(--red)" strokeWidth="1.7" aria-hidden="true" />
    </TooltipIconButton>
  </div>

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
    {#if effectiveEditMode === 'rich'}
      <!-- Rich mode: full-width editor, no reader -->
      <div class="flex-1 flex flex-col min-w-0 min-h-0">
        <RichEditor
          bind:this={richEditor}
          content={richContentForEditor}
          placeholder={$localizedText.editor.beginWriting}
          onImageFile={handleImageFile}
          resolveImageSrc={resolveEditorImageSrc}
          resolveImagePath={resolveEditorImagePath}
          onUpdate={(md) => { ignoreRichUpdate = true; editedContent = replaceContentBody(editedContent, md); ignoreRichUpdate = false; }}
          on:imageClick={openImageRename}
        />
      </div>
    {:else}
      <!-- Source mode: split editor + preview -->
      <SourceEditor
        bind:content={editedContent}
        {backlinks}
        notePath={currentFile?.path}
        onImageFile={handleImageFile}
        on:wikiLinkClick={(e) => handleWikiLinkClick(e.detail)}
        on:imageClick={openImageRename}
      />
    {/if}
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
