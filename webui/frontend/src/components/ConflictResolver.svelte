<script>
  import { createEventDispatcher } from 'svelte';
  import ModalShell from './ModalShell.svelte';
  import { localizedText } from '../lib/strings.js';
  import { ChevronLeft, ChevronRight, FileCode } from 'lucide-svelte';

  export let conflicts = [];
  export let currentIndex = 0;

  const dispatch = createEventDispatcher();

  $: current = conflicts[currentIndex] || null;
  $: hasMore = currentIndex < conflicts.length - 1;
  $: remaining = conflicts.length - currentIndex - 1;

  function chooseOurs() {
    if (!current) return;
    dispatch('resolve', { path: current.path, choice: 'ours' });
    if (hasMore) currentIndex++;
    else dispatch('done');
  }

  function chooseTheirs() {
    if (!current) return;
    dispatch('resolve', { path: current.path, choice: 'theirs' });
    if (hasMore) currentIndex++;
    else dispatch('done');
  }
</script>

{#if current}
  <ModalShell
    title={$localizedText.settings.resolveConflicts}
    widthClass="w-[min(95vw,72rem)]"
    closeOnEscape={true}
    on:close={() => dispatch('done')}
  >
    <div class="mb-4 flex items-center justify-between">
      <div class="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <FileCode size="16" strokeWidth="1.7" />
        <span class="font-mono">{current.path}</span>
      </div>
      <span class="text-xs text-[var(--text-secondary)]">
        {currentIndex + 1} / {conflicts.length}
      </span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-secondary)]/50 border-b border-[var(--border-subtle)]">
          <span class="text-xs font-bold uppercase tracking-widest text-[var(--green)]">{$localizedText.settings.conflictOurs}</span>
          <button
            on:click={chooseOurs}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--green)]/10 text-[var(--green)] hover:bg-[var(--green)]/20 transition"
          >
            <ChevronLeft size="14" />
            {$localizedText.settings.keepLocal}
          </button>
        </div>
        <pre class="p-4 text-xs leading-relaxed font-mono overflow-x-auto max-h-80 overflow-y-auto text-[var(--text-primary)]">{current.ours || $localizedText.settings.empty}</pre>
      </div>

      <div class="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-secondary)]/50 border-b border-[var(--border-subtle)]">
          <span class="text-xs font-bold uppercase tracking-widest text-[var(--blue)]">{$localizedText.settings.conflictTheirs}</span>
          <button
            on:click={chooseTheirs}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--blue)]/10 text-[var(--blue)] hover:bg-[var(--blue)]/20 transition"
          >
            {$localizedText.settings.keepRemote}
            <ChevronRight size="14" />
          </button>
        </div>
        <pre class="p-4 text-xs leading-relaxed font-mono overflow-x-auto max-h-80 overflow-y-auto text-[var(--text-primary)]">{current.theirs || $localizedText.settings.empty}</pre>
      </div>
    </div>

    {#if hasMore}
      <p class="mt-4 text-xs text-center text-[var(--text-secondary)]">
        {$localizedText.settings.conflictsRemaining(remaining)}
      </p>
    {:else}
      <p class="mt-4 text-xs text-center text-[var(--green)]">
        {$localizedText.settings.allConflictsResolved}
      </p>
    {/if}
  </ModalShell>
{/if}
