<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import FileTree from './FileTree.svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { localizedText } from '../lib/strings.js';
  import { Loader2, Plus, Search } from 'lucide-svelte';

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
      error = $localizedText.browser.failedToLoadTree(err.message);
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
      alert($localizedText.browser.fillAllFields);
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
      alert($localizedText.browser.failedToCreateNote(err.message));
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
    <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{$localizedText.browser.browseFiles}</h2>

    <!-- Search and Create Section -->
    <div class="flex gap-3">
      <!-- Search Input -->
      <div class="flex-1 relative">
        <Search
          class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none"
          strokeWidth="2"
          aria-hidden="true"
        />
        <input
          type="text"
          placeholder={$localizedText.browser.searchFiles}
          bind:value={searchQuery}
          class="w-full h-11 pl-12 pr-4 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-gray-600 rounded-full text-base focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
        />
      </div>

      <!-- Create Note Button -->
      <TooltipIconButton
        on:click={openCreateModal}
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition flex items-center gap-2"
        label={$localizedText.browser.createNewNote}
        tooltip={$localizedText.browser.createNewNote}
        tooltipAlign="end"
      >
        <Plus class="w-5 h-5" strokeWidth="2" aria-hidden="true" />
        {$localizedText.browser.newNote}
      </TooltipIconButton>
    </div>
  </div>

  <!-- Content -->
  <div class="p-4">
    {#if isLoading}
      <div class="flex items-center justify-center h-64">
        <div class="text-center text-gray-500 dark:text-gray-400">
          <Loader2 class="w-8 h-8 animate-spin mx-auto mb-2" aria-hidden="true" />
          <p class="text-sm">{$localizedText.browser.loadingFiles}</p>
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
        <p class="mb-4">{$localizedText.browser.noFilesFound}</p>
        <button
          on:click={openCreateModal}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
        >
          {$localizedText.browser.createYourFirstNote}
        </button>
      </div>
    {/if}
  </div>
</div>

<!-- Create Note Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 w-96 shadow-lg">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{$localizedText.browser.createNewNoteTitle}</h3>

      <div class="space-y-4">
        <!-- Title Input -->
        <div>
          <label for="noteTitle" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {$localizedText.browser.title}
          </label>
          <input
            id="noteTitle"
            type="text"
            placeholder={$localizedText.browser.titlePlaceholder}
            bind:value={newNoteTitle}
            class="w-full px-3 py-2 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          />
        </div>

        <!-- Category Input -->
        <div>
          <label for="noteCategory" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {$localizedText.browser.category}
          </label>
          <input
            id="noteCategory"
            type="text"
            placeholder={$localizedText.browser.categoryPlaceholder}
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
          {$localizedText.browser.cancel}
        </button>
        <button
          on:click={createNewNote}
          disabled={isCreating || !newNoteTitle.trim()}
          class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:opacity-50 text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
        >
          {#if isCreating}
            <Loader2 class="w-4 h-4 animate-spin" aria-hidden="true" />
          {/if}
          {$localizedText.browser.create}
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
