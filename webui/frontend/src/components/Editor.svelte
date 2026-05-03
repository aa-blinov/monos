<script>
  import { onMount, createEventDispatcher } from 'svelte';

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
  let showDeleteConfirm = false;
  let activeTab = 'reader'; // 'source' or 'reader' for mobile
  let isSyncScrollEnabled = true;

  let backlinks = [];
  let isLoadingBacklinks = false;

  let editorRef;
  let previewRef;
  let activePane = null; // 'editor' or 'preview'

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
        dispatch('selectFile', { path: data.path, name: data.name, isDir: false });
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

  async function loadFile() {
    if (!currentFile || currentFile.isDir) return;

    try {
      isLoading = true;
      const response = await fetch(`/api/file?path=${encodeURIComponent(currentFile.path)}`);
      const data = await response.json();
      content = data.content;
      editedContent = content;

      const infoResponse = await fetch(`/api/file-info?path=${encodeURIComponent(currentFile.path)}`);
      fileInfo = await infoResponse.json();
      title = fileInfo.metadata?.title || currentFile.name.replace('.md', '');
      editedTitle = title;
      
      await loadBacklinks();
    } catch (error) {
      console.error('Failed to load file:', error);
    } finally {
      isLoading = false;
    }
  }

  async function saveContent() {
    if (!currentFile) return;

    try {
      isSaving = true;
      const response = await fetch(`/api/file?path=${encodeURIComponent(currentFile.path)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editedContent })
      });

      if (!response.ok) throw new Error('Failed to save');

      content = editedContent;
      title = editedTitle;
      await loadFile();
    } catch (error) {
      alert('Ошибка при сохранении: ' + error.message);
    } finally {
      isSaving = false;
    }
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

  function parseFrontmatter(text) {
    if (text.startsWith('---')) {
      const parts = text.split('---');
      if (parts.length >= 3) {
        const yamlStr = parts[1];
        const metadata = {};
        yamlStr.split('\n').forEach(line => {
          const [key, ...valParts] = line.split(':');
          if (key && valParts.length > 0) {
            metadata[key.trim()] = valParts.join(':').trim();
          }
        });
        return {
          metadata,
          content: parts.slice(2).join('---').trim()
        };
      }
    }
    return { metadata: null, content: text };
  }

  onMount(loadFile);

  $: if (currentFile) loadFile();
</script>

<div class="h-full flex flex-col bg-[var(--bg-primary)] overflow-hidden">
  <!-- Header with Title and Actions -->
  <div class="px-6 lg:px-12 py-6 lg:py-10 space-y-4 lg:space-y-6">
    <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4 lg:gap-12">
      <div class="flex-1 min-w-0">
        <input
          type="text"
          bind:value={editedTitle}
          placeholder="Note Title"
          class="text-3xl lg:text-5xl font-serif font-medium tracking-tight bg-transparent border-b border-transparent hover:border-[var(--border-subtle)] focus:border-[var(--text-primary)] outline-none w-full pb-2 transition-colors"
        />
        <p class="text-[10px] lg:text-xs font-mono uppercase tracking-widest text-[var(--text-secondary)] mt-2 lg:mt-4 truncate">
          {currentFile.path}
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-4 lg:gap-6 lg:pt-2">
        {#if hasUnsavedChanges()}
          <button
            on:click={saveContent}
            disabled={isSaving}
            class="text-xs lg:text-sm font-bold uppercase tracking-widest hover:opacity-60 transition"
          >
            {isSaving ? 'Saving' : 'Save'}
          </button>
        {/if}

        <button
          on:click={() => showDeleteConfirm = true}
          class="text-xs lg:text-sm font-medium uppercase tracking-widest text-red-500 hover:opacity-60 transition"
        >
          Delete
        </button>
      </div>
    </div>

    <!-- Mobile Tab Toggle -->
    <div class="flex lg:hidden border-b border-[var(--border-subtle)] pb-2 gap-6">
      <button 
        class="text-[10px] uppercase tracking-[0.2em] font-medium transition-opacity {activeTab === 'reader' ? 'opacity-100 border-b border-[var(--text-primary)]' : 'opacity-40'}"
        on:click={() => activeTab = 'reader'}
      >Reader</button>
      <button 
        class="text-[10px] uppercase tracking-[0.2em] font-medium transition-opacity {activeTab === 'source' ? 'opacity-100 border-b border-[var(--text-primary)]' : 'opacity-40'}"
        on:click={() => activeTab = 'source'}
      >Source</button>
    </div>
  </div>

  <!-- Content Area -->
  {#if isLoading}
    <div class="flex-1 flex items-center justify-center">
      <span class="text-xs uppercase tracking-widest animate-pulse">Gathering Thoughts</span>
    </div>
  {:else}
    <div class="flex-1 flex overflow-hidden border-t border-[var(--border-subtle)] relative">
      <!-- Editor Panel -->
      <div class="flex-1 flex flex-col min-w-0 border-r border-[var(--border-subtle)] {activeTab === 'source' ? 'flex' : 'hidden lg:flex'}">
        <div class="hidden lg:flex px-12 py-4 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] z-10">
          <div class="flex items-center gap-6">
            <span class="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-medium">Markdown</span>
            <label class="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" bind:checked={isSyncScrollEnabled} class="hidden" />
              <div class="w-2 h-2 rounded-full transition-colors {isSyncScrollEnabled ? 'bg-[var(--text-primary)]' : 'bg-transparent border border-[var(--text-secondary)]'} group-hover:opacity-70"></div>
              <span class="text-[9px] uppercase tracking-[0.15em] font-bold {isSyncScrollEnabled ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] opacity-50'}">Sync Scroll</span>
            </label>
          </div>
          <span class="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
            {editedContent.length} chars
          </span>
        </div>
        <textarea
          bind:this={editorRef}
          bind:value={editedContent}
          on:scroll={handleEditorScroll}
          on:mouseenter={() => activePane = 'editor'}
          class="flex-1 px-6 lg:px-12 py-6 lg:py-10 bg-transparent font-mono text-xs lg:text-sm leading-relaxed resize-none focus:outline-none placeholder-[var(--text-secondary)]/30"
          placeholder="Begin writing..."
        />
      </div>

      <!-- Preview Panel -->
      <div 
        on:mouseenter={() => activePane = 'preview'}
        class="flex-1 flex flex-col min-w-0 bg-[var(--bg-primary)] {activeTab === 'reader' ? 'flex' : 'hidden lg:flex'}"
      >
        <div class="hidden lg:flex px-12 py-4 items-center border-b border-[var(--border-subtle)]">
          <span class="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-medium">Reader</span>
        </div>
        <div 
          bind:this={previewRef}
          on:scroll={handlePreviewScroll}
          on:click={handlePreviewClick}
          class="flex-1 overflow-y-auto px-6 lg:px-12 py-8 lg:py-12 prose-typography"
        >
          <!-- Markdown Preview -->
          <div class="max-w-2xl mx-auto">
            {#if parseFrontmatter(editedContent).metadata}
              <div class="mb-12 pb-8 border-b border-[var(--border-subtle)] opacity-60">
                <div class="grid grid-cols-2 gap-4 text-xs font-mono">
                  {#each Object.entries(parseFrontmatter(editedContent).metadata) as [key, value]}
                    {#if value}
                      <span class="text-[var(--text-secondary)]">{key}:</span>
                      <span class="text-[var(--text-primary)]">{value}</span>
                    {/if}
                  {/each}
                </div>
              </div>
            {/if}
            {#each parseFrontmatter(editedContent).content.split('\n\n') as paragraph}
              {#if paragraph.startsWith('# ')}
                <h1 class="text-xl font-bold mb-6">
                  {paragraph.replace(/^#\s+/, '')}
                </h1>
              {:else if paragraph.startsWith('## ')}
                <h2 class="text-lg font-bold mt-8 mb-4">
                  {paragraph.replace(/^##\s+/, '')}
                </h2>
              {:else if paragraph.startsWith('### ')}
                <h3 class="text-base font-bold mt-6 mb-3">
                  {paragraph.replace(/^###\s+/, '')}
                </h3>
              {:else if paragraph.startsWith('- ')}
                <ul class="list-disc ml-6 space-y-1 mb-4">
                  {#each paragraph.split('\n') as item}
                    {#if item.startsWith('- ')}
                      <li class="text-sm leading-relaxed">{item.replace(/^-\s+/, '')}</li>
                    {/if}
                  {/each}
                </ul>
              {:else if paragraph.startsWith('> ')}
                <blockquote class="border-l-2 border-[var(--text-primary)] pl-6 italic my-6 text-sm text-[var(--text-secondary)]">
                  {paragraph.replace(/^>\s+/, '')}
                </blockquote>
              {:else if paragraph.trim()}
                <p class="text-sm leading-relaxed mb-4">
                  {@html paragraph
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/\`(.*?)\`/g, '<code class="bg-gray-100 dark:bg-gray-900 px-1.5 py-0.5 rounded font-mono text-xs">$1</code>')
                    .replace(/\[\[(.*?)\]\]/g, (match, p1) => {
                      const [target, label] = p1.split('|');
                      return `<button class="wikilink underline underline-offset-4 decoration-[var(--border-subtle)] hover:decoration-[var(--text-primary)] transition-colors" data-target="${target.trim()}">${(label || target).trim()}</button>`;
                    })
                    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="underline underline-offset-4 decoration-[var(--text-secondary)] hover:decoration-[var(--text-primary)]">$1</a>')}
                </p>
              {/if}
            {/each}

            <!-- Backlinks Section -->
            {#if backlinks.length > 0}
              <div class="mt-20 pt-12 border-t border-[var(--border-subtle)]">
                <h3 class="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)] mb-8">Linked Mentions</h3>
                <div class="grid grid-cols-1 gap-8">
                  {#each backlinks as link}
                    <button 
                      on:click={() => dispatch('selectFile', { path: link.path, name: link.name, isDir: false })}
                      class="text-left group"
                    >
                      <div class="text-lg font-serif group-hover:underline decoration-[var(--border-subtle)]">{link.name}</div>
                      <div class="text-[9px] uppercase tracking-widest text-[var(--text-secondary)] mt-1 opacity-50">{link.path}</div>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
  <div class="fixed inset-0 bg-black/20 dark:bg-white/5 backdrop-blur-sm flex items-center justify-center z-50">
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
