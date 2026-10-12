<script>
  import ModalShell from './ModalShell.svelte';
  import { localizedText } from '../lib/strings.js';
  import { createNoteRequest } from '../lib/sidebar-api.js';
  import { getModalButtonClass } from '../lib/modal-button.js';
  import { formFieldClass } from '../lib/form-field.js';

  export let open = false;
  export let category = '';
  export let onClose = () => {};
  export let onCreated = () => {};
  export let onPickTemplate = () => {};

  let newNoteTitle = '';
  let newNoteCategory = category;
  let isCreating = false;

  $: if (open) {
    newNoteCategory = category;
  } else {
    newNoteTitle = '';
    newNoteCategory = '';
    isCreating = false;
  }

  async function createToday() {
    if (isCreating) return;
    try {
      isCreating = true;
      const title = formatTodayNoteTitle();
      const data = await createNoteRequest({ title, category: 'Daily', tags: [], content: '' });
      onClose();
      onCreated(data, title);
    } catch (err) {
      console.error('Failed to create today note:', err);
    } finally {
      isCreating = false;
    }
  }

  async function submitCreateNote() {
    if (!newNoteTitle.trim() || isCreating) return;
    try {
      isCreating = true;
      const title = newNoteTitle.trim();
      const data = await createNoteRequest({ title, category: newNoteCategory, tags: [], content: '' });
      onClose();
      onCreated(data, title);
    } catch (err) {
      console.error('Failed to create note:', err);
    } finally {
      isCreating = false;
    }
  }

  function pickTemplate() {
    onClose();
    onPickTemplate();
  }

  function padDatePart(n) { return String(n).padStart(2, '0'); }
  function formatTodayNoteTitle(date = new Date()) {
    return [
      padDatePart(date.getDate()),
      padDatePart(date.getMonth() + 1),
      padDatePart(date.getFullYear() % 100),
      padDatePart(date.getHours()),
      padDatePart(date.getMinutes()),
      padDatePart(date.getSeconds()),
    ].join('-');
  }
</script>

{#if open}
  <ModalShell
    title={$localizedText.sidebar.modals.newNote}
    widthClass="w-[min(92vw,40rem)]"
    closeOnEscape={true}
    on:close={onClose}
  >
    <div class="space-y-6">
      <section>
        <div class="mb-3 text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
          {$localizedText.sidebar.modals.createStart}
        </div>
        <div class="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            class="min-h-24 rounded-md border border-[var(--border-subtle)] p-4 text-left transition hover:border-[var(--text-secondary)]/50 hover:bg-[var(--bg-secondary)]/45 disabled:opacity-40"
            on:click={createToday}
            disabled={isCreating}
          >
            <span class="block text-sm font-semibold">{$localizedText.sidebar.modals.todayNote}</span>
            <span class="mt-2 block text-[length:var(--text-whisper)] uppercase tracking-[0.14em] leading-relaxed text-[var(--text-tertiary)]">{$localizedText.sidebar.modals.todayNoteHint}</span>
          </button>
          <button
            type="button"
            class="min-h-24 rounded-md border border-[var(--border-subtle)] p-4 text-left transition hover:border-[var(--text-secondary)]/50 hover:bg-[var(--bg-secondary)]/45"
            on:click={pickTemplate}
          >
            <span class="block text-sm font-semibold">{$localizedText.sidebar.modals.fromTemplate}</span>
            <span class="mt-2 block text-[length:var(--text-whisper)] uppercase tracking-[0.14em] leading-relaxed text-[var(--text-tertiary)]">{$localizedText.sidebar.modals.fromTemplateHint}</span>
          </button>
        </div>
      </section>
      <div>
        <label for="create-note-title" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">{$localizedText.sidebar.modals.title}</label>
        <input
          id="create-note-title"
          type="text"
          bind:value={newNoteTitle}
          placeholder={$localizedText.sidebar.modals.noteTitlePlaceholder}
          class={formFieldClass()}
          on:keydown={(e) => {
            if (e.key === 'Enter' && newNoteTitle.trim()) submitCreateNote();
            if (e.key === 'Escape') onClose();
          }}
          autofocus
        />
        <p class="mt-3 max-w-lg text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.sidebar.modals.titleHint}</p>
      </div>
    </div>
    <div class="flex gap-6 mt-10">
      <button on:click={onClose} class={getModalButtonClass('secondary')}>{$localizedText.sidebar.modals.cancel}</button>
      <button
        on:click={submitCreateNote}
        disabled={isCreating || !newNoteTitle.trim()}
        class={getModalButtonClass('primary', { disabled: isCreating || !newNoteTitle.trim() })}
      >
        {isCreating ? $localizedText.sidebar.modals.creating : $localizedText.sidebar.modals.create}
      </button>
    </div>
  </ModalShell>
{/if}
