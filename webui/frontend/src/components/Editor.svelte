<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import FileInfo from './FileInfo.svelte';

  const dispatch = createEventDispatcher();

  /**
   * @typedef {Object} CurrentFile
   * @property {string} path - File path
   * @property {string} name - File name
   * @property {boolean} isDir - Is directory flag
   */

  /** @type {CurrentFile} */
  export let currentFile;

  /** @type {string} */
  let content = '';

  /** @type {string} */
  let editedContent = '';

  /** @type {string} */
  let title = '';

  /** @type {string} */
  let editedTitle = '';

  /** @type {Object} */
  let fileInfo = null;

  /** @type {boolean} */
  let isLoading = true;

  /** @type {boolean} */
  let isSaving = false;

  /** @type {string} */
  let error = '';

  /** @type {string} */
  let success = '';

  /** @type {boolean} */
  let isRenaming = false;

  /** @type {string} */
  let newFileName = '';

  /** @type {boolean} */
  let showDeleteConfirm = false;

  /** @type {boolean} */
  let isDeleting = false;

  /** @type {boolean} */
  let isEditing = false;

  /**
   * Load file content from API
   */
  async function loadFileContent() {
    try {
      isLoading = true;
      error = '';
      success = '';

      // Don't load content for directories
      if (currentFile.isDir) {
        error = 'Cannot load content for directories';
        isLoading = false;
        return;
      }

      const response = await fetch(`/api/file?path=${encodeURIComponent(currentFile.path)}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      content = data.content;
      editedContent = content;

      // Extract title from first markdown heading (skip YAML frontmatter)
      // Remove YAML frontmatter if present
      let contentWithoutFrontmatter = content;
      if (content.startsWith('---')) {
        const endFrontmatter = content.indexOf('---', 3);
        if (endFrontmatter !== -1) {
          contentWithoutFrontmatter = content.substring(endFrontmatter + 3);
        }
      }

      const titleMatch = contentWithoutFrontmatter.match(/^#\s+(.+?)$/m);
      title = titleMatch ? titleMatch[1] : currentFile.name;
      editedTitle = title;

      // Load file info
      await loadFileInfo();
    } catch (err) {
      error = `Failed to load file: ${err.message}`;
      console.error(error);
    } finally {
      isLoading = false;
    }
  }

  /**
   * Load file metadata
   */
  async function loadFileInfo() {
    try {
      const response = await fetch(`/api/file-info?path=${encodeURIComponent(currentFile.path)}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      fileInfo = await response.json();
    } catch (err) {
      console.error('Failed to load file info:', err.message);
    }
  }

  /**
   * Save file content to API
   */
  async function saveContent() {
    try {
      isSaving = true;
      error = '';
      success = '';

      const response = await fetch(`/api/file?path=${encodeURIComponent(currentFile.path)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editedContent })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      content = editedContent;
      success = 'File saved successfully';
      setTimeout(() => {
        success = '';
      }, 3000);

      // Reload file info to update modified time
      await loadFileInfo();
    } catch (err) {
      error = `Failed to save file: ${err.message}`;
      console.error(error);
    } finally {
      isSaving = false;
    }
  }

  /**
   * Rename file
   */
  async function renameFile() {
    if (!newFileName.trim() || newFileName.trim() === currentFile.name) {
      isRenaming = false;
      return;
    }

    try {
      isSaving = true;
      error = '';

      const response = await fetch(`/api/file/rename?path=${encodeURIComponent(currentFile.path)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: newFileName.trim() })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      currentFile.path = data.path;
      currentFile.name = newFileName.trim();
      isRenaming = false;
      success = 'File renamed successfully';
      setTimeout(() => {
        success = '';
      }, 3000);

      // Reload file info
      await loadFileInfo();
    } catch (err) {
      error = `Failed to rename file: ${err.message}`;
      console.error(error);
    } finally {
      isSaving = false;
    }
  }

  /**
   * Delete file
   */
  async function deleteFile() {
    try {
      isDeleting = true;
      error = '';

      const response = await fetch(`/api/file?path=${encodeURIComponent(currentFile.path)}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      dispatch('fileDeleted', { path: currentFile.path });
    } catch (err) {
      error = `Failed to delete file: ${err.message}`;
      console.error(error);
    } finally {
      isDeleting = false;
      showDeleteConfirm = false;
    }
  }

  /**
   * Check if content has unsaved changes
   */
  function hasUnsavedChanges() {
    return editedContent !== content;
  }

  /**
   * Discard changes
   */
  function discardChanges() {
    editedContent = content;
    editedTitle = title;
  }

  /**
   * Strip YAML frontmatter from content
   */
  function stripFrontmatter(text) {
    if (text.startsWith('---')) {
      const endFrontmatter = text.indexOf('---', 3);
      if (endFrontmatter !== -1) {
        return text.substring(endFrontmatter + 3).trim();
      }
    }
    return text;
  }

  /**
   * Toggle editing mode
   */
  function toggleEditing() {
    if (isEditing) {
      discardChanges();
    }
    isEditing = !isEditing;
  }

  /**
   * Parse markdown to HTML (basic implementation using marked)
   * For production, you might want to use a library like marked.js
   */
  function markdownToHtml(md) {
    if (typeof window !== 'undefined' && window.marked) {
      return window.marked.parse(md);
    }
    // Fallback: simple markdown parsing
    let html = md
      .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
      .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '</p><p>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
    return html;
  }

  $: if (currentFile) {
    loadFileContent();
  }
</script>

<div class="h-full flex flex-col bg-white dark:bg-slate-900">
  <!-- Header with Title and Actions -->
  <div class="border-b border-gray-200 dark:border-gray-700 px-6 py-4 space-y-3">
    <!-- Title Section -->
    <div class="flex items-center justify-between">
      <div class="flex-1">
        {#if isEditing}
          <input
            type="text"
            bind:value={editedTitle}
            class="text-2xl font-bold bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded px-3 py-2 text-gray-900 dark:text-gray-100 w-full"
          />
        {:else}
          <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {title}
          </h1>
        {/if}
      </div>
    </div>

    <!-- File Path -->
    <p class="text-sm text-gray-500 dark:text-gray-400 font-mono">
      {currentFile.path}
    </p>

    <!-- Action Buttons -->
    <div class="flex flex-wrap gap-2 items-center">
      {#if hasUnsavedChanges()}
        <button
          on:click={saveContent}
          disabled={isSaving}
          class="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium transition flex items-center gap-2"
        >
          {#if isSaving}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          {/if}
          Save
        </button>
        <button
          on:click={discardChanges}
          class="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg font-medium transition"
        >
          Discard
        </button>
      {/if}

      <button
        on:click={toggleEditing}
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
        title={isEditing ? 'Stop editing' : 'Edit title and metadata'}
      >
        {isEditing ? '✓ Done' : '✏️ Edit'}
      </button>

      <button
        on:click={() => {
          isRenaming = !isRenaming;
          newFileName = currentFile.name;
        }}
        class="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg font-medium transition"
        title="Rename file"
      >
        📝 Rename
      </button>

      <button
        on:click={() => {
          showDeleteConfirm = true;
        }}
        class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition"
        title="Delete file"
      >
        🗑️ Delete
      </button>
    </div>

    <!-- Rename Input -->
    {#if isRenaming}
      <div class="flex gap-2">
        <input
          type="text"
          bind:value={newFileName}
          placeholder="New file name..."
          class="flex-1 px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-900 dark:text-gray-100"
        />
        <button
          on:click={renameFile}
          disabled={isSaving}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition"
        >
          Confirm
        </button>
        <button
          on:click={() => {
            isRenaming = false;
          }}
          class="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg font-medium transition"
        >
          Cancel
        </button>
      </div>
    {/if}

    <!-- Success/Error Messages -->
    {#if success}
      <div class="p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-600 dark:text-green-200">
        ✓ {success}
      </div>
    {/if}

    {#if error}
      <div class="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-200">
        ✗ {error}
      </div>
    {/if}
  </div>

  <!-- Content Area -->
  {#if isLoading}
    <div class="flex-1 flex items-center justify-center">
      <div class="text-center text-gray-500 dark:text-gray-400">
        <svg class="w-8 h-8 animate-spin mx-auto mb-2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p class="text-sm">Loading...</p>
      </div>
    </div>
  {:else}
    <div class="flex-1 flex overflow-hidden gap-4 p-4">
      <!-- Editor Panel -->
      <div class="flex-1 flex flex-col min-w-0">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Markdown</h2>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {editedContent.length}
            characters
          </span>
        </div>
        <textarea
          bind:value={editedContent}
          class="flex-1 px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-lg font-mono text-sm resize-none focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder="Write your markdown here..."
        />
      </div>

      <!-- Preview Panel -->
      <div class="flex-1 flex flex-col min-w-0">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Preview</h2>
        </div>
        <div
          class="flex-1 overflow-y-auto px-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-lg prose prose-sm dark:prose-invert max-w-none"
        >
          <!-- Markdown Preview -->
          <div class="space-y-4 text-gray-900 dark:text-gray-100">
            {#each stripFrontmatter(editedContent).split('\n\n') as paragraph}
              {#if paragraph.startsWith('# ')}
                <h1 class="text-2xl font-bold">
                  {paragraph.replace(/^#\s+/, '')}
                </h1>
              {:else if paragraph.startsWith('## ')}
                <h2 class="text-xl font-bold">
                  {paragraph.replace(/^##\s+/, '')}
                </h2>
              {:else if paragraph.startsWith('### ')}
                <h3 class="text-lg font-bold">
                  {paragraph.replace(/^###\s+/, '')}
                </h3>
              {:else if paragraph.startsWith('- ')}
                <ul class="list-disc list-inside space-y-1">
                  {#each paragraph.split('\n') as item}
                    {#if item.startsWith('- ')}
                      <li>{item.replace(/^-\s+/, '')}</li>
                    {/if}
                  {/each}
                </ul>
              {:else if paragraph.startsWith('> ')}
                <blockquote class="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic">
                  {paragraph.replace(/^>\s+/, '')}
                </blockquote>
              {:else if paragraph.trim()}
                <p>
                  {@html paragraph
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/\`(.*?)\`/g, '<code class="bg-gray-100 dark:bg-slate-700 px-1 rounded">$1</code>')
                    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-blue-600 dark:text-blue-400 underline">$1</a>')}
                </p>
              {/if}
            {/each}
          </div>
        </div>
      </div>

      <!-- File Info Sidebar -->
      <div class="w-72 flex flex-col min-w-0">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">File Info</h2>
        <div class="flex-1 overflow-y-auto">
          <FileInfo {fileInfo} />
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 w-96 shadow-lg">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Delete File</h3>

      <p class="text-gray-600 dark:text-gray-300 mb-6">
        Are you sure you want to delete <strong>{currentFile.name}</strong>? This action cannot be undone.
      </p>

      <div class="flex gap-2">
        <button
          on:click={() => {
            showDeleteConfirm = false;
          }}
          disabled={isDeleting}
          class="flex-1 px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 disabled:opacity-50 text-gray-900 dark:text-gray-100 rounded-lg font-medium transition"
        >
          Cancel
        </button>
        <button
          on:click={deleteFile}
          disabled={isDeleting}
          class="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 disabled:opacity-50 text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
        >
          {#if isDeleting}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          {/if}
          Delete
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  textarea {
    font-family: 'Courier New', Courier, monospace;
  }

  :global(.prose) {
    font-size: inherit;
  }

  :global(.prose h1) {
    font-size: 1.875rem;
    font-weight: 700;
    margin: 1rem 0 0.5rem;
  }

  :global(.prose h2) {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 1rem 0 0.5rem;
  }

  :global(.prose h3) {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0.75rem 0 0.5rem;
  }

  :global(.prose p) {
    margin: 0.5rem 0;
    line-height: 1.6;
  }

  :global(.prose code) {
    font-family: 'Courier New', Courier, monospace;
  }

  :global(.prose a) {
    text-decoration: underline;
  }
</style>
