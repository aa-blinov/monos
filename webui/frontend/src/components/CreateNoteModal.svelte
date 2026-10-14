<script>
  import ModalShell from './ModalShell.svelte';
  import { localizedText, locale } from '../lib/strings.js';
  import { localeStamp } from '../lib/date-format.js';
  import { fileNameProblem } from '../lib/file-name.js';
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
  let createError = '';
  // Set only when the backend refused the name (409): the note that already has it.
  let duplicatePath = '';

  $: if (open) {
    newNoteCategory = category;
  } else {
    newNoteTitle = '';
    newNoteCategory = '';
    isCreating = false;
    createError = '';
    duplicatePath = '';
  }

  // A taken name is refused by the backend (409). Today's note opens the one that
  // already exists; any other name stays in the field with the reason shown.
  function createFailureText(err) {
    return err.status === 409 ? $localizedText.sidebar.errors.duplicateNote : $localizedText.sidebar.errors.createNote(err.message);
  }

  async function createToday() {
    if (isCreating) return;
    const title = formatTodayNoteTitle();
    try {
      isCreating = true;
      createError = '';
      const data = await createNoteRequest({ title, category: 'Daily', tags: [], content: '' });
      onClose();
      onCreated(data, title);
    } catch (err) {
      if (err.status === 409 && err.body?.path) {
        onClose();
        onCreated({ path: err.body.path, name: `${title}.md`, isDir: false }, title);
      } else {
        createError = createFailureText(err);
      }
    } finally {
      isCreating = false;
    }
  }

  async function submitCreateNote() {
    if (!newNoteTitle.trim() || isCreating) return;
    const title = newNoteTitle.trim();
    try {
      isCreating = true;
      createError = '';
      const data = await createNoteRequest({ title, category: newNoteCategory, tags: [], content: '' });
      onClose();
      onCreated(data, title);
    } catch (err) {
      createError = createFailureText(err);
      duplicatePath = err.status === 409 && err.body?.path ? err.body.path : '';
    } finally {
      isCreating = false;
    }
  }

  // The name is taken: offer the note that has it, or the same name with a number after it.
  function openExistingNote() {
    const title = newNoteTitle.trim();
    const path = duplicatePath;
    onClose();
    onCreated({ path, name: `${title}.md`, isDir: false }, title);
  }

  async function createNumberedCopy() {
    if (isCreating) return;
    const base = newNoteTitle.trim();
    try {
      isCreating = true;
      createError = '';
      for (let n = 2; n <= 20; n += 1) {
        const title = `${base} ${n}`;
        try {
          const data = await createNoteRequest({ title, category: newNoteCategory, tags: [], content: '' });
          onClose();
          onCreated(data, title);
          return;
        } catch (err) {
          if (err.status !== 409) throw err;
        }
      }
      createError = $localizedText.sidebar.errors.duplicateNote;
    } catch (err) {
      createError = createFailureText(err);
    } finally {
      isCreating = false;
    }
  }

  function pickTemplate() {
    onClose();
    onPickTemplate();
  }

  // Название станет именем файла: то, что ОС не создаст, называем до отправки.
  $: titleProblem = fileNameProblem(newNoteTitle);

  function formatTodayNoteTitle(date = new Date()) {
    return localeStamp(date, $locale);
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
          on:input={() => { createError = ''; duplicatePath = ''; }}
          placeholder={$localizedText.sidebar.modals.noteTitlePlaceholder}
          class={formFieldClass()}
          on:keydown={(e) => {
            if (e.key === 'Enter' && newNoteTitle.trim() && !titleProblem) submitCreateNote();
            if (e.key === 'Escape') onClose();
          }}
          autofocus
        />
        <p class="mt-3 max-w-lg text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.sidebar.modals.titleHint}</p>
        {#if titleProblem && titleProblem !== 'empty'}
          <p role="alert" class="mt-3 max-w-lg text-xs leading-relaxed text-[var(--red)]">{$localizedText.sidebar.nameProblem(titleProblem)}</p>
        {/if}
        {#if createError}
          <p role="alert" class="mt-3 max-w-lg text-xs leading-relaxed text-[var(--red)]">{createError}</p>
          {#if duplicatePath}
            <div class="mt-3 flex flex-wrap gap-3">
              <button type="button" class={getModalButtonClass('secondary')} on:click={openExistingNote}>{$localizedText.sidebar.modals.openExisting}</button>
              <button type="button" class={getModalButtonClass('primary')} on:click={createNumberedCopy}>{$localizedText.sidebar.modals.createNumbered(`${newNoteTitle.trim()} 2`)}</button>
            </div>
          {/if}
        {/if}
      </div>
    </div>
    <div class="flex gap-6 mt-10">
      <button on:click={onClose} class={getModalButtonClass('secondary')}>{$localizedText.sidebar.modals.cancel}</button>
      <button
        on:click={submitCreateNote}
        disabled={isCreating || !newNoteTitle.trim() || Boolean(titleProblem)}
        class={getModalButtonClass('primary', { disabled: isCreating || !newNoteTitle.trim() || Boolean(titleProblem) })}
      >
        {isCreating ? $localizedText.sidebar.modals.creating : $localizedText.sidebar.modals.create}
      </button>
    </div>
  </ModalShell>
{/if}
