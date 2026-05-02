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
    selectedPath = event.detail.path;
    dispatch('selectFile', event.detail);
  }

  /**
   * Clear search
   */
  function clearSearch() {
    searchQuery = '';
  }

  /**
   * Reload tree
   */
  function reloadTree() {
    loadTree();
  }

  onMount(() => {
    loadTree();
  });
</script>

<div class="h-full flex flex-col bg-white dark:bg-slate-900">
  <!-- Search Section -->
  <div class="border-b border-gray-200 dark:border-gray-700 p-4 space-y-3">
    <!-- Search Input -->
    <div class="relative">
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
        class="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
      />
      {#if searchQuery}
        <button
          on:click={clearSearch}
          class="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-slate-700 rounded transition"
          title="Clear search"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>

    <!-- Action Buttons -->
    <div class="flex gap-2">
      <button
        on:click={reloadTree}
        disabled={isLoading}
        class="flex-1 px-3 py-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 disabled:opacity-50 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition"
        title="Refresh file tree"
      >
        {#if isLoading}
          <svg class="w-4 h-4 animate-spin inline mr-2" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        {/if}
        Refresh
      </button>
    </div>
  </div>

  <!-- Error Message -->
  {#if error}
    <div class="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-200">
      {error}
    </div>
  {/if}

  <!-- Tree View -->
  <div class="flex-1 overflow-y-auto">
    {#if isLoading}
      <div class="flex items-center justify-center h-32">
        <div class="text-center text-gray-500 dark:text-gray-400">
          <svg class="w-8 h-8 animate-spin mx-auto mb-2" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p class="text-sm">Loading...</p>
        </div>
      </div>
    {:else if tree}
      <div class="p-2">
        {#each getFilteredTree().children || [] as node (node.path)}
          <FileTree
            {node}
            {selectedPath}
            on:selectFile={handleSelectFile}
          />
        {/each}
      </div>
    {:else}
      <div class="flex items-center justify-center h-32">
        <div class="text-center text-gray-500 dark:text-gray-400">
          <p class="text-sm">No files found</p>
        </div>
      </div>
    {/if}
  </div>

  <!-- Stats Footer -->
  {#if tree}
    <div class="border-t border-gray-200 dark:border-gray-700 px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
      <p>
        {tree.children ? tree.children.length : 0}
        item{tree.children && tree.children.length !== 1 ? 's' : ''}
      </p>
    </div>
  {/if}
</div>

<style>
  :global(button) {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
</style>
