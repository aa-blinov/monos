<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import FileTree from './FileTree.svelte';

  const dispatch = createEventDispatcher();

  /** @type {Object} */
  let tree = null;

  /** @type {string} */
  let searchQuery = '';

  /** @type {boolean} */
  let isLoading = true;

  /** @type {string} */
  let error = '';

  /** @type {boolean} */
  let showCreateModal = false;

  /** @type {string} */
  let newNoteTitle = '';

  /** @type {string} */
  let newNoteCategory = '';

  /** @type {string} */
  let isCreating = false;

  /**
   * Fetch directory tree from API
   */
  async function loadTree() {
    try {
      isLoading = true;
      error = '';
      const response = await fetch('/api/tree');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      tree = await response.json();
    } catch (err) {
      error = `Failed to load tree: ${err.message}`;
      console.error(error);
    } finally {
      isLoading = false;
    }
  }

  /**
   * Filter tree nodes by search query recursively
   * @param {Object} node - Tree node
   * @param {string} query - Search query
   * @returns {Object|null}
   */
  function filterNode(node, query) {
    if (!query.trim()) {
      return node;
    }

    const lowerQuery = query.toLowerCase();
    const nameMatches = node.name.toLowerCase().includes(lowerQuery);

    if (node.is_dir && node.children) {
      const filteredChildren = node.children
        .map(child => filterNode(child, query))
        .filter(child => child !== null);

      if (filteredChildren.length > 0 || nameMatches) {
        return {
          ...node,
          children: filteredChildren
        };
      }
      return null;
    }

    return nameMatches ? node : null;
  }

  /**
   * Get filtered tree based on search query
   * @returns {Object}
   */
  function getFilteredTree() {
    if (!tree) return null;
    if (!searchQuery.trim()) return tree;
    const filtered = filterNode(tree, searchQuery);
    return filtered || { ...tree, children: [] };
  }

  /**
   * Handle file selection
   * @param {CustomEvent} event
   */
  function handleSelectFile(event) {
    dispatch('selectFile', event.detail);
  }

  /**
   * Open create note modal
   */
  function openCreateModal() {
    showCreateModal = true;
    newNoteTitle = '';
    newNoteCategory = 'Образование';
  }

  /**
   * Close create note modal
   */
  function closeCreateModal() {
    showCreateModal = false;
  }

  /**
   * Create new note
   */
  async function createNewNote() {
    if (!newNoteTitle.trim() || !newNoteCategory.trim()) {
      alert('Please fill in all fields');
      return;
    }

    try {
      isCreating = true;
      const response = await fetch('/api/notes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newNoteTitle.trim(),
          category: newNoteCategory.trim(),
          tags: [],
          content: ''
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      closeCreateModal();
      await loadTree();
      dispatch('selectFile', { path: data.path, name: newNoteTitle });
    } catch (err) {
      alert(`Failed to create note: ${err.message}`);
    } finally {
      isCreating = false;
    }
  }

  onMount(() => {
    loadTree();
  });
</script>

<div class="w-full max-w-4xl mx-auto bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700">
  <!-- Header -->
  <div class="border-b border-gray-200 dark:border-gray-700 p-4">
    <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Browse Files</h2>

    <!-- Search and Create Section -->
    <div class="flex gap-2">
      <!-- Search Input -->
      <div class="flex-1 relative">
        <svg
          class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Search files..."
          bind:value={searchQuery}
          class="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
        />
      </div>

      <!-- Create Note Button -->
      <button
        on:click={openCreateModal}
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition flex items-center gap-2"
        title="Create new note"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        New Note
      </button>
    </div>
  </div>

  <!-- Content -->
  <div class="p-4">
    {#if isLoading}
      <div class="flex items-center justify-center h-64">
        <div class="text-center text-gray-500 dark:text-gray-400">
          <svg class="w-8 h-8 animate-spin mx-auto mb-2" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p class="text-sm">Loading files...</p>
        </div>
      </div>
    {:else if error}
      <div class="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-200">
        {error}
      </div>
    {:else if tree && tree.children && tree.children.length > 0}
      <div class="space-y-2">
        {#each getFilteredTree().children || [] as node (node.path)}
          <FileTree
            {node}
            on:selectFile={handleSelectFile}
          />
        {/each}
      </div>
    {:else}
      <div class="text-center py-8 text-gray-500 dark:text-gray-400">
        <p class="mb-4">No files found</p>
        <button
          on:click={openCreateModal}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
        >
          Create Your First Note
        </button>
      </div>
    {/if}
  </div>
</div>

<!-- Create Note Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 w-96 shadow-lg">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Create New Note</h3>

      <div class="space-y-4">
        <!-- Title Input -->
        <div>
          <label for="noteTitle" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Title *
          </label>
          <input
            id="noteTitle"
            type="text"
            placeholder="Enter note title..."
            bind:value={newNoteTitle}
            class="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          />
        </div>

        <!-- Category Input -->
        <div>
          <label for="noteCategory" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Category *
          </label>
          <input
            id="noteCategory"
            type="text"
            placeholder="e.g., Образование, Работа, Документы..."
            bind:value={newNoteCategory}
            class="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          />
        </div>
      </div>

      <!-- Modal Actions -->
      <div class="flex gap-2 mt-6">
        <button
          on:click={closeCreateModal}
          disabled={isCreating}
          class="flex-1 px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 disabled:opacity-50 text-gray-900 dark:text-gray-100 rounded-lg font-medium transition"
        >
          Cancel
        </button>
        <button
          on:click={createNewNote}
          disabled={isCreating || !newNoteTitle.trim()}
          class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:opacity-50 text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
        >
          {#if isCreating}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          {/if}
          Create
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
</style>
