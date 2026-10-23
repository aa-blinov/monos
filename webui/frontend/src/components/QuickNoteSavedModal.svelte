<script>
  import { createEventDispatcher, tick } from 'svelte';
  import ModalShell from './ModalShell.svelte';
  import { Button, FieldControl } from '@monos/ui';
  import { resolveQuickNoteRename } from '../lib/quick-note-rename.js';
  import { localizedText } from '../lib/strings.js';
  import { displayNoteName } from '../lib/note-format.js';

  /** The saved quick note — object with { path, name, isDir }. */
  export let note = null;

  let editedName = '';
  let inputEl;
  $: if (inputEl) inputEl.onkeydown = handleKeydown;
  let lastNotePath = null;

  // Синхронизируем editedName с note, но только когда note реально меняется
  // (другой path). Раньше здесь был `$: if (note) { ... }`, и компилятор
  // Svelte 4 почему-то пере-вычислял его на каждый input-event, сбрасывая
  // то, что пользователь только что напечатал.
  $: if (note && note.path !== lastNotePath) {
    editedName = displayNoteName(note);
    lastNotePath = note.path;
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
      <label for="quick-note-name" class="block text-[length:var(--text-whisper)] uppercase tracking-[0.18em] font-bold text-[var(--text-tertiary)]">
        {$localizedText.sidebar.modals.title}
      </label>
      <FieldControl
        bind:inputEl={inputEl}
        bind:value={editedName}
        id="quick-note-name"
        type="text"
        data-testid="quick-note-name-input"
      />
      <div class="truncate pt-1 text-[length:var(--text-whisper)] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
        {note.path?.replace(/^notes\/?/, '')}
      </div>
      {#if renameTarget}
        <p class="text-[length:var(--text-whisper)] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
          {$localizedText.sidebar.modals.quickNoteWillRenameTo(renameTarget)}
        </p>
      {/if}
    </div>

    <div class="mt-8 flex gap-4">
      <Button variant="secondary" size="md" class="flex-1" on:click={() => dispatch('close')}>{$localizedText.sidebar.modals.stayHere}</Button>
      <Button variant="primary" size="md" class="flex-1" on:click={handleOpen} disabled={!canOpen} data-testid="quick-note-open-button">{$localizedText.sidebar.modals.openNote}</Button>
    </div>
  </ModalShell>
{/if}
