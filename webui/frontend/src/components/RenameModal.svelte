<script>
  import { createEventDispatcher } from 'svelte';
  import ModalShell from './ModalShell.svelte';
  import { localizedText } from '../lib/strings.js';
  import { Button } from '@monos/ui';
  import { FieldControl } from '@monos/ui';
  import { fileNameProblem } from '../lib/file-name.js';

  /** Whether the target is a folder (changes the title suffix). */
  export let isDir = false;
  /** The current name to prefill. */
  export let currentName = '';
  /** Whether the submit button is in a "busy" state. */
  export let busy = false;
  /** Title for the section/note word. */
  export let sectionLabel = '';
  export let noteLabel = '';

  /** A reason the server refused the name, shown under the field until the name is changed. */
  export let serverProblem = '';
  /** Offered beside the reason when the name belongs to a note in the Trash. */
  export let canRestore = false;

  let newName = currentName;
  let submittedName = null;
  $: staleProblem = submittedName !== null && newName !== submittedName;
  $: if (currentName !== undefined) newName = currentName;
  // Новое имя станет именем файла: то, что ОС не создаст, называем до отправки.
  $: nameProblem = fileNameProblem(newName);

  const dispatch = createEventDispatcher();

  function submit() {
    if (!newName.trim() || newName === currentName || nameProblem) return;
    submittedName = newName;
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
      <FieldControl
        id="rename-input"
        type="text"
        bind:value={newName}
        placeholder={$localizedText.sidebar.modals.newNamePlaceholder}
        on:keydown={(event) => onKeydown(event.detail ?? event)}
      />
      {#if nameProblem && nameProblem !== 'empty'}
        <p role="alert" class="mt-3 text-xs leading-relaxed text-[var(--red-text)]">{$localizedText.sidebar.nameProblem(nameProblem)}</p>
      {/if}
      {#if serverProblem && !staleProblem}
        <p role="alert" class="mt-3 text-xs leading-relaxed text-[var(--red-text)]" data-testid="rename-problem">{serverProblem}</p>
        {#if canRestore}
          <div class="mt-3">
            <Button variant="secondary" size="md" on:click={() => dispatch('restore')} disabled={busy} data-testid="restore-trashed-note">{$localizedText.sidebar.modals.restoreIt}</Button>
          </div>
        {/if}
      {/if}
    </div>
  </div>
  <div class="flex gap-6 mt-12">
    <Button variant="secondary" size="md" class="flex-1" on:click={() => dispatch('close')}>{$localizedText.sidebar.modals.cancel}</Button>
    <Button variant="primary" size="md" class="flex-1" on:click={submit} disabled={busy || !newName.trim() || newName === currentName || Boolean(nameProblem)}>
      {busy ? $localizedText.sidebar.modals.renaming : $localizedText.sidebar.modals.rename}
    </Button>
  </div>
</ModalShell>
