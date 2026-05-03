<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import FileTree from './FileTree.svelte';

  const dispatch = createEventDispatcher();

  /** @type {Object} */
  let tree = null;
  /** @type {string} */
  let searchQuery = '';
  /** @type {string} */
  let selectedPath = null;
  /** @type {boolean} */
  let isLoading = true;
  /** @type {string} */
  let error = '';

  /** @type {boolean} */
  let showCreateModal = false;
  /** @type {boolean} */
  let showCreateFolderModal = false;

  /** @type {string} */
  let newNoteTitle = '';
  /** @type {string} */
  let newNoteCategory = '';
  /** @type {string} */
  let newFolderName = '';

  /** @type {boolean} */
  let isCreating = false;

  // Export loadTree to be callable from parent
  export async function loadTree() {
    try {
      isLoading = true;
      error = '';
      const response = await fetch('/api/tree');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      tree = await response.json();
    } catch (err) {
      error = `Failed to load tree: ${err.message}`;
    } finally {
      isLoading = false;
    }
  }

  async function createFolder() {
    if (!newFolderName.trim()) return;
    try {
      isCreating = true;
      const response = await fetch(`/api/directory/create?path=${encodeURIComponent(newFolderName)}`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      showCreateFolderModal = false;
      newFolderName = '';
      await loadTree();
    } catch (err) {
      error = `Failed to create folder: ${err.message}`;
    } finally {
      isCreating = false;
    }
  }

  async function createNewNote() {
    if (!newNoteTitle.trim()) return;
    try {
      isCreating = true;
      const response = await fetch('/api/notes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newNoteTitle,
          category: newNoteCategory,
          tags: [],
          content: ''
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      showCreateModal = false;
      newNoteTitle = '';
      newNoteCategory = '';
      await loadTree();
      dispatch('selectFile', { path: data.path, name: newNoteTitle, isDir: false });
    } catch (err) {
      error = `Failed to create note: ${err.message}`;
    } finally {
      isCreating = false;
    }
  }

  function filterNode(node, query) {
    if (!query.trim()) return node;
    const lowerQuery = query.toLowerCase();
    const nameMatches = node.name.toLowerCase().includes(lowerQuery);
    if (node.is_dir && node.children) {
      const filteredChildren = node.children
        .map(child => filterNode(child, query))
        .filter(child => child !== null);
      if (filteredChildren.length > 0 || nameMatches) {
        return { ...node, children: filteredChildren };
      }
      return null;
    }
    return nameMatches ? node : null;
  }

  function getFilteredTree() {
    if (!tree) return null;
    if (!searchQuery.trim()) return tree;
    const filtered = filterNode(tree, searchQuery);
    return filtered || { ...tree, children: [] };
  }

  function handleSelectFile(event) {
    selectedPath = event.detail.path;
    dispatch('selectFile', event.detail);
  }

  function clearSearch() {
    searchQuery = '';
  }

  onMount(loadTree);
</script>

<div class="h-full flex flex-col bg-[var(--bg-primary)]">
  <!-- Search Section -->
  <div class="p-6 space-y-4">
    <div class="relative group">
      <input
        type="text"
        placeholder="Search..."
        bind:value={searchQuery}
        class="w-full bg-transparent border-b border-[var(--border-subtle)] focus:border-[var(--text-primary)] py-2 text-sm outline-none transition-all placeholder-[var(--text-secondary)]"
      />
      {#if searchQuery}
        <button
          on:click={clearSearch}
          class="absolute right-0 top-1/2 -translate-y-1/2 p-1 hover:opacity-60 transition"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>

    <!-- Action Buttons -->
    <div class="flex flex-wrap gap-x-6 gap-y-2">
      <button
        on:click={() => showCreateFolderModal = true}
        class="text-xs font-medium uppercase tracking-widest hover:opacity-60 transition"
      >
        New Folder
      </button>
      <button
        on:click={() => showCreateModal = true}
        class="text-xs font-medium uppercase tracking-widest hover:opacity-60 transition"
      >
        New Note
      </button>
    </div>
  </div>

  <!-- Tree View -->
  <div class="flex-1 overflow-y-auto px-4 pb-6">
    {#if isLoading}
      <div class="flex items-center justify-center h-32">
        <span class="text-xs uppercase tracking-widest animate-pulse">Loading</span>
      </div>
    {:else if tree}
      <div class="space-y-1">
        {#each getFilteredTree().children || [] as node (node.path)}
          <FileTree {node} {selectedPath} on:selectFile={handleSelectFile} />
        {/each}
      </div>
    {:else}
      <div class="flex items-center justify-center h-32">
        <span class="text-xs uppercase tracking-widest opacity-40">Empty</span>
      </div>
    {/if}
  </div>

  <!-- Stats Footer -->
  {#if tree}
    <div class="px-6 py-4 border-t border-[var(--border-subtle)] text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
      {tree.children ? tree.children.length : 0} Items
    </div>
  {/if}
</div>

<!-- Create Folder Modal -->
{#if showCreateFolderModal}
  <div class="fixed inset-0 bg-black/20 dark:bg-white/5 backdrop-blur-sm flex items-center justify-center z-50">
    <div class="bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-8 w-96 shadow-2xl">
      <h2 class="text-2xl font-serif mb-8 tracking-tight">New Section</h2>
      <div class="space-y-8">
        <div>
          <label for="folder-name" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">Folder Name</label>
          <input id="folder-name" type="text" bind:value={newFolderName} placeholder="e.g. Research/AI" class="w-full" />
        </div>
      </div>
      <div class="flex gap-6 mt-12">
        <button on:click={() => showCreateFolderModal = false} class="flex-1 text-sm font-medium hover:opacity-60 transition">Cancel</button>
        <button on:click={createFolder} disabled={isCreating || !newFolderName.trim()} class="flex-1 text-sm font-bold uppercase tracking-widest hover:opacity-60 transition disabled:opacity-30">
          {isCreating ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Create Note Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 bg-black/20 dark:bg-white/5 backdrop-blur-sm flex items-center justify-center z-50">
    <div class="bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-8 w-96 shadow-2xl">
      <h2 class="text-2xl font-serif mb-8 tracking-tight">New Note</h2>
      <div class="space-y-8">
        <div>
          <label for="note-title" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">Title</label>
          <input id="note-title" type="text" bind:value={newNoteTitle} placeholder="Name your thought..." class="w-full" />
        </div>
        <div>
          <label for="note-category" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">Category</label>
          <select id="note-category" bind:value={newNoteCategory} class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 text-sm outline-none appearance-none cursor-pointer">
            <option value="">Root</option>
            <option value="Образование">Образование</option>
            <option value="Работа">Работа</option>
            <option value="Документы">Документы</option>
            <option value="Личное и Творчество">Личное и Творчество</option>
            <option value="Проекты и Образование">Проекты и Образование</option>
          </select>
        </div>
      </div>
      <div class="flex gap-6 mt-12">
        <button on:click={() => showCreateModal = false} class="flex-1 text-sm font-medium hover:opacity-60 transition">Cancel</button>
        <button on:click={createNewNote} disabled={isCreating || !newNoteTitle.trim()} class="flex-1 text-sm font-bold uppercase tracking-widest hover:opacity-60 transition disabled:opacity-30">
          {isCreating ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.sidebar button) {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
</style>
