<script>
  import { createEventDispatcher } from 'svelte';
  import NoteBoard from './NoteBoard.svelte';
  import { localizedText } from '../lib/strings.js';

  export let query = '';
  export let results = [];
  export let isSearching = false;
  export let mobile = false;

  const dispatch = createEventDispatcher();
</script>

<div class="h-full overflow-y-auto px-4 lg:px-12 py-6 lg:py-8" data-board-scroll>
  {#if isSearching}
    <div class="flex items-center justify-center h-32">
      <span class="text-xs uppercase tracking-widest animate-pulse">{$localizedText.searchResults.searching}</span>
    </div>
  {:else if results.length > 0}
    <div class="mx-auto max-w-6xl">
      <div class="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <div class="text-[10px] uppercase tracking-[0.22em] text-[var(--text-secondary)]">{$localizedText.searchResults.heading}</div>
          <div class="mt-1 text-sm text-[var(--text-secondary)]">{$localizedText.searchResults.matches(results.length, query)}</div>
        </div>
      </div>
      <NoteBoard
        notes={results}
        {query}
        highlight={true}
        {mobile}
        on:openFull={(e) => dispatch('openResult', e.detail)}
        on:reveal={(e) => dispatch('reveal', e.detail)}
      />
    </div>
  {:else}
    <div class="flex items-center justify-center h-32">
      <span class="text-xs uppercase tracking-widest opacity-40">{$localizedText.searchResults.noResults}</span>
    </div>
  {/if}
</div>
