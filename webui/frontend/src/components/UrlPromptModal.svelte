<script>
  /**
   * Designed replacement for the browser `prompt()` used when inserting a
   * link or an image. Same square panel as every other modal, same underline
   * field as every other input — an OS text box is the one surface that never
   * matched the rest of the system.
   */
  import { createEventDispatcher } from 'svelte';
  import ModalShell from './ModalShell.svelte';
  import { Button, FieldControl } from '@monos/ui';
  import { localizedText } from '../lib/strings.js';

  export let title = '';
  export let label = '';
  export let placeholder = '';
  /** What the main button does; a dialog that inserts says so instead of a generic “Confirm”. */
  export let submitLabel = '';
  let urlInput = null;
  $: if (urlInput) urlInput.focus();

  const dispatch = createEventDispatcher();

  let value = '';

  $: canSubmit = value.trim().length > 0;

  function submit() {
    const next = value.trim();
    if (!next) return;
    dispatch('submit', next);
  }

  function cancel() {
    dispatch('cancel');
  }
</script>

<ModalShell {title} widthClass="w-96" closeOnEscape={true} on:close={cancel}>
  <form
    class="block"
    on:submit|preventDefault={submit}
  >
    <label class="mb-2 block text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]" for="url-prompt-input">
      {label}
    </label>
    <FieldControl
      bind:inputEl={urlInput}
      id="url-prompt-input"
      type="text"
      bind:value
      {placeholder}
      autocomplete="off"
      spellcheck="false"
    />

    <div class="mt-8 flex gap-3">
      <Button variant="secondary" size="md" class="flex-1" on:click={cancel}>{$localizedText.modal.cancel}</Button>
      <Button type="submit" variant="primary" size="md" class="flex-1" disabled={!canSubmit}>{submitLabel || $localizedText.modal.confirm}</Button>
    </div>
  </form>
</ModalShell>
