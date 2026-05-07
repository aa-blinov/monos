<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import RichEditor from './RichEditor.svelte';
  import SourceEditor from './SourceEditor.svelte';
  import { editMode } from '../stores.js';
  import { Wand } from 'lucide-svelte';

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
  let autosaveTimer;
  let lastSaved = null;
  let saveMessage = '';
  let saveMessageTimeout;
  const AUTOSAVE_DELAY = 1500;
  let activeTab = 'source';
  let isSyncScrollEnabled = true;

  let backlinks = [];
  let isLoadingBacklinks = false;

  let editorRef;
  let previewRef;
  let activePane = null; // 'editor' or 'preview'

  let showMetadata = false;
  let editableTags = [];
  let metadataTimer;
  const METADATA_DELAY = 1200;

  function handleEditorScroll() {
    if (!isSyncScrollEnabled || activePane !== 'editor' || !editorRef || !previewRef) return;
    const scrollPercentage = editorRef.scrollTop / (editorRef.scrollHeight - editorRef.clientHeight);
    previewRef.scrollTop = scrollPercentage * (previewRef.scrollHeight - previewRef.clientHeight);
  }

  function handlePreviewScroll() {
    if (!isSyncScrollEnabled || activePane !== 'preview' || !editorRef || !previewRef) return;
    const scrollPercentage = previewRef.scrollTop / (previewRef.scrollHeight - previewRef.clientHeight);
    editorRef.scrollTop = scrollPercentage * (editorRef.scrollHeight - editorRef.clientHeight);
  }

  async function loadBacklinks() {
    if (!currentFile || currentFile.isDir) return;
    try {
      isLoadingBacklinks = true;
      const response = await fetch(`/api/notes/backlinks?path=${encodeURIComponent(currentFile.path)}`);
      backlinks = await response.json();
    } catch (error) {
      console.error('Failed to load backlinks:', error);
    } finally {
      isLoadingBacklinks = false;
    }
  }

  async function handleWikiLinkClick(target) {
    try {
      const response = await fetch(`/api/notes/resolve-link?name=${encodeURIComponent(target)}`);
      const data = await response.json();
      if (data && data.path) {
        dispatch('navigate', { path: data.path, name: data.name, isDir: false });
      } else {
        alert(`Note "${target}" not found.`);
      }
    } catch (error) {
      console.error('Error resolving wiki-link:', error);
    }
  }

  function handlePreviewClick(e) {
    const target = e.target.closest('.wikilink');
    if (target) {
      handleWikiLinkClick(target.dataset.target);
    }
  }

  async function handleFormat() {
    if (isFormatting) return;
    isFormatting = true;
    try {
      const r = await fetch('/api/format', { method: 'POST' });
      formatToast = (await r.json()).message;
      dispatch('formatComplete');
    } catch (e) { formatToast = 'Format failed'; }
    finally {
      isFormatting = false;
      if (formatToastTimer) clearTimeout(formatToastTimer);
      formatToastTimer = setTimeout(() => formatToast = '', 3000);
    }
  }

  async function loadFile() {
    if (!currentFile || currentFile.isDir) return;

    try {
      isLoading = true;
      const response = await fetch(`/api/file?path=${encodeURIComponent(currentFile.path)}`);
      if (!response.ok) throw new Error('File not found');
      const data = await response.json();
      content = data.content;
      editedContent = content;

      const infoResponse = await fetch(`/api/file-info?path=${encodeURIComponent(currentFile.path)}`);
      if (!infoResponse.ok) throw new Error('File info not found');
      fileInfo = await infoResponse.json();
      title = fileInfo.metadata?.title || currentFile.name.replace('.md', '');
      editedTitle = title;
      editableTags = fileInfo.metadata?.tags || [];
      
      await loadBacklinks();
      dispatch('fileOpened', currentFile.path);
    } catch (error) {
      console.error('Failed to load file:', error);
      content = '';
      editedContent = '';
      title = '';
      editedTitle = '';
      fileInfo = null;
      dispatch('fileDeleted');
    } finally {
      isLoading = false;
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

    try {
      isSaving = true;
      saveMessage = 'Saving…';

      const response = await fetch(`/api/file?path=${encodeURIComponent(currentFile.path)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editedContent })
      });

      if (!response.ok) throw new Error('Failed to save');

      content = editedContent;
      title = editedTitle;
      await loadFile();
      saveMessage = 'Saved';
      lastSaved = Date.now();
      saveMessageTimeout = setTimeout(() => {
        if (saveMessage === 'Saved') saveMessage = '';
      }, 3000);
    } catch (error) {
      saveMessage = 'Save failed';
      saveMessageTimeout = setTimeout(() => {
        if (saveMessage === 'Save failed') saveMessage = '';
      }, 5000);
      console.error('Save failed:', error);
    } finally {
      isSaving = false;
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
    if (!currentFile || !fileInfo) return;
    if (metadataTimer) clearTimeout(metadataTimer);
    const payload = { title: editedTitle, tags: editableTags };
    try {
      const response = await fetch(`/api/file/metadata?path=${encodeURIComponent(currentFile.path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('Failed to save metadata');
      const meta = await response.json();
      title = meta.title || title;
    } catch (e) {
      console.error('Metadata save failed:', e);
    }
  }

  function scheduleMetadataSave() {
    if (metadataTimer) clearTimeout(metadataTimer);
    metadataTimer = setTimeout(saveMetadataFields, METADATA_DELAY);
  }

  function addTag(e) {
    if (e.key === 'Enter' && e.target.value.trim()) {
      const newTags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
      editableTags = [...editableTags, ...newTags];
      e.target.value = '';
      scheduleMetadataSave();
    }
  }

  function removeTag(i) {
    editableTags = editableTags.filter((_, idx) => idx !== i);
    scheduleMetadataSave();
  }

  async function deleteFile() {
    try {
      isDeleting = true;
      const response = await fetch(`/api/file?path=${encodeURIComponent(currentFile.path)}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete');

      showDeleteConfirm = false;
      dispatch('fileDeleted');
      dispatch('syncComplete');
    } catch (error) {
      alert('Ошибка при удалении: ' + error.message);
    } finally {
      isDeleting = false;
    }
  }

  function hasUnsavedChanges() {
    return editedContent !== content || editedTitle !== title;
  }

  onMount(loadFile);

  onDestroy(() => {
    if (hasUnsavedChanges() && currentFile) {
      const blob = new Blob([JSON.stringify({ content: editedContent })], { type: 'application/json' });
      navigator.sendBeacon(`/api/file?path=${encodeURIComponent(currentFile.path)}`, blob);
    }
  });

  $: wordCharStats = (() => {
    const txt = editedContent || '';
    const words = txt.trim() ? txt.trim().split(/\s+/).length : 0;
    return `${words} words · ${txt.length} chars`;
  })();

  $: if (currentFile) loadFile();

  let ignoreRichUpdate = false;
  $: if (richEditor && $editMode === 'rich' && !ignoreRichUpdate) {
    const md = richEditor.getMarkdown();
    if (md !== editedContent) {
      richEditor.setMarkdown(editedContent);
    }
  }
</script>

<div class="h-full flex flex-col bg-[var(--bg-primary)] overflow-hidden relative min-h-0">
  <!-- Delete + Format buttons (top-right corner) -->
  <div class="absolute top-2 right-3 lg:top-4 lg:right-12 flex items-center gap-2 z-10">
    <button
      on:click={handleFormat}
      disabled={isFormatting}
      class="p-1 hover:opacity-60 transition-opacity disabled:opacity-30"
      title="Format all notes"
    >
      <Wand size="18" class="lg:w-5 lg:h-5" />
    </button>
    <button
      on:click={() => showDeleteConfirm = true}
      class="p-1 hover:opacity-60 transition-opacity"
      title="Delete note"
    >
      <svg class="w-4 h-4 lg:w-5 lg:h-5" fill="none" stroke="#fb4934" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
      </svg>
    </button>
  </div>

  <!-- Header with Title and Actions -->
  <div class="px-4 lg:px-12 pt-3 pb-2 lg:pt-5 lg:pb-3 space-y-2 lg:space-y-3">
    <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4 lg:gap-12">
      <div class="flex-1 min-w-0">
        <input
          type="text"
          bind:value={editedTitle}
          placeholder="Note Title"
          class="text-lg lg:text-3xl font-serif font-medium tracking-tight bg-transparent outline-none w-full pb-1 !border-none"
        />
        {#if fileInfo}
          <div class="flex items-center gap-x-4 mt-0.5">
            <p class="text-[10px] lg:text-[11px] text-[var(--text-muted)]">
              Created {new Date(fileInfo.created).toLocaleString()} · Modified {new Date(fileInfo.modified).toLocaleString()}
            </p>
            {#if editableTags.length > 0}
              {#each editableTags as tag, i}
                <span class="inline-flex items-center gap-1 px-2 py-0.5 border border-[var(--border-subtle)] text-[11px]">
                  #{tag}
                  <button on:click={() => removeTag(i)} class="hover:opacity-60">&times;</button>
                </span>
              {/each}
            {/if}
            <input
              placeholder="+ tag"
              on:keydown={addTag}
              class="bg-transparent border-b border-transparent focus:border-[var(--border-subtle)] outline-none py-0.5 text-[11px] w-16"
            />
            <span class="text-[10px] lg:text-[11px] text-[var(--text-muted)] ml-auto tabular-nums">{wordCharStats}</span>
          </div>
        {/if}
      </div>
    </div>
  </div>
  <div class="border-b border-[var(--border-subtle)]"></div>

  <!-- Content Area -->
  {#if isLoading}
    <div class="flex-1 flex items-center justify-center">
      <span class="text-xs uppercase tracking-widest animate-pulse">Gathering Thoughts</span>
    </div>
  {:else}
    {#if $editMode === 'rich'}
      <!-- Rich mode: full-width editor, no reader -->
      <div class="flex-1 flex flex-col min-w-0 min-h-0">
        <RichEditor
          bind:this={richEditor}
          content={editedContent}
          placeholder="Begin writing..."
          onUpdate={(md) => { ignoreRichUpdate = true; editedContent = md; ignoreRichUpdate = false; }}
        />
      </div>
    {:else}
      <!-- Source mode: split editor + preview -->
      <SourceEditor
        bind:content={editedContent}
        {backlinks}
        on:wikiLinkClick={(e) => handleWikiLinkClick(e.detail)}
      />
    {/if}
  {/if}
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
  <div class="fixed inset-0 bg-black/20 dark:bg-[var(--bg-tertiary)]/50 backdrop-blur-sm flex items-center justify-center z-50">
    <div class="bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-8 lg:p-12 w-[90%] lg:w-[32rem] shadow-2xl">
      <h3 class="text-2xl lg:text-3xl font-serif mb-6 tracking-tight">Archive this thought?</h3>
      <p class="text-[var(--text-secondary)] text-base lg:text-lg mb-10 font-serif italic">
        Are you sure you want to remove <strong>{currentFile.name}</strong>? This path cannot be retraced.
      </p>
      <div class="flex flex-col lg:flex-row gap-4 lg:gap-8">
        <button on:click={() => showDeleteConfirm = false} class="flex-1 text-sm font-medium uppercase tracking-widest hover:opacity-60 transition py-2">Cancel</button>
        <button on:click={deleteFile} disabled={isDeleting} class="flex-1 text-sm font-bold uppercase tracking-widest text-red-500 hover:opacity-60 transition disabled:opacity-30 py-2">
          {isDeleting ? 'Archiving...' : 'Delete Permanently'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if formatToast}
  <div class="fixed bottom-6 right-6 z-[200] animate-toast-in">
    <div class="border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-5 py-3 max-w-xs text-sm shadow-2xl">
      {formatToast}
    </div>
  </div>
{/if}

<style>
  textarea {
    scrollbar-width: none;
  }
  textarea::-webkit-scrollbar {
    display: none;
  }
  
  :global(.wikilink) {
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
  }
</style>
