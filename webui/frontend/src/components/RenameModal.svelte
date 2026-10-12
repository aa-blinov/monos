<script>
  import { createEventDispatcher } from 'svelte';
  import ModalShell from './ModalShell.svelte';
  import { localizedText } from '../lib/strings.js';
  import { getModalButtonClass } from '../lib/modal-button.js';
  import { formFieldClass } from '../lib/form-field.js';

  /** Whether the target is a folder (changes the title suffix). */
  export let isDir = false;
  /** The current name to prefill. */
  export let currentName = '';
  /** Whether the submit button is in a "busy" state. */
  export let busy = false;
  /** Title for the section/note word. */
  export let sectionLabel = '';
  export let noteLabel = '';

  let newName = currentName;
  $: if (currentName !== undefined) newName = currentName;

  const dispatch = createEventDispatcher();

  function submit() {
    if (!newName.trim() || newName === currentName) return;
    dispatch('submit', { newName });
  }

  function onKeydown(event) {
    if (event.key === 'Enter') submit();
    if (event.key === 'Escape') dispatch('close');
  }
</script>

<ModalShell
  title={$localizedText.sidebar.modals.renameTitle(isDir ? sectionLabel : noteLabel)}
  on:close={() => dispatch('close')}
>
  <div class="space-y-8">
    <div>
      <label for="rename-input" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">{$localizedText.sidebar.modals.newName}</label>
      <input
        id="rename-input"
        type="text"
        bind:value={newName}
        placeholder={$localizedText.sidebar.modals.newNamePlaceholder}
        class={formFieldClass()}
        on:keydown={onKeydown}
      />
    </div>
  </div>
  <div class="flex gap-6 mt-12">
    <button on:click={() => dispatch('close')} class={getModalButtonClass('secondary')}>{$localizedText.sidebar.modals.cancel}</button>
    <button
      on:click={submit}
      disabled={busy || !newName.trim() || newName === currentName}
      class={getModalButtonClass('primary', { disabled: busy || !newName.trim() || newName === currentName })}
    >
      {busy ? $localizedText.sidebar.modals.renaming : $localizedText.sidebar.modals.rename}
    </button>
  </div>
</ModalShell>
