<script>
  import { createEventDispatcher } from 'svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { searchQuery, searchResults, isSearching, noteView } from '../stores.js';
  import { localizedText } from '../lib/strings.js';
  import { LayoutGrid, List, Menu, Moon, Search, Sun, X } from 'lucide-svelte';

  const dispatch = createEventDispatcher();

  export let isDarkMode = false;

  let searchOpen = false;
  let searchTimer;
  let searchRequestId = 0;
  let searchInputEl;
  let allTags = [];

  async function loadTags() {
    try {
      const r = await fetch('/api/tags');
      if (r.ok) allTags = await r.json();
    } catch {}
  }

  $: tagFilter = $searchQuery.startsWith('#') ? $searchQuery.slice(1) : '';
  $: filteredTags = allTags.filter(t => t.toLowerCase().includes(tagFilter.toLowerCase()));
  $: showTagSuggestions = $searchQuery.startsWith('#') && filteredTags.length > 0;
  $: if ($searchQuery.trim() && !searchOpen) searchOpen = true;

  async function doSearch() {
    const query = $searchQuery;
    const requestId = ++searchRequestId;

    if (!query.trim()) {
      $searchResults = [];
      $isSearching = false;
      return;
    }

    $isSearching = true;
    try {
      const r = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, search_content: true }) });
      const results = r.ok ? await r.json() : null;
      if (requestId === searchRequestId && query === $searchQuery && results) $searchResults = results;
    } catch {} finally {
      if (requestId === searchRequestId) $isSearching = false;
    }
  }

  function handleSearchInput() { clearTimeout(searchTimer); searchTimer = setTimeout(doSearch, 300); }

  export function openSearch() {
    searchOpen = true;
    setTimeout(() => searchInputEl?.focus(), 50);
  }

  function closeSearch() {
    clearTimeout(searchTimer);
    searchRequestId += 1;
    searchOpen = false;
    $searchQuery = '';
    $searchResults = [];
    $isSearching = false;
  }

  function toggleDarkMode() { dispatch('toggleDarkMode'); }
  function toggleSidebar() { dispatch('toggleSidebar'); }
  function goHome() { dispatch('goHome'); }
  function toggleNoteView() {
    const nextView = $noteView === 'board' ? 'list' : 'board';
    $noteView = nextView;
    dispatch('noteViewChange', { view: nextView });
  }
</script>

<header class="relative flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 sm:px-4 lg:pl-4 lg:pr-8">
  <div class="{searchOpen ? 'hidden sm:flex' : 'flex'} items-center gap-3 lg:gap-6 min-w-0">
    <TooltipIconButton
      on:click={toggleSidebar}
      class="inline-flex h-10 w-10 shrink-0 items-center justify-center hover:opacity-60 transition-opacity"
      label={$localizedText.header.toggleSidebar}
      tooltip={$localizedText.header.toggleSidebar}
      tooltipAlign="start"
    >
      <Menu class="w-5 h-5" strokeWidth="1.7" aria-hidden="true" />
    </TooltipIconButton>
    <button
      type="button"
      on:click={goHome}
      class="min-w-0 text-xl lg:text-2xl font-serif font-medium tracking-tight whitespace-nowrap truncate hover:opacity-70 transition-opacity"
      aria-label="Monos"
    >Monos</button>
  </div>

  <div class="{searchOpen ? 'flex-1 sm:flex-none' : ''} flex h-10 min-w-0 items-center justify-end gap-1.5 sm:gap-3 lg:gap-6">
    {#if searchOpen}
      <div class="absolute left-1/2 top-2 flex h-11 w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center sm:relative sm:left-auto sm:top-auto sm:h-full sm:w-72 sm:translate-x-0 lg:w-96">
        <Search size="18" class="absolute left-3 sm:left-4 text-[var(--text-secondary)] pointer-events-none" aria-hidden="true" />
        <input
          bind:this={searchInputEl}
          type="text"
          placeholder={$localizedText.header.search}
          bind:value={$searchQuery}
          on:input={handleSearchInput}
          on:keydown={(e) => { if (e.key === 'Escape') closeSearch(); }}
          on:focus={loadTags}
          class="h-11 w-full rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] pl-10 pr-12 text-base outline-none placeholder-[var(--text-secondary)] focus:border-[var(--text-primary)] sm:h-10 sm:pl-11 sm:pr-10 sm:text-sm"
        />
        <button
          type="button"
          on:click={closeSearch}
          class="group absolute right-0 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-[var(--bg-tertiary)]/35 hover:text-[var(--text-primary)] sm:right-2 sm:h-7 sm:w-7"
          aria-label={$localizedText.header.closeSearch}
        >
          <X class="h-4 w-4" aria-hidden="true" />
          <span
            role="tooltip"
            class="pointer-events-none absolute right-0 top-full z-[120] mt-2 hidden whitespace-nowrap rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-primary)] shadow-lg shadow-black/10 group-hover:block group-focus-visible:block"
          >
            {$localizedText.header.closeSearch}
          </span>
        </button>
        {#if showTagSuggestions}
          <div class="absolute top-full left-0 mt-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] shadow-lg z-50 max-h-48 overflow-y-auto w-full rounded-xl">
            {#each filteredTags as tag}
              <button
                on:click={() => { clearTimeout(searchTimer); $searchQuery = `#${tag} `; doSearch(); }}
                class="flex w-full items-center text-left px-3 py-2.5 text-sm hover:bg-[var(--bg-secondary)] transition"
              >#{tag}</button>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <TooltipIconButton
        on:click={openSearch}
        class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
        label={$localizedText.header.search}
        tooltip={$localizedText.header.search}
        tooltipAlign="end"
      >
        <Search size="18" aria-hidden="true" />
      </TooltipIconButton>
    {/if}

    <TooltipIconButton
      on:click={toggleNoteView}
      class="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] lg:inline-flex"
      label={$noteView === 'board' ? $localizedText.header.listView : $localizedText.header.boardView}
      tooltip={$noteView === 'board' ? $localizedText.header.listView : $localizedText.header.boardView}
      tooltipAlign="end"
    >
      {#if $noteView === 'board'}
        <List class="w-5 h-5" strokeWidth="1.7" aria-hidden="true" />
      {:else}
        <LayoutGrid class="w-5 h-5" strokeWidth="1.7" aria-hidden="true" />
      {/if}
    </TooltipIconButton>

    <TooltipIconButton
      on:click={toggleDarkMode}
      class="{searchOpen ? 'hidden sm:inline-flex' : 'inline-flex'} h-10 w-10 shrink-0 items-center justify-center hover:opacity-60 transition-opacity"
      label={$localizedText.header.toggleTheme}
      tooltip={$localizedText.header.toggleTheme}
      tooltipAlign="end"
    >
      {#if isDarkMode}
        <Sun class="w-5 h-5" strokeWidth="1.7" aria-hidden="true" />
      {:else}
        <Moon class="w-5 h-5" strokeWidth="1.7" aria-hidden="true" />
      {/if}
    </TooltipIconButton>
  </div>
</header>

