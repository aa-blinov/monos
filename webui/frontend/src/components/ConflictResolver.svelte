<script>
  import { createEventDispatcher } from 'svelte';
  import { Button } from '@monos/ui';
  import ModalShell from './ModalShell.svelte';
  import { localizedText } from '../lib/strings.js';
  import { ChevronLeft, ChevronRight, FileCode } from 'lucide-svelte';

  export let conflicts = [];
  export let currentIndex = 0;

  const dispatch = createEventDispatcher();

  $: current = conflicts[currentIndex] || null;
  // An image is chosen by looking at it: both versions are shown as pictures.
  $: isImage = /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(current?.path || '');
  const versionUrl = (item, side) => `/api/git/conflict-file?path=${encodeURIComponent(item.path)}&side=${side}`;
  $: oursLabel = current?.sides?.ours?.device ? `${current.sides.ours.device} (${$localizedText.editor.conflictThisDevice})` : $localizedText.settings.conflictOurs;
  $: theirsLabel = current?.sides?.theirs?.device || $localizedText.settings.conflictTheirs;
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
      <div class="rounded-ui border border-[var(--border-subtle)] overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2.5 bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)] border-b border-[var(--border-subtle)]">
          <span class="text-xs font-bold uppercase tracking-widest text-[var(--green-text)]">{oursLabel}</span>
          <Button variant="ghost" size="sm"
            on:click={chooseOurs}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-ui text-xs font-medium bg-[color-mix(in_srgb,var(--green)_10%,transparent)] text-[var(--green-text)] hover:bg-[color-mix(in_srgb,var(--green)_20%,transparent)] transition"
          >
            <ChevronLeft size="14" strokeWidth="1.7" />
            {$localizedText.settings.keepLocal}
          </Button>
        </div>
        {#if isImage && current.oursExists !== false}
          <img src={versionUrl(current, 'ours')} alt={oursLabel} class="block max-h-80 w-full object-contain p-4" data-testid="conflict-image-ours" />
        {:else}
          <pre class="p-4 text-xs leading-relaxed font-mono overflow-x-auto max-h-80 overflow-y-auto text-[var(--text-primary)]">{current.ours || $localizedText.settings.empty}</pre>
        {/if}
      </div>

      <div class="rounded-ui border border-[var(--border-subtle)] overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2.5 bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)] border-b border-[var(--border-subtle)]">
          <span class="text-xs font-bold uppercase tracking-widest text-[var(--blue)]">{theirsLabel}</span>
          <Button variant="ghost" size="sm"
            on:click={chooseTheirs}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-ui text-xs font-medium bg-[color-mix(in_srgb,var(--blue)_10%,transparent)] text-[var(--blue)] hover:bg-[color-mix(in_srgb,var(--blue)_20%,transparent)] transition"
          >
            {$localizedText.settings.keepRemote}
            <ChevronRight size="14" strokeWidth="1.7" />
          </Button>
        </div>
        {#if isImage && current.theirsExists !== false}
          <img src={versionUrl(current, 'theirs')} alt={theirsLabel} class="block max-h-80 w-full object-contain p-4" data-testid="conflict-image-theirs" />
        {:else}
          <pre class="p-4 text-xs leading-relaxed font-mono overflow-x-auto max-h-80 overflow-y-auto text-[var(--text-primary)]">{current.theirs || $localizedText.settings.empty}</pre>
        {/if}
      </div>
    </div>

    <p class="mt-4 text-xs text-center text-[var(--text-secondary)]">
      {hasMore ? $localizedText.settings.conflictsRemaining(remaining) : $localizedText.settings.chooseConflictVersion}
    </p>
  </ModalShell>
{/if}
