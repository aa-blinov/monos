<script>
  import ModalShell from './ModalShell.svelte';
  import { localizedText, locale } from '../lib/strings.js';
  import { localeDate } from '../lib/date-format.js';
  import { fileNameProblem } from '../lib/file-name.js';
  import { createNoteRequest } from '../lib/sidebar-api.js';
  import { Button } from '@monos/ui';
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
  let titleInput;

  // The title field takes the caret when the dialog opens. An action rather than `autofocus`: the
  // attribute is ignored when the dialog is added to an already loaded page.
  function focusOnOpen(node) {
    node.focus();
  }

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
      const data = await createNoteRequest({ title, category: 'Daily', tags: [], content: '', openIfExists: true });
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

  // A note without a name is called "Untitled", then "Untitled 2", and so on, until a free name is found.
  async function createUntitledNote(base, category) {
    for (let n = 1; n <= 20; n += 1) {
      const title = n === 1 ? base : `${base} ${n}`;
      try {
        return { data: await createNoteRequest({ title, category, tags: [], content: '' }), title };
      } catch (err) {
        if (err.status !== 409) throw err;
      }
    }
    throw Object.assign(new Error('No free name'), { status: 409 });
  }

  async function submitCreateNote() {
    if (isCreating || blockedName) return;
    const typed = newNoteTitle.trim();
    try {
      isCreating = true;
      createError = '';
      if (typed) {
        const data = await createNoteRequest({ title: typed, category: newNoteCategory, tags: [], content: '' });
        onClose();
        onCreated(data, typed);
        return;
      }
      const { data, title } = await createUntitledNote($localizedText.sidebar.untitledNote, newNoteCategory);
      onClose();
      onCreated(data, title);
    } catch (err) {
      createError = createFailureText(err);
      duplicatePath = typed && err.status === 409 && err.body?.path ? err.body.path : '';
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
  // An empty name is fine (the note becomes "Untitled"); only an unusable name blocks Create.
  $: blockedName = Boolean(titleProblem) && titleProblem !== 'empty';

  function formatTodayNoteTitle(date = new Date()) {
    // Date only: a second click on the same day opens today's note instead of making another one.
    return localeDate(date, $locale);
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
        <div class="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            class="min-h-24 flex flex-col justify-start rounded-ui border border-[var(--text-primary)] bg-[color-mix(in_srgb,var(--bg-secondary)_45%,transparent)] p-4 text-left transition hover:border-[var(--text-primary)]"
            on:click={() => titleInput?.focus()}
          >
            <span class="block text-sm font-semibold">{$localizedText.sidebar.modals.blankNote}</span>
            <span class="mt-2 block text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.sidebar.modals.blankNoteHint}</span>
          </button>
          <button
            type="button"
            class="min-h-24 flex flex-col justify-start rounded-ui border border-[var(--border-subtle)] p-4 text-left transition hover:border-[color-mix(in_srgb,var(--text-secondary)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-secondary)_45%,transparent)] disabled:opacity-40"
            on:click={createToday}
            disabled={isCreating}
          >
            <span class="block text-sm font-semibold">{$localizedText.sidebar.modals.todayNote}</span>
            <span class="mt-2 block text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.sidebar.modals.todayNoteHint}</span>
          </button>
          <button
            type="button"
            class="min-h-24 flex flex-col justify-start rounded-ui border border-[var(--border-subtle)] p-4 text-left transition hover:border-[color-mix(in_srgb,var(--text-secondary)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-secondary)_45%,transparent)]"
            on:click={pickTemplate}
          >
            <span class="block text-sm font-semibold">{$localizedText.sidebar.modals.fromTemplate}</span>
            <span class="mt-2 block text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.sidebar.modals.fromTemplateHint}</span>
          </button>
        </div>
      </section>
      <div>
        <label for="create-note-title" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">{$localizedText.sidebar.modals.title}</label>
        <input
          id="create-note-title"
          bind:this={titleInput}
          type="text"
          bind:value={newNoteTitle}
          on:input={() => { createError = ''; duplicatePath = ''; }}
          placeholder={$localizedText.sidebar.modals.noteTitlePlaceholder}
          class={formFieldClass()}
          on:keydown={(e) => {
            if (e.key === 'Enter' && !blockedName) submitCreateNote();
            if (e.key === 'Escape') onClose();
          }}
          use:focusOnOpen
        />
        <p class="mt-3 max-w-lg text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.sidebar.modals.titleHint}</p>
        {#if titleProblem && titleProblem !== 'empty'}
          <p role="alert" class="mt-3 max-w-lg text-xs leading-relaxed text-[var(--red)]">{$localizedText.sidebar.nameProblem(titleProblem)}</p>
        {/if}
        {#if createError}
          <p role="alert" class="mt-3 max-w-lg text-xs leading-relaxed text-[var(--red)]">{createError}</p>
          {#if duplicatePath}
            <div class="mt-3 flex flex-wrap gap-3">
              <Button variant="secondary" size="md" on:click={openExistingNote}>{$localizedText.sidebar.modals.openExisting}</Button>
              <Button variant="primary" size="md" on:click={createNumberedCopy}>{$localizedText.sidebar.modals.createNumbered(`${newNoteTitle.trim()} 2`)}</Button>
            </div>
          {/if}
        {/if}
      </div>
    </div>
    <div class="flex gap-6 mt-10">
      <Button variant="secondary" size="md" on:click={onClose}>{$localizedText.sidebar.modals.cancel}</Button>
      <Button
        variant="primary"
        size="md"
        on:click={submitCreateNote}
        disabled={isCreating || blockedName}
      >
        {isCreating ? $localizedText.sidebar.modals.creating : $localizedText.sidebar.modals.create}
      </Button>
    </div>
  </ModalShell>
{/if}
