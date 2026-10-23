<script>
  import ModalShell from './ModalShell.svelte';
  import { localizedText } from '../lib/strings.js';
  import { displayNoteName, recentPathLabel } from '../lib/note-format.js';
  import { Button, Card } from '@monos/ui';

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
        <Card
          as="button"
          type="button"
          interactive
          padding="none"
          class="w-full flex-col items-start justify-start gap-0 p-3 text-left normal-case"
          on:click={() => onOpenNote(note)}
        >
          <span class="block truncate text-sm font-semibold tracking-tight">{displayNoteName(note)}</span>
          <span class="mt-1 block truncate text-[length:var(--text-whisper)] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{recentPathLabel(note, $localizedText.sidebar?.modals?.root)}</span>
        </Card>
      {/each}
    </div>
    <div class="mt-8 flex gap-4">
      <Button variant="secondary" size="md" class="flex-1" on:click={onClose}>{$localizedText.sidebar.modals.cancel}</Button>
      <Button variant="primary" size="md" class="flex-1" on:click={onOpenAll}>{$localizedText.app.continueWork.all}</Button>
    </div>
  </ModalShell>
{/if}
