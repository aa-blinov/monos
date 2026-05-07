<script>
  import { createEventDispatcher } from 'svelte';
  import { editMode, syncScroll, searchQuery, searchResults, isSearching } from '../stores.js';

  const dispatch = createEventDispatcher();

  export let isDarkMode = false;

  let searchTimer;

  async function doSearch() {
    if (!$searchQuery.trim()) {
      $searchResults = [];
      return;
    }
    $isSearching = true;
    try {
      const r = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: $searchQuery, search_content: true })
      });
      if (r.ok) $searchResults = await r.json();
    } catch {} finally { $isSearching = false; }
  }

  function handleSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(doSearch, 300);
  }

  function clearSearch() {
    $searchQuery = '';
    $searchResults = [];
  }

  function toggleEditorMode() {
    $editMode = $editMode === 'rich' ? 'source' : 'rich';
  }

  function toggleDarkMode() { dispatch('toggleDarkMode'); }
  function toggleSidebar() { dispatch('toggleSidebar'); }
</script>

<header class="bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] px-4 lg:px-8 py-3 flex items-center justify-between">
  <div class="flex items-center gap-4 lg:gap-6">
    <button on:click={toggleSidebar} class="hover:opacity-60 transition-opacity p-1" title="Toggle Sidebar">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <h1 class="text-xl lg:text-2xl font-serif font-medium tracking-tight whitespace-nowrap">Monos</h1>
  </div>

  <div class="flex-1 max-w-lg mx-4 lg:mx-8">
    <div class="relative">
      <input
        type="text"
        placeholder="Search notes..."
        bind:value={$searchQuery}
        on:input={handleSearchInput}
        class="w-full bg-transparent border-b border-[var(--border-subtle)] focus:border-[var(--text-primary)] py-1.5 text-sm outline-none transition-all placeholder-[var(--text-secondary)]"
      />
      {#if $searchQuery}
        <button on:click={clearSearch} class="absolute right-0 top-1/2 -translate-y-1/2 p-1 hover:opacity-60">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <div class="flex items-center gap-3 lg:gap-6">
    {#if $editMode === 'source'}
      <button on:click={() => $syncScroll = !$syncScroll} class="text-sm font-medium hover:opacity-60 transition {$syncScroll ? '' : 'opacity-30'}" title="Toggle sync scroll">
        Sync Scroll
      </button>
    {/if}

    <button on:click={toggleEditorMode} class="text-sm font-medium hover:opacity-60 transition" title="Switch editor mode">
      {$editMode === 'rich' ? 'Source' : 'Rich'}
    </button>

    <button on:click={toggleDarkMode} class="p-1 hover:opacity-60 transition-opacity" title="Toggle Theme">
      {#if isDarkMode}
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5" stroke-width="1.5" />
          <path stroke-linecap="round" stroke-width="1.5" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      {:else}
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      {/if}
    </button>
  </div>
</header>

<style>
  button { display: flex; align-items: center; gap: 0.5rem; font-weight: 500; }
</style>
