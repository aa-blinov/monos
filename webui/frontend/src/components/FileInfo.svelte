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
   * @property {Object} metadata - Note metadata (from SQLite)
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

<div class="bg-[var(--bg-primary)] p-6 space-y-8">
  {#if fileInfo}
    <div class="space-y-10">
      <!-- File Name -->
      <div>
        <span class="block text-[10px] uppercase tracking-widest text-[var(--text-secondary)] mb-2">Identifier</span>
        <p class="text-xl font-serif font-medium tracking-tight break-words">
          {fileInfo.name}
        </p>
      </div>

      <!-- File Size and Type -->
      <div class="grid grid-cols-2 gap-8">
        <div>
          <span class="block text-[10px] uppercase tracking-widest text-[var(--text-secondary)] mb-2">Dimensions</span>
          <p class="text-sm font-medium">
            {fileInfo.size_human}
          </p>
        </div>
        <div>
          <span class="block text-[10px] uppercase tracking-widest text-[var(--text-secondary)] mb-2">Nature</span>
          <p class="text-sm font-medium">
            {fileInfo.is_dir ? 'Collection' : 'Thought'}
          </p>
        </div>
      </div>

      <!-- Dates -->
      <div class="space-y-6">
        <div>
          <span class="block text-[10px] uppercase tracking-widest text-[var(--text-secondary)] mb-2">Conceived</span>
          <p class="text-sm font-serif italic text-[var(--text-secondary)]">
            {formatDate(fileInfo.created)}
          </p>
        </div>
        <div>
          <span class="block text-[10px] uppercase tracking-widest text-[var(--text-secondary)] mb-2">Refined</span>
          <p class="text-sm font-serif italic text-[var(--text-secondary)]">
            {formatDate(fileInfo.modified)}
          </p>
        </div>
      </div>

      <!-- Note Metadata (from SQLite) -->
      {#if fileInfo.metadata}
        <div class="pt-8 border-t border-[var(--border-subtle)] space-y-8">
          <!-- Tags -->
          {#if fileInfo.metadata.tags && fileInfo.metadata.tags.length > 0}
            <div>
              <span class="block text-[10px] uppercase tracking-widest text-[var(--text-secondary)] mb-2">Connections</span>
              <div class="flex flex-wrap gap-x-4 gap-y-2 mt-3">
                {#each fileInfo.metadata.tags as tag}
                  <span class="text-xs font-medium opacity-60 hover:opacity-100 transition-opacity cursor-default">
                    #{tag}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <div class="h-64 flex items-center justify-center border border-dashed border-[var(--border-subtle)]">
      <p class="text-[10px] uppercase tracking-[0.2em] text-[var(--text-secondary)]">Awaiting Focus</p>
    </div>
  {/if}
</div>


<style>
  :global(p) {
    margin: 0;
  }
</style>
