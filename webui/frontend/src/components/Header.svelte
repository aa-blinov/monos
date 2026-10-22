<script>
  import { createEventDispatcher } from 'svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import SearchField from './SearchField.svelte';
  import { searchQuery, searchResults, isSearching } from '../stores.js';
  import { localizedText } from '../lib/strings.js';
  import { Bookmark, Clipboard, ArrowLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-svelte';

  const dispatch = createEventDispatcher();

  export let showBack = false;
  export let showSearch = true;
  export let sidebarOpen = false;

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

  function handleSearchInput() {
    clearTimeout(searchTimer);
    searchRequestId += 1;

    if (!$searchQuery.trim()) {
      $searchResults = [];
      $isSearching = false;
      return;
    }

    $isSearching = true;
    searchTimer = setTimeout(doSearch, 300);
  }

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
  $: sidebarToggleLabel = sidebarOpen ? $localizedText.header.closeSidebar : $localizedText.header.openSidebar;
  export function openSearch() {
    if (!showSearch) return;
    searchInputEl?.focus();
  }
</script>

<header class="relative flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-2">
  {#if showBack}
    <TooltipIconButton
      on:click={goHome}
      class="inline-flex h-11 w-11 lg:h-9 lg:w-9 shrink-0 items-center justify-center rounded-ui text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] hover:text-[var(--text-primary)]"
      label={$localizedText.header.back}
      tooltip={$localizedText.header.back}
      tooltipAlign="start"
    >
      <ArrowLeft class="w-5 h-5" strokeWidth="1.7" aria-hidden="true" />
    </TooltipIconButton>
    <TooltipIconButton
      on:click={toggleSidebar}
      class="inline-flex h-11 w-11 lg:h-9 lg:w-9 shrink-0 items-center justify-center rounded-ui text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] hover:text-[var(--text-primary)]"
      label={sidebarToggleLabel}
      tooltip={sidebarToggleLabel}
      tooltipAlign="start"
    >
      {#if sidebarOpen}
        <PanelLeftClose class="w-5 h-5" strokeWidth="1.7" aria-hidden="true" />
      {:else}
        <PanelLeftOpen class="w-5 h-5" strokeWidth="1.7" aria-hidden="true" />
      {/if}
    </TooltipIconButton>
  {:else}
    <TooltipIconButton
      on:click={toggleSidebar}
      class="inline-flex h-11 w-11 lg:h-9 lg:w-9 shrink-0 items-center justify-center rounded-ui text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] hover:text-[var(--text-primary)]"
      label={sidebarToggleLabel}
      tooltip={sidebarToggleLabel}
      tooltipAlign="start"
    >
      {#if sidebarOpen}
        <PanelLeftClose class="w-5 h-5" strokeWidth="1.7" aria-hidden="true" />
      {:else}
        <PanelLeftOpen class="w-5 h-5" strokeWidth="1.7" aria-hidden="true" />
      {/if}
    </TooltipIconButton>
  {/if}

  {#if showSearch}
  <div class="relative min-w-0 flex-1">
    <SearchField
      bind:value={$searchQuery}
      bind:inputEl={searchInputEl}
      placeholder={$localizedText.header.search}
      label={$localizedText.header.search}
      title={$localizedText.header.searchHint}
      class="flex-1"
      on:input={handleSearchInput}
      on:clear={clearSearch}
      on:keydown={(e) => { if (e.key === 'Escape' && !$searchQuery) clearSearch(); }}
      on:focus={loadTags}
    >
      <svelte:fragment slot="trailing">
        {#if $searchQuery}
          <button
            type="button"
            data-testid="save-current-search"
            on:click={() => dispatch('saveSearch', $searchQuery)}
            class="inline-flex h-6 w-6 items-center justify-center rounded-ui text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--bg-tertiary)_35%,transparent)] hover:text-[var(--text-primary)]"
            aria-label={$localizedText.savedSearches.save}
            title={$localizedText.savedSearches.save}
          >
            <Bookmark size="12" strokeWidth="1.7" aria-hidden="true" />
          </button>
        {/if}
      </svelte:fragment>
    </SearchField>
    {#if showTagSuggestions}
      <div class="absolute top-full left-0 mt-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] shadow-lg z-50 max-h-48 overflow-y-auto w-full rounded-ui">
        <div class="px-3 pb-1 pt-2.5 text-[length:var(--text-whisper-lg)] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{$localizedText.tags.title}</div>
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
    data-testid="header-quick-note"
    on:click={createQuickNote}
    class="inline-flex h-11 w-11 lg:h-9 lg:w-9 shrink-0 items-center justify-center rounded-ui text-[var(--text-secondary)] transition hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] hover:text-[var(--text-primary)]"
    label={$localizedText.sidebar.quickNoteFromClipboard}
    tooltip={$localizedText.sidebar.quickNoteFromClipboard}
    tooltipAlign="end"
  >
    <Clipboard class="h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
  </TooltipIconButton>
  {:else}
    <div class="flex-1"></div>
  {/if}
</header>
