<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { Button } from '@monos/ui';
  import { Star } from 'lucide-svelte';
  import { localizedText, locale } from '../lib/strings.js';
  import { localeDate } from '../lib/date-format.js';
  import { loadFavoriteNotes, setFavoriteRequest } from '../lib/favorites.js';

  // The notes marked as favorites, apart from the pinned ones. A click opens a note; the star takes it off the list.
  const dispatch = createEventDispatcher();

  let rows = [];
  let status = 'loading';

  async function load() {
    try {
      rows = await loadFavoriteNotes();
      status = 'ready';
    } catch (error) {
      console.error('Failed to load favorites:', error);
      status = 'error';
    }
  }
  onMount(load);

  async function remove(row) {
    rows = rows.filter((item) => item.path !== row.path);
    try {
      await setFavoriteRequest(row.path, false);
    } catch (error) {
      console.error('Failed to remove the favourite:', error);
      await load();
    }
  }

  const open = (row) => dispatch('navigate', { path: row.path, name: row.title, isDir: false });
</script>

<section class="h-full overflow-y-auto px-4 py-4 sm:py-6 lg:px-12 lg:py-8" data-testid="favorites-view">
  <div class="mx-auto max-w-3xl space-y-5">
    <header class="mb-5">
      <h1 class="truncate font-serif text-3xl tracking-tight">{$localizedText.favorites.title}</h1>
      <p class="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">{$localizedText.favorites.hint}</p>
    </header>

    {#if status === 'loading'}
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.favorites.loading}</p>
    {:else if status === 'error'}
      <p role="alert" class="text-xs text-[var(--red)]">{$localizedText.favorites.loadFailed}</p>
    {:else if rows.length === 0}
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.favorites.empty}</p>
    {:else}
      <ul class="rounded-ui divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)]" data-testid="favorites-list">
        {#each rows as row (row.path)}
          <li class="flex items-center gap-1" data-testid="favorite-row">
            <Button variant="ghost" size="md"
              type="button"
              class="min-h-11 min-w-0 flex-1 border-0 bg-transparent px-4 py-2 text-left transition hover:bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)]"
              on:click={() => open(row)}
            >
              <span class="block truncate text-sm font-bold text-[var(--text-primary)]">{row.title}</span>
              <span class="block truncate text-[length:var(--text-whisper)] uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                {row.category || ''}{row.category && row.modified ? ', ' : ''}{row.modified ? localeDate(new Date(row.modified), $locale) : ''}
              </span>
            </Button>
            <Button variant="ghost" size="sm"
              type="button"
              aria-label={`${$localizedText.favorites.remove}: ${row.title}`}
              title={$localizedText.favorites.remove}
              data-testid="favorite-remove"
              class="mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center border-0 bg-transparent text-[var(--text-primary)] transition hover:opacity-60"
              on:click={() => remove(row)}
            >
              <Star size="16" strokeWidth="1.7" fill="currentColor" aria-hidden="true" />
            </Button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>
