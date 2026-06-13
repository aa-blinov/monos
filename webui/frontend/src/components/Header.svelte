<script>
  import { createEventDispatcher } from 'svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { searchQuery, searchResults, isSearching, editorAction } from '../stores.js';
  import { localizedText } from '../lib/strings.js';
  import { Clipboard, Menu, Search, ArrowLeft, X, Wand, Trash2 } from 'lucide-svelte';

  const dispatch = createEventDispatcher();

  export let noteOpen = false;
  export let isFormatting = false;

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

  function clearSearch() {
    clearTimeout(searchTimer);
    searchRequestId += 1;
    $searchQuery = '';
    $searchResults = [];
    $isSearching = false;
  }

  function toggleSidebar() { dispatch('toggleSidebar'); }
  function goHome() { dispatch('goHome'); }
  function createQuickNote() { dispatch('createQuickNote'); }
</script>

<header class="relative flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 sm:px-4 lg:px-4">
  {#if noteOpen}
    <TooltipIconButton
      on:click={goHome}
      class="inline-flex h-10 w-10 shrink-0 items-center justify-center hover:opacity-60 transition-opacity"
      label={$localizedText.header.back}
      tooltip={$localizedText.header.back}
      tooltipAlign="start"
    >
      <ArrowLeft class="w-5 h-5" strokeWidth="1.7" aria-hidden="true" />
    </TooltipIconButton>
  {:else}
    <TooltipIconButton
      on:click={toggleSidebar}
      class="inline-flex h-10 w-10 shrink-0 items-center justify-center hover:opacity-60 transition-opacity"
      label={$localizedText.header.toggleSidebar}
      tooltip={$localizedText.header.toggleSidebar}
      tooltipAlign="start"
    >
      <Menu class="w-5 h-5" strokeWidth="1.7" aria-hidden="true" />
    </TooltipIconButton>
  {/if}

  {#if !noteOpen}
  <div class="relative min-w-0 flex-1">
    <Search size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" aria-hidden="true" />
    <input
      bind:this={searchInputEl}
      type="text"
      placeholder={$localizedText.header.search}
      bind:value={$searchQuery}
      on:input={handleSearchInput}
      on:keydown={(e) => { if (e.key === 'Escape') clearSearch(); }}
      on:focus={loadTags}
      class="h-10 w-full rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] pl-10 pr-9 text-sm outline-none placeholder-[var(--text-secondary)] focus:border-[var(--text-primary)]"
    />
    {#if $searchQuery}
      <button
        type="button"
        on:click={clearSearch}
        class="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-[var(--bg-tertiary)]/35 hover:text-[var(--text-primary)]"
        aria-label={$localizedText.header.closeSearch}
      >
        <X class="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    {/if}
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
  <TooltipIconButton
    on:click={createQuickNote}
    class="inline-flex h-10 w-10 shrink-0 items-center justify-center hover:opacity-60 transition-opacity"
    label={$localizedText.sidebar.quickNoteFromClipboard}
    tooltip={$localizedText.sidebar.quickNoteFromClipboard}
    tooltipAlign="end"
  >
    <Clipboard class="h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
  </TooltipIconButton>
  {:else}
    <div class="flex-1"></div>
    <TooltipIconButton
      on:click={() => editorAction.set('format')}
      disabled={isFormatting}
      class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)]/50 hover:text-[var(--text-primary)] disabled:opacity-30"
      label={$localizedText.editor.formatAllNotes}
      tooltip={$localizedText.editor.formatAllNotes}
      tooltipAlign="end"
    >
      <Wand class="h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
    </TooltipIconButton>
    <TooltipIconButton
      on:click={() => editorAction.set('delete')}
      class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)]/50 hover:text-[var(--red)]"
      label={$localizedText.editor.deleteNote}
      tooltip={$localizedText.editor.deleteNote}
      tooltipAlign="end"
    >
      <Trash2 class="h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
    </TooltipIconButton>
  {/if}
</header>
