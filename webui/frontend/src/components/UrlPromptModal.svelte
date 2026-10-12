<script>
  /**
   * Designed replacement for the browser `prompt()` used when inserting a
   * link or an image. Same square panel as every other modal, same underline
   * field as every other input — an OS text box is the one surface that never
   * matched the rest of the system.
   */
  import { createEventDispatcher } from 'svelte';
  import ModalShell from './ModalShell.svelte';
  import { getModalButtonClass } from '../lib/modal-button.js';
  import { formFieldClass } from '../lib/form-field.js';
  import { localizedText } from '../lib/strings.js';

  export let title = '';
  export let label = '';
  export let placeholder = '';

  const dispatch = createEventDispatcher();

  let value = '';

  $: canSubmit = value.trim().length > 0;

  /**
   * Focus the field as the node is inserted.
   *
   * `onMount` + `tick()` lost the race: the editor keeps focus on its
   * contenteditable, so the caret stayed in the note. An action runs
   * synchronously at insertion, before anything can steal it back.
   */
  function autofocus(node) {
    node.focus();
    node.select();
  }

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
    <input
      use:autofocus
      id="url-prompt-input"
      type="text"
      class={formFieldClass()}
      bind:value
      {placeholder}
      class:placeholder-muted={true}
      autocomplete="off"
      spellcheck="false"
    />

    <div class="mt-8 flex gap-3">
      <button
        type="button"
        class={getModalButtonClass('secondary', { extraClass: 'py-2' })}
        on:click={cancel}
      >
        {$localizedText.modal.cancel}
      </button>
      <button
        type="submit"
        class={getModalButtonClass('primary', { disabled: !canSubmit, extraClass: 'py-2' })}
        disabled={!canSubmit}
      >
        {$localizedText.modal.confirm}
      </button>
    </div>
  </form>
</ModalShell>