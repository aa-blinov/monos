<script>
  import { createEventDispatcher } from 'svelte';
  import { Button } from '@monos/ui';
  import NoteBoard from './NoteBoard.svelte';
  import { localizedText } from '../lib/strings.js';

  export let query = '';
  export let results = [];
  export let isSearching = false;
  export let mobile = false;

  const dispatch = createEventDispatcher();
</script>

<div class="h-full overflow-y-auto px-4 lg:px-12 py-6 lg:py-8" data-board-scroll>
  {#if results.length > 0}
    <div class="mx-auto max-w-6xl">
      <div class="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <div class="text-[length:var(--text-whisper)] uppercase tracking-[0.22em] text-[var(--text-secondary)]">{$localizedText.searchResults.heading}</div>
          <div class="mt-1 text-sm text-[var(--text-secondary)]" role="status">{$localizedText.searchResults.matches(results.length, query)}</div>
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
  {:else if !isSearching}
    <div class="flex h-32 flex-col items-center justify-center gap-3 px-4 text-center" role="status">
      <span class="text-xs uppercase tracking-widest opacity-70">{$localizedText.searchResults.noResults}</span>
      <p class="max-w-md text-sm text-[var(--text-secondary)]">{$localizedText.searchResults.noResultsHint}</p>
      <Button variant="ghost" size="md"
        type="button"
        class="inline-flex min-h-9 items-center text-xs uppercase tracking-widest text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
        on:click={() => dispatch('clear')}
      >{$localizedText.searchResults.clear}</Button>
    </div>
  {/if}
</div>
