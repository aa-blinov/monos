<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { RotateCcw, Trash2, XCircle } from 'lucide-svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import ConfirmModal from './ConfirmModal.svelte';
  import { deleteFilePermanentlyRequest, loadTrashNotesRequest, restoreNoteRequest } from '../lib/editor-api.js';
  import { locale, localizedText } from '../lib/strings.js';

  export let initialNotes = null;

  const dispatch = createEventDispatcher();

  let notes = [];
  let isLoading = true;
  let error = '';
  let busyPath = '';
  let pendingDelete = null;

  $: if (Array.isArray(initialNotes) && isLoading) {
    notes = initialNotes;
    isLoading = false;
  }

  function pathLabel(note) {
    return String(note?.path || '').replace(/^notes\/?/, '');
  }

  async function loadTrash() {
    try {
      isLoading = true;
      error = '';
      notes = await loadTrashNotesRequest();
    } catch (err) {
      error = err.message || $localizedText.trash.loadFailed;
    } finally {
      isLoading = false;
    }
  }

  async function restore(note) {
    if (!note?.path || busyPath) return;
    try {
      busyPath = note.path;
      const restored = await restoreNoteRequest(note.path);
      notes = notes.filter((item) => item.path !== note.path);
      dispatch('restored', restored);
    } catch (err) {
      error = err.message || $localizedText.trash.restoreFailed;
    } finally {
      busyPath = '';
    }
  }

  function requestDeleteForever(note) {
    if (!note?.path || busyPath) return;
    pendingDelete = note;
  }

  function cancelDeleteForever() {
    pendingDelete = null;
  }

  async function deleteForever(note) {
    if (!note?.path) return;
    pendingDelete = null;
    try {
      busyPath = note.path;
      await deleteFilePermanentlyRequest(note.path);
      notes = notes.filter((item) => item.path !== note.path);
      dispatch('deleted', note);
    } catch (err) {
      error = err.message || $localizedText.trash.deleteFailed;
    } finally {
      busyPath = '';
    }
  }

  onMount(() => {
    if (Array.isArray(initialNotes)) return;
    void loadTrash();
  });
</script>

<div class="h-full overflow-y-auto px-4 py-4 sm:py-6 lg:px-12 lg:py-8">
  <div class="mx-auto max-w-5xl">
    <div class="mb-7 flex items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="truncate font-serif text-3xl tracking-tight">{$localizedText.trash.title}</h1>
        <p class="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
          {$localizedText.trash.hint}
        </p>
      </div>
      <div class="shrink-0 rounded-ui border border-[var(--border-subtle)] px-3 py-1.5 text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        {notes.length}
      </div>
    </div>

    {#if isLoading}
      <div class="py-20 text-center text-xs uppercase tracking-widest text-[var(--text-secondary)]">
        {$localizedText.trash.loading}
      </div>
    {:else if error}
      <div class="border border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[color-mix(in_srgb,var(--red)_12%,transparent)] px-4 py-3 text-sm text-[var(--red)]">
        {error}
      </div>
    {:else if notes.length === 0}
      <div class="rounded-ui border border-dashed border-[var(--border-subtle)] px-6 py-20 text-center">
        <div class="font-serif text-xl tracking-tight">{$localizedText.trash.emptyTitle}</div>
        <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
          {$localizedText.trash.emptyHint}
        </p>
      </div>
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {#each notes as note (note.path)}
          <article class="group flex min-h-48 flex-col overflow-hidden rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 shadow-sm shadow-black/[0.03]">
            <div class="min-w-0">
              <h2 class="truncate font-serif text-lg font-medium tracking-tight">{note.name}</h2>
              <div class="mt-1 truncate text-[length:var(--text-whisper)] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                {pathLabel(note)}
              </div>
            </div>

            <p class="mt-4 line-clamp-3 text-sm leading-relaxed text-[var(--text-secondary)]">
              {note.excerpt || $localizedText.app.board.emptyNote}
            </p>

            <div class="mt-auto flex items-center justify-between gap-3 pt-5">
              <div class="truncate text-[length:var(--text-whisper)] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                {note.trashedAt ? new Intl.DateTimeFormat($locale === 'ru' ? 'ru-RU' : 'en-US', { month: 'short', day: 'numeric' }).format(new Date(note.trashedAt)) : ''}
              </div>
              <div class="flex items-center gap-1">
                <TooltipIconButton
                  type="button"
                  class="h-9 w-9 rounded-ui text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30"
                  label={$localizedText.trash.restore}
                  tooltip={$localizedText.trash.restore}
                  disabled={busyPath === note.path}
                  on:click={() => restore(note)}
                >
                  <RotateCcw size="16" strokeWidth="1.7" aria-hidden="true" />
                </TooltipIconButton>
                <TooltipIconButton
                  type="button"
                  class="h-9 w-9 rounded-ui text-[var(--red)] transition hover:bg-[color-mix(in_srgb,var(--red)_12%,transparent)] disabled:opacity-30"
                  label={$localizedText.trash.deleteForever}
                  tooltip={$localizedText.trash.deleteForever}
                  tooltipAlign="end"
                  disabled={busyPath === note.path}
                  on:click={() => requestDeleteForever(note)}
                >
                  <XCircle size="16" strokeWidth="1.7" aria-hidden="true" />
                </TooltipIconButton>
              </div>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if pendingDelete}
  <ConfirmModal
    danger={true}
    title={$localizedText.trash.deleteForever}
    message={$localizedText.trash.deleteForeverConfirm(pendingDelete.name || pendingDelete.path)}
    on:confirm={() => deleteForever(pendingDelete)}
    on:cancel={cancelDeleteForever}
  />
{/if}
