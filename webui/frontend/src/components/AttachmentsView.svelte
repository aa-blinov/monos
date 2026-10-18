<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { FileText } from 'lucide-svelte';
  import { localizedText, locale } from '../lib/strings.js';
  import { fetchAllAttachments, filterAttachments, formatAttachmentSize } from '../lib/attachments.js';
  import { localeDate } from '../lib/date-format.js';
  import SearchField from './SearchField.svelte';

  // Every picture and PDF of the notes in one grid. The file is shown, its size and date sit under it, and a
  // click opens the note that uses it. "Unused" narrows the grid to the files nothing points at.
  const dispatch = createEventDispatcher();

  let items = [];
  let lockedNotes = 0;
  let status = 'loading';
  let query = '';
  let filter = 'all';
  // Cards whose full list of notes is open.
  let expanded = new Set();
  function toggleExpanded(path) {
    expanded = expanded.has(path) ? new Set([...expanded].filter((item) => item !== path)) : new Set([...expanded, path]);
  }

  onMount(async () => {
    try {
      const data = await fetchAllAttachments();
      items = data.items || [];
      lockedNotes = data.lockedNotes || 0;
      status = 'ready';
    } catch (error) {
      console.error('Failed to load attachments:', error);
      status = 'error';
    }
  });

  $: shown = filterAttachments(items, { query, filter, lockedNotes });
  $: unusedSize = lockedNotes > 0 ? 0 : items.filter((item) => item.usedBy.length === 0).reduce((sum, item) => sum + item.size, 0);
  $: unusedCount = lockedNotes > 0 ? 0 : items.filter((item) => item.usedBy.length === 0).length;

  const rawUrl = (item) => `/api/attachments/raw?path=${encodeURIComponent(item.path)}`;

  function openNote(note) {
    dispatch('navigate', { path: note.path, name: note.title, isDir: false });
  }
</script>

<section class="h-full overflow-y-auto px-4 py-4 sm:py-6 lg:px-12 lg:py-8" data-testid="attachments-view">
  <div class="mx-auto max-w-6xl space-y-5">
    <header class="space-y-2">
      <div class="mb-5">
        <h1 class="truncate font-serif text-3xl tracking-tight">{$localizedText.attachments.title}</h1>
        <p class="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">{$localizedText.attachments.hint}</p>
      </div>
      <SearchField bind:value={query} placeholder={$localizedText.attachments.search} testid="attachments-query" />
    </header>

    {#if status === 'loading'}
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.loading}</p>
    {:else if status === 'error'}
      <p role="alert" class="text-xs text-[var(--red)]">{$localizedText.attachments.loadFailed}</p>
    {:else if items.length === 0}
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.empty}</p>
    {:else}
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label={$localizedText.attachments.title}>
        <button
          type="button"
          aria-pressed={filter === 'all'}
          data-testid="attachments-filter-all"
          on:click={() => { filter = 'all'; }}
          class="rounded-ui border px-2 py-1 text-xs {filter === 'all' ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'}"
        >{$localizedText.attachments.filterAll} ({items.length})</button>
        <button
          type="button"
          aria-pressed={filter === 'unused'}
          data-testid="attachments-filter-unused"
          on:click={() => { filter = 'unused'; }}
          class="rounded-ui border px-2 py-1 text-xs {filter === 'unused' ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'}"
        >{$localizedText.attachments.filterUnused} ({unusedCount})</button>
        <span class="ml-auto text-xs text-[var(--text-tertiary)]" data-testid="attachments-count">{$localizedText.attachments.count(shown.length, items.length)}</span>
      </div>
      {#if lockedNotes > 0}
        <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.lockedHint}</p>
      {:else if unusedCount > 0}
        <p class="text-xs text-[var(--text-tertiary)]" data-testid="attachments-unused-summary">{$localizedText.attachments.unusedSummary(unusedCount, formatAttachmentSize(unusedSize))}</p>
      {/if}

      {#if shown.length === 0}
        <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.noMatches}</p>
      {:else}
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="attachments-grid">
          {#each shown as item (item.path)}
            <li class="rounded-ui flex min-w-0 flex-col overflow-hidden border border-[var(--border-subtle)]" data-testid="attachment-card">
              <div class="flex aspect-[4/3] items-center justify-center overflow-hidden bg-[var(--bg-secondary)]">
                {#if item.kind === 'image'}
                  <img src={rawUrl(item)} alt={item.name} loading="lazy" class="h-full w-full object-cover" />
                {:else}
                  <span class="flex flex-col items-center gap-2 text-[var(--text-secondary)]">
                    <FileText size="24" strokeWidth="1.7" aria-hidden="true" />
                    <span class="text-xs">{$localizedText.attachments.pdf}</span>
                  </span>
                {/if}
              </div>
              <div class="min-w-0 space-y-1 p-3">
                <p class="truncate text-xs font-bold text-[var(--text-primary)]" title={item.name}>{item.name}</p>
                <p class="text-[length:var(--text-whisper)] uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                  {formatAttachmentSize(item.size)}, {localeDate(new Date(item.modified), $locale)}
                </p>
                {#if item.usedBy.length === 0}
                  <p class="text-xs text-[var(--text-tertiary)]" data-testid="attachment-unused">{lockedNotes > 0 ? '' : $localizedText.attachments.unused}</p>
                {:else}
                  <div class="space-y-0.5" data-testid="attachment-notes">
                    {#each (expanded.has(item.path) ? item.usedBy : item.usedBy.slice(0, 2)) as note (note.path)}
                      <button
                        type="button"
                        class="block min-h-6 w-full truncate border-0 bg-transparent p-0 text-left text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                        title={note.path}
                        on:click={() => openNote(note)}
                      >{note.title}</button>
                    {/each}
                    {#if item.usedBy.length > 2}
                      <button
                        type="button"
                        data-testid="attachment-more-notes"
                        aria-expanded={expanded.has(item.path)}
                        class="block min-h-6 border-0 bg-transparent p-0 text-left text-[length:var(--text-whisper)] uppercase tracking-[0.1em] text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]"
                        on:click={() => toggleExpanded(item.path)}
                      >{expanded.has(item.path) ? $localizedText.attachments.showLess : $localizedText.attachments.showAll(item.usedBy.length)}</button>
                    {/if}
                  </div>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</section>
