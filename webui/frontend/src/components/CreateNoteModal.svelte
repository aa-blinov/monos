<script>
  import ModalShell from './ModalShell.svelte';
  import { localizedText, locale } from '../lib/strings.js';
  import { localeDate } from '../lib/date-format.js';
  import { fileNameProblem } from '../lib/file-name.js';
  import { createNoteRequest } from '../lib/sidebar-api.js';
  import { loadFileContent, restoreNoteRequest } from '../lib/editor-api.js';
  import { Button, Card, FieldControl } from '@monos/ui';

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
  // Set when the name belongs to a note in the Trash: it can be restored, or the new note takes another name.
  let trashedPath = '';
  let restoring = false;
  let titleInput;
  $: if (titleInput) {
    titleInput.onkeydown = (event) => {
      if (event.key === 'Enter' && !blockedName) submitCreateNote();
      if (event.key === 'Escape') onClose();
    };
    // preventScroll: on a short screen focusing the field scrolled the dialog past its title and close button.
    if (open) titleInput.focus({ preventScroll: true });
  }

  $: if (open) {
    newNoteCategory = category;
  } else {
    newNoteTitle = '';
    newNoteCategory = '';
    isCreating = false;
    createError = '';
    duplicatePath = '';
    trashedPath = '';
    restoring = false;
  }

  // A taken name is refused by the backend (409). Today's note opens the one that
  // already exists; any other name stays in the field with the reason shown.
  const isTrashedClash = (err) => err?.status === 409 && err.body?.code === 'trashed' && Boolean(err.body?.path);

  function createFailureText(err) {
    if (isTrashedClash(err)) return $localizedText.sidebar.errors.trashedNote;
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
      if (isTrashedClash(err)) {
        // Today's note is in the Trash: the dialog stays and says so, instead of opening a note that is not there.
        newNoteTitle = title;
        trashedPath = err.body.path;
        createError = createFailureText(err);
      } else if (err.status === 409 && err.body?.path) {
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
      trashedPath = typed && isTrashedClash(err) ? err.body.path : '';
      duplicatePath = typed && err.status === 409 && err.body?.path && !trashedPath ? err.body.path : '';
    } finally {
      isCreating = false;
    }
  }

  // The name is taken: offer the note that has it, or the same name with a number after it.
  async function openExistingNote() {
    const title = newNoteTitle.trim();
    const path = duplicatePath;
    // A server that still counts a note in the Trash as holding the name answers 409 with its path; opening it
    // is refused (410). The dialog says what happened and offers the Trash's way out, instead of closing on nothing.
    try {
      await loadFileContent(path);
    } catch (err) {
      if (err?.status === 410) {
        trashedPath = path;
        duplicatePath = '';
        createError = $localizedText.sidebar.errors.trashedNote;
        return;
      }
    }
    onClose();
    onCreated({ path, name: `${title}.md`, isDir: false }, title);
  }

  async function restoreTrashedNote() {
    if (restoring || !trashedPath) return;
    const path = trashedPath;
    try {
      restoring = true;
      createError = '';
      const restored = await restoreNoteRequest(path);
      const restoredPath = restored?.path || path;
      const name = restoredPath.split('/').pop() || `${newNoteTitle.trim()}.md`;
      onClose();
      onCreated({ path: restoredPath, name, isDir: false }, name.replace(/\.md$/i, ''));
    } catch (err) {
      createError = $localizedText.sidebar.errors.restoreFailed(err?.message || String(err));
    } finally {
      restoring = false;
    }
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
          <Card
            as="button"
            type="button"
            interactive
            padding="none"
            class="w-full min-h-24 flex flex-col items-start justify-start gap-0 p-4 normal-case rounded-ui border border-[var(--text-primary)] bg-[color-mix(in_srgb,var(--bg-secondary)_45%,transparent)] p-4 text-left transition hover:border-[var(--text-primary)]"
            on:click={() => titleInput?.focus()}
          >
            <span class="block text-sm font-semibold">{$localizedText.sidebar.modals.blankNote}</span>
            <span class="mt-2 block text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.sidebar.modals.blankNoteHint}</span>
          </Card>
          <Card
            as="button"
            type="button"
            interactive
            padding="none"
            class="w-full min-h-24 flex flex-col items-start justify-start gap-0 p-4 normal-case rounded-ui border border-[var(--border-subtle)] p-4 text-left transition hover:border-[color-mix(in_srgb,var(--text-secondary)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-secondary)_45%,transparent)] disabled:opacity-40"
            on:click={createToday}
            disabled={isCreating}
          >
            <span class="block text-sm font-semibold">{$localizedText.sidebar.modals.todayNote}</span>
            <span class="mt-2 block text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.sidebar.modals.todayNoteHint}</span>
          </Card>
          <Card
            as="button"
            type="button"
            interactive
            padding="none"
            class="w-full min-h-24 flex flex-col items-start justify-start gap-0 p-4 normal-case rounded-ui border border-[var(--border-subtle)] p-4 text-left transition hover:border-[color-mix(in_srgb,var(--text-secondary)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-secondary)_45%,transparent)]"
            on:click={pickTemplate}
          >
            <span class="block text-sm font-semibold">{$localizedText.sidebar.modals.fromTemplate}</span>
            <span class="mt-2 block text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.sidebar.modals.fromTemplateHint}</span>
          </Card>
        </div>
      </section>
      <div>
        <label for="create-note-title" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">{$localizedText.sidebar.modals.title}</label>
        <FieldControl
          id="create-note-title"
          bind:inputEl={titleInput}
          type="text"
          bind:value={newNoteTitle}
          on:input={() => { createError = ''; duplicatePath = ''; trashedPath = ''; }}
          placeholder={$localizedText.sidebar.modals.noteTitlePlaceholder}
        />
        <p class="mt-3 max-w-lg text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.sidebar.modals.titleHint}</p>
        {#if titleProblem && titleProblem !== 'empty'}
          <p role="alert" class="mt-3 max-w-lg text-xs leading-relaxed text-[var(--red-text)]">{$localizedText.sidebar.nameProblem(titleProblem)}</p>
        {/if}
        {#if createError}
          <p role="alert" class="mt-3 max-w-lg text-xs leading-relaxed text-[var(--red-text)]">{createError}</p>
          {#if trashedPath}
            <div class="mt-3 flex flex-wrap gap-3">
              <Button variant="primary" size="md" on:click={restoreTrashedNote} disabled={restoring} data-testid="restore-trashed-note">{$localizedText.sidebar.modals.restoreIt}</Button>
              <Button variant="secondary" size="md" on:click={createNumberedCopy} data-testid="create-another-name">{$localizedText.sidebar.modals.createAnotherName(`${newNoteTitle.trim()} 2`)}</Button>
            </div>
          {:else if duplicatePath}
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
