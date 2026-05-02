<script>
  /**
   * @typedef {Object} FileInfoData
   * @property {string} path - File path
   * @property {string} name - File name
   * @property {boolean} is_dir - Is directory
   * @property {number} size - Size in bytes
   * @property {string} size_human - Human-readable size
   * @property {string} modified - Modified date
   * @property {string} created - Created date
   * @property {Object} metadata - YAML frontmatter metadata
   */

  /** @type {FileInfoData} */
  export let fileInfo = null;

  /**
   * Format date to readable string
   * @param {string} dateString - ISO date string
   * @returns {string}
   */
  function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
  {#if fileInfo}
    <div class="space-y-4">
      <!-- File Name -->
      <div>
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">Name</h3>
        <p class="text-lg font-medium text-gray-900 dark:text-gray-100 break-words">
          {fileInfo.name}
        </p>
      </div>

      <!-- File Path -->
      <div>
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">Path</h3>
        <p class="text-sm text-gray-600 dark:text-gray-300 font-mono break-all">
          {fileInfo.path}
        </p>
      </div>

      <!-- File Size -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">Size</h3>
          <p class="text-sm text-gray-900 dark:text-gray-100">
            {fileInfo.size_human}
          </p>
        </div>
        <div>
          <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">Type</h3>
          <p class="text-sm text-gray-900 dark:text-gray-100">
            {fileInfo.is_dir ? 'Directory' : 'File'}
          </p>
        </div>
      </div>

      <!-- Dates -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">Created</h3>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            {formatDate(fileInfo.created)}
          </p>
        </div>
        <div>
          <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">Modified</h3>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            {formatDate(fileInfo.modified)}
          </p>
        </div>
      </div>

      <!-- Metadata from YAML Frontmatter -->
      {#if fileInfo.metadata}
        <!-- Category -->
        {#if fileInfo.metadata.category}
          <div>
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">Category</h3>
            <p class="text-sm text-gray-900 dark:text-gray-100">
              {fileInfo.metadata.category}
            </p>
          </div>
        {/if}

        <!-- Status -->
        {#if fileInfo.metadata.status}
          <div>
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</h3>
            <div class="mt-1">
              <span class="px-2 py-1 text-xs font-medium rounded-full" class:bg-yellow-100={fileInfo.metadata.status === 'draft'} class:text-yellow-800={fileInfo.metadata.status === 'draft'} class:dark:bg-yellow-900={fileInfo.metadata.status === 'draft'} class:dark:text-yellow-200={fileInfo.metadata.status === 'draft'} class:bg-green-100={fileInfo.metadata.status === 'published'} class:text-green-800={fileInfo.metadata.status === 'published'} class:dark:bg-green-900={fileInfo.metadata.status === 'published'} class:dark:text-green-200={fileInfo.metadata.status === 'published'}>
                {fileInfo.metadata.status}
              </span>
            </div>
          </div>
        {/if}

        <!-- Tags -->
        {#if fileInfo.metadata.tags && fileInfo.metadata.tags.length > 0}
          <div>
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Tags</h3>
            <div class="flex flex-wrap gap-2">
              {#each fileInfo.metadata.tags as tag}
                <span class="px-2 py-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full">
                  {tag}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Date from metadata -->
        {#if fileInfo.metadata.date}
          <div>
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">Date (Metadata)</h3>
            <p class="text-sm text-gray-600 dark:text-gray-300">
              {formatDate(fileInfo.metadata.date)}
            </p>
          </div>
        {/if}
      {/if}
    </div>
  {:else}
    <div class="text-center py-8 text-gray-500 dark:text-gray-400">
      <p>Select a file to view its information</p>
    </div>
  {/if}
</div>

<style>
  :global(p) {
    margin: 0;
  }
</style>
