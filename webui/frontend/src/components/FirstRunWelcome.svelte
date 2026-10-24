<script>
  /**
   * The empty board on first launch: three ways in, side by side — start writing, bring the notes you already
   * have, or sync with your other devices — and one quiet line of what to try next. No tour, no steps to click
   * through: each path is one button to where that work happens. A phone opening this computer's notes over
   * Wi-Fi gets only "start writing": the folder and GitHub belong to the computer.
   */
  import { createEventDispatcher } from 'svelte';
  import { Button } from '@monos/ui';
  import { FolderOpen, PenLine, RefreshCw } from 'lucide-svelte';
  import { localizedText } from '../lib/strings.js';
  import { shortcutLabel } from '../lib/shortcut-label.js';

  export let mobile = false;
  export let thisComputer = true;
  export let terminal = false;
  export let importStatus = '';
  export let importError = '';

  const dispatch = createEventDispatcher();

  // The one thing most people came to do: a filled button, the only one on the screen. The folder and sync paths
  // stay quiet text buttons; they matter to some people, not to everyone.
  // The kit's own variant colour (`text-ink`) is an equal-weight utility and used to win over the label colour,
  // which made the label the colour of its own background; `!` is what keeps the label readable.
  const primaryAction = '!bg-[var(--text-primary)] !text-[var(--bg-primary)] hover:!opacity-85';
  const kbd = 'rounded-ui border border-[var(--border-subtle)] px-1.5 py-0.5 text-[length:var(--text-whisper-lg)] text-[var(--text-primary)]';

  $: text = $localizedText.app.welcome;
</script>

<div class="mx-auto flex min-h-[60vh] max-w-5xl flex-col justify-center py-8" data-testid="first-run-welcome">
  <h1 class="font-serif text-3xl tracking-tight text-[var(--text-primary)]">{text.title}</h1>
  <p class="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">{text.lead}</p>

  <div class="mt-8 grid gap-4 {thisComputer ? 'md:grid-cols-3' : ''}">
    <section class="flex flex-col rounded-ui border border-[var(--text-secondary)] p-5" data-testid="welcome-write">
      <PenLine size="20" strokeWidth="1.7" class="text-[var(--text-secondary)]" aria-hidden="true" />
      <h2 class="mt-4 text-base font-bold text-[var(--text-primary)]">{text.writeTitle}</h2>
      <p class="mt-1.5 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">{text.writeText}</p>
      <div class="mt-4 flex flex-wrap gap-x-6">
        <Button variant="primary" size="lg" type="button" class={primaryAction} data-testid="welcome-write-action" on:click={() => dispatch('newNote')}>{text.writeAction}</Button>
      </div>
    </section>

    {#if thisComputer}
      <section class="flex flex-col rounded-ui border border-[var(--border-subtle)] p-5" data-testid="welcome-have">
        <FolderOpen size="20" strokeWidth="1.7" class="text-[var(--text-secondary)]" aria-hidden="true" />
        <h2 class="mt-4 text-base font-bold text-[var(--text-primary)]">{text.haveTitle}</h2>
        <p class="mt-1.5 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">{text.haveText}</p>
        <div class="mt-4 flex flex-wrap gap-x-6">
          <Button variant="ghost" size="md" on:click={() => dispatch('chooseFolder')}>{text.folderAction}</Button>
          <Button variant="ghost" size="md" on:click={() => dispatch('importArchive')}>{text.importAction}</Button>
        </div>
        {#if importStatus}<p class="mt-3 text-xs text-[var(--text-tertiary)]" role="status">{importStatus}</p>{/if}
        {#if importError}<p class="mt-3 text-xs text-[var(--red-text)]" role="alert">{importError}</p>{/if}
      </section>

      <section class="flex flex-col rounded-ui border border-[var(--border-subtle)] p-5" data-testid="welcome-sync">
        <RefreshCw size="20" strokeWidth="1.7" class="text-[var(--text-secondary)]" aria-hidden="true" />
        <h2 class="mt-4 text-base font-bold text-[var(--text-primary)]">{text.syncTitle}</h2>
        <p class="mt-1.5 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">{text.syncText}</p>
        <div class="mt-4 flex flex-wrap gap-x-6">
          <Button variant="ghost" size="md" on:click={() => dispatch('connectSync')}>{text.syncAction}</Button>
        </div>
      </section>
    {/if}
  </div>

  <div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[var(--text-secondary)]" data-testid="first-run-tips">
    {#if !mobile}<span><kbd class={kbd}>{shortcutLabel('Ctrl+K')}</kbd> {text.tipSearch}</span>{/if}
    <span><kbd class={kbd}>[[</kbd> {text.tipLinks}</span>
    <span><kbd class={kbd}>/</kbd> {text.tipBlocks}</span>
    {#if terminal}<span><kbd class={kbd}>{shortcutLabel('Ctrl+J')}</kbd> {text.tipAgent}</span>{/if}
    <Button variant="ghost" size="md" class="ml-auto" on:click={() => dispatch('openHelp')}>{text.help}</Button>
  </div>
</div>
