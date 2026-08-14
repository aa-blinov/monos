<script>
  import { createEventDispatcher, tick } from 'svelte';
  import ModalShell from './ModalShell.svelte';
  import { getModalButtonClass } from '../lib/modal-button.js';
  import { formFieldClass } from '../lib/form-field.js';
  import { resolveQuickNoteRename } from '../lib/quick-note-rename.js';
  import { localizedText } from '../lib/strings.js';
  import { displayNoteName } from '../lib/note-format.js';

  /** The saved quick note — object with { path, name, isDir }. */
  export let note = null;

  let editedName = '';
  let inputEl;

  $: if (note) {
    editedName = displayNoteName(note);
  }

  $: renameTarget = note
    ? resolveQuickNoteRename(displayNoteName(note), editedName)
    : null;
  $: canOpen = !!(note && editedName.trim() && editedName.trim() === editedName.trim());

  const dispatch = createEventDispatcher();

  export async function focusInput() {
    await tick();
    inputEl?.focus();
    inputEl?.select();
  }

  function handleOpen() {
    if (!note) return;
    dispatch('open', { note, renameTo: renameTarget });
  }

  function handleKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleOpen();
    }
  }
</script>

{#if note}
  <ModalShell
    title={$localizedText.sidebar.modals.quickNoteSaved}
    subtitle={$localizedText.sidebar.modals.quickNoteSavedHint}
    widthClass="w-[min(92vw,32rem)]"
    closeOnEscape={true}
    on:close={() => dispatch('close')}
  >
    <div class="space-y-2">
      <label for="quick-note-name" class="block text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--text-secondary)]/70">
        {$localizedText.sidebar.modals.title}
      </label>
      <input
        bind:this={inputEl}
        bind:value={editedName}
        id="quick-note-name"
        type="text"
        class={formFieldClass()}
        on:keydown={handleKeydown}
        data-testid="quick-note-name-input"
      />
      <div class="truncate pt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]/60">
        {note.path?.replace(/^notes\/?/, '')}
      </div>
      {#if renameTarget}
        <p class="text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)]/50">
          {$localizedText.sidebar.modals.quickNoteWillRenameTo(renameTarget)}
        </p>
      {/if}
    </div>

    <div class="mt-8 flex gap-4">
      <button
        type="button"
        on:click={() => dispatch('close')}
        class={getModalButtonClass('secondary')}
      >
        {$localizedText.sidebar.modals.stayHere}
      </button>
      <button
        type="button"
        on:click={handleOpen}
        disabled={!canOpen}
        class={getModalButtonClass('primary', { disabled: !canOpen })}
        data-testid="quick-note-open-button"
      >
        {$localizedText.sidebar.modals.openNote}
      </button>
    </div>
  </ModalShell>
{/if}
