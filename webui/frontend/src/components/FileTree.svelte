<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  /**
   * @typedef {Object} TreeNode
   * @property {string} path - File path
   * @property {string} name - File/folder name
   * @property {boolean} is_dir - Is directory flag
   * @property {number} size - File size in bytes
   * @property {string} size_human - Human-readable file size
   * @property {TreeNode[]} children - Child nodes (for directories)
   * @property {Object} metadata - YAML frontmatter metadata
   */

  /** @type {TreeNode} */
  export let node;

  /** @type {boolean} */
  export let expanded = false;

  /** @type {string} */
  export let selectedPath = null;

  let isExpanded = expanded;

  /**
   * Format bytes to human-readable string
   * @param {number} bytes
   * @returns {string}
   */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get icon for file type
   * @param {string} name
   * @param {boolean} isDir
   * @returns {string}
   */
  function getIcon(name, isDir) {
    if (isDir) {
      return '📁';
    }
    if (name.endsWith('.md')) return '📝';
    if (name.endsWith('.json')) return '⚙️';
    if (name.endsWith('.yaml') || name.endsWith('.yml')) return '⚙️';
    if (name.endsWith('.py')) return '🐍';
    if (name.endsWith('.js') || name.endsWith('.ts')) return '📜';
    return '📄';
  }

  /**
   * Toggle folder expansion
   */
  function toggleExpanded() {
    if (node.is_dir) {
      isExpanded = !isExpanded;
    }
  }

  /**
   * Handle file/folder click
   */
  function handleClick() {
    dispatch('selectFile', { path: node.path, name: node.name, isDir: node.is_dir });
  }

  /**
   * Handle file/folder selection with expand
   */
  function handleSelect() {
    if (node.is_dir) {
      toggleExpanded();
    }
    handleClick();
  }
</script>

<div class="text-sm">
  <div
    class="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer transition"
    class:bg-blue-50={selectedPath === node.path}
    class:dark:bg-blue-900={selectedPath === node.path}
    on:click={handleSelect}
  >
    {#if node.is_dir}
      <button
        on:click|stopPropagation={toggleExpanded}
        class="p-0 w-4 h-4 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition"
        title={isExpanded ? 'Collapse' : 'Expand'}
      >
        <span class="text-xs">{isExpanded ? '▼' : '▶'}</span>
      </button>
    {:else}
      <div class="w-4" />
    {/if}

    <span class="text-lg">
      {getIcon(node.name, node.is_dir)}
    </span>

    <div class="flex-1 min-w-0">
      <div class="font-medium text-gray-900 dark:text-gray-100 truncate">
        {node.name}
      </div>
      <div class="text-xs text-gray-500 dark:text-gray-400">
        {formatBytes(node.size)}
      </div>
    </div>
  </div>

  {#if node.is_dir && isExpanded && node.children}
    <div class="ml-4 border-l border-gray-200 dark:border-gray-700">
      {#each node.children as child (child.path)}
        <svelte:self
          node={child}
          {selectedPath}
          on:selectFile
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  div :global(button) {
    padding: 0;
  }
</style>
