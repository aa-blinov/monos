<script>
  /**
   * One confirmation surface for every destructive action.
   *
   * Native `confirm()` announces a browser tool at the highest-stakes moment
   * in the app; this announces the same care as the rest of the system. Square
   * panel, text-only uppercase footer pair — the same geometry as every other
   * modal, so the delete flow never looks like it came from somewhere else.
   */
  import { createEventDispatcher } from 'svelte';
  import { Button } from '@monos/ui';
  import ModalShell from './ModalShell.svelte';
  import { getModalButtonClass } from '../lib/modal-button.js';
  import { localizedText } from '../lib/strings.js';

  export let title = '';
  export let message = '';
  export let confirmLabel = '';
  export let cancelLabel = '';
  export let danger = false;

  const dispatch = createEventDispatcher();

  $: resolvedConfirm = confirmLabel || $localizedText.modal.confirm;
  $: resolvedCancel = cancelLabel || $localizedText.modal.cancel;

  function confirm() {
    dispatch('confirm');
  }

  function cancel() {
    dispatch('cancel');
  }
</script>

<ModalShell {title} widthClass="w-96" closeOnEscape={true} on:close={cancel}>
  {#if message}
    <p class="text-sm leading-relaxed text-[var(--text-secondary)] break-anywhere">{message}</p>
  {/if}

  <div class="mt-8 flex gap-3">
    <Button variant="ghost" size="sm"
      type="button"
      class={getModalButtonClass('secondary', { extraClass: 'py-2' })}
      on:click={cancel}
    >
      {resolvedCancel}
    </Button>
    <Button variant="ghost" size="sm"
      type="button"
      class={getModalButtonClass('primary', {
        extraClass: danger ? 'py-2 text-[var(--red)]' : 'py-2',
      })}
      on:click={confirm}
    >
      {resolvedConfirm}
    </Button>
  </div>
</ModalShell>

<style>
  .break-anywhere {
    overflow-wrap: anywhere;
    word-break: break-word;
  }
</style>
