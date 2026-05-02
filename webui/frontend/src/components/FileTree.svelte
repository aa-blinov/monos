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
   * Get icon SVG for file type
   * @param {string} name
   * @param {boolean} isDir
   * @returns {string}
   */
  function getIconSvg(name, isDir) {
    if (isDir) return 'folder';
    if (name.endsWith('.md')) return 'document';
    if (name.endsWith('.json')) return 'cog';
    if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'cog';
    if (name.endsWith('.py')) return 'code';
    if (name.endsWith('.js') || name.endsWith('.ts')) return 'code';
    return 'document';
  }

  /**
   * Get SVG icon markup
   * @param {string} type
   * @returns {string}
   */
  function getSvgMarkup(type) {
    const icons = {
      folder: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>',
      document: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>',
      code: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>',
      cog: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>'
    };
    return icons[type] || icons.document;
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

    <span class="w-4 h-4 text-gray-600 dark:text-gray-400 flex-shrink-0 inline-flex items-center justify-center">
      {@html getSvgMarkup(getIconSvg(node.name, node.is_dir))}
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
