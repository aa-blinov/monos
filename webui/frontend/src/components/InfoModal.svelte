<script>
  import { createEventDispatcher } from 'svelte';
  import ModalShell from './ModalShell.svelte';
  import { localizedText } from '../lib/strings.js';
  import { getModalButtonClass } from '../lib/modal-button.js';

  /** Title shown in the modal header. */
  export let title = '';
  /** Optional subtitle or hint above the main content. */
  export let hint = '';
  /** Main message body. */
  export let message = '';
  /** Optional detail card (object with name and path). */
  export let detail = null;
  /** Width class passed to ModalShell. */
  export let widthClass = 'w-[min(92vw,28rem)]';
  /** Label for the secondary button (left). Empty to hide. */
  export let secondaryLabel = '';
  /** Label for the primary button (right). Empty to hide. */
  export let primaryLabel = '';
  /** Style for the primary button (font weight). */
  export let primaryStyle = 'bold';

  const dispatch = createEventDispatcher();
</script>

<ModalShell {title} {widthClass} closeOnEscape={true} on:close={() => dispatch('close')}>
  <div class="space-y-4">
    {#if hint}
      <p class="text-sm leading-relaxed text-[var(--text-secondary)]">
        {hint}
      </p>
    {/if}
    {#if detail}
      <div class="rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/35 px-4 py-3">
        <div class="truncate text-sm font-semibold">{detail.name}</div>
        <div class="mt-1 truncate text-[length:var(--text-whisper)] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{detail.path?.replace(/^notes\//, '')}</div>
      </div>
    {/if}
    {#if message}
      <p class="text-sm leading-relaxed text-[var(--text-secondary)]">
        {message}
      </p>
    {/if}
  </div>
  <div class="mt-8 flex {secondaryLabel && primaryLabel ? 'gap-4' : 'justify-center'}">
    {#if secondaryLabel}
      <button
        type="button"
        on:click={() => dispatch('secondary')}
        class={getModalButtonClass('secondary')}
      >
        {secondaryLabel}
      </button>
    {/if}
    {#if primaryLabel}
      <button
        type="button"
        on:click={() => dispatch('primary')}
        class={getModalButtonClass(primaryStyle === 'bold' ? 'primary' : 'secondary')}
      >
        {primaryLabel}
      </button>
    {/if}
  </div>
</ModalShell>
