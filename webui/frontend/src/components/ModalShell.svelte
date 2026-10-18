<script context="module">
  // Open dialogs, newest last: only the top one answers Esc and holds Tab, so a confirmation over a panel
  // closes alone and focus never leaks to a dialog underneath.
  const openDialogs = [];
  let nextId = 0;
</script>

<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { localizedText } from '../lib/strings.js';
  import { X } from 'lucide-svelte';

  export let title = '';
  export let subtitle = '';
  export let widthClass = 'w-96';
  export let closeOnEscape = true;

  const dispatch = createEventDispatcher();
  const titleId = `modal-title-${nextId += 1}`;
  const token = {};
  // Taken while the component is created, before the content inside it (which may focus its own input) mounts.
  const opener = typeof document === 'undefined' ? null : document.activeElement;
  let box = null;

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function focusables() {
    return [...(box?.querySelectorAll(FOCUSABLE) || [])].filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  function handleKeydown(event) {
    if (openDialogs[openDialogs.length - 1] !== token) return;
    if (closeOnEscape && event.key === 'Escape') {
      dispatch('close');
      return;
    }
    // Tab stays inside the dialog: from the last control it goes to the first, and Shift+Tab the other way.
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (items.length === 0) {
      event.preventDefault();
      box?.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !box?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !box?.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  onMount(() => {
    openDialogs.push(token);
    // A dialog that did not put focus on a control of its own takes it itself.
    if (!box?.contains(document.activeElement)) box?.focus();
    return () => {
      const at = openDialogs.indexOf(token);
      if (at >= 0) openDialogs.splice(at, 1);
      if (opener && opener !== document.body && document.contains(opener)) opener.focus?.();
    };
  });
</script>

<svelte:window on:keydown={handleKeydown} />

<div
  class="fixed inset-0 bg-black/20 dark:bg-[color-mix(in_srgb,var(--bg-tertiary)_50%,transparent)] backdrop-blur-sm flex items-center justify-center z-50 overflow-hidden"
  role="dialog"
  aria-modal="true"
  aria-labelledby={title ? titleId : undefined}
>
  <button
    type="button"
    class="absolute inset-0 cursor-default"
    aria-label={$localizedText.modal.closeBackdrop}
    tabindex="-1"
    on:click={() => dispatch('close')}
    on:keydown={handleKeydown}
  ></button>
  <div
    class={`relative z-10 rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-8 shadow-2xl outline-none ${widthClass}`}
    tabindex="-1"
    bind:this={box}
    on:wheel|stopPropagation
    on:touchmove|stopPropagation
  >
    {#if title}
      <h2 id={titleId} class="mb-1 shrink-0 pr-12 font-serif text-2xl leading-tight tracking-tight break-anywhere">{title}</h2>
    {/if}
    {#if subtitle}
      <p class="mb-5 shrink-0 pr-12 text-sm leading-relaxed text-[var(--text-secondary)]">{subtitle}</p>
    {:else if title}
      <div class="mb-5"></div>
    {/if}
    <TooltipIconButton
      type="button"
      class="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-ui border border-[var(--border-subtle)] text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--text-secondary)_50%,transparent)] hover:text-[var(--text-primary)]"
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
