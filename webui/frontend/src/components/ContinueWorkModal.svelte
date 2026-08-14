<script>
  import ModalShell from './ModalShell.svelte';
  import { localizedText } from '../lib/strings.js';
  import { displayNoteName, recentPathLabel } from '../lib/note-format.js';
  import { getModalButtonClass } from '../lib/modal-button.js';

  export let open = false;
  export let notes = [];
  export let onClose = () => {};
  export let onOpenNote = () => {};
  export let onOpenAll = () => {};
</script>

{#if open}
  <ModalShell
    title={$localizedText.app.continueWork.modalTitle}
    widthClass="w-[min(92vw,36rem)]"
    closeOnEscape={true}
    on:close={onClose}
  >
    <div class="space-y-2">
      {#each notes.slice(0, 6) as note (note.path)}
        <button
          type="button"
          class="w-full rounded-2xl border border-transparent px-3 py-3 text-left transition hover:border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)]/45"
          on:click={() => onOpenNote(note)}
        >
          <span class="block truncate text-sm font-semibold tracking-tight">{displayNoteName(note)}</span>
          <span class="mt-1 block truncate text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]/60">{recentPathLabel(note, $localizedText.sidebar?.modals?.root)}</span>
        </button>
      {/each}
    </div>
    <div class="mt-8 flex gap-4">
      <button
        type="button"
        class={getModalButtonClass('secondary')}
        on:click={onClose}
      >
        {$localizedText.sidebar.modals.cancel}
      </button>
      <button
        type="button"
        class={getModalButtonClass('primary')}
        on:click={onOpenAll}
      >
        {$localizedText.app.continueWork.all}
      </button>
    </div>
  </ModalShell>
{/if}
