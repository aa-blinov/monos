<script>
  import { createEventDispatcher } from 'svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { localizedText } from '../lib/strings.js';
  import { X } from 'lucide-svelte';

  export let title = '';
  export let subtitle = '';
  export let widthClass = 'w-96';
  export let closeOnEscape = false;

  const dispatch = createEventDispatcher();

  function handleKeydown(event) {
    if (closeOnEscape && event.key === 'Escape') {
      dispatch('close');
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div
  class="fixed inset-0 bg-black/20 dark:bg-[var(--bg-tertiary)]/50 backdrop-blur-sm flex items-center justify-center z-50 overflow-hidden"
  role="dialog"
  aria-modal="true"
>
  <button
    type="button"
    class="absolute inset-0 cursor-default"
    aria-label={$localizedText.modal.closeBackdrop}
    on:click={() => dispatch('close')}
    on:keydown={handleKeydown}
  ></button>
  <div
    class={`relative z-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-8 shadow-2xl ${widthClass}`}
    role="document"
    on:wheel|stopPropagation
    on:touchmove|stopPropagation
  >
    {#if title}
      <h2 class="mb-1 shrink-0 pr-12 font-serif text-2xl leading-tight tracking-tight break-anywhere">{title}</h2>
    {/if}
    {#if subtitle}
      <p class="mb-5 shrink-0 pr-12 text-sm leading-relaxed text-[var(--text-secondary)]">{subtitle}</p>
    {:else if title}
      <div class="mb-5"></div>
    {/if}
    <TooltipIconButton
      type="button"
      class="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] transition hover:border-[var(--text-secondary)]/50 hover:text-[var(--text-primary)]"
      label={$localizedText.modal.close}
      tooltip={$localizedText.modal.close}
      tooltipAlign="end"
      on:click={() => dispatch('close')}
    >
      <X class="h-4 w-4" strokeWidth="1.7" aria-hidden="true" />
    </TooltipIconButton>
    <slot />
  </div>
</div>

<style>
  .break-anywhere {
    overflow-wrap: anywhere;
    word-break: break-word;
  }
</style>
