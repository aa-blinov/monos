<script>
  /**
   * Note history, read from git.
   *
   * The notes folder is the repository, so every version of a note already
   * exists — this only surfaces it. Restoring writes the old text back to the
   * file and stages it; history is never rewritten, so the act of restoring is
   * itself visible the next time the note syncs.
   */
  import { createEventDispatcher } from 'svelte';
  import ModalShell from './ModalShell.svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { locale, localizedText } from '../lib/strings.js';
  import { noteHistoryRequest, noteRevisionRequest, restoreNoteRevisionRequest } from '../lib/git-history.js';

  export let notePath = '';
  export let onRestored = () => {};

  const dispatch = createEventDispatcher();

  let revisions = [];
  let tracked = false;
  let loading = true;
  let error = '';
  let selected = null;
  let selectedContent = null;
  let loadingContent = false;
  let restoring = false;

  const dateLocale = (current) => (current === 'ru' ? 'ru-RU' : 'en-US');
  const formatDate = (value) => new Intl.DateTimeFormat(dateLocale($locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

  async function load() {
    loading = true;
    error = '';
    selected = null;
    selectedContent = null;
    try {
      const data = await noteHistoryRequest(notePath);
      revisions = data.revisions || [];
      tracked = data.tracked !== false;
    } catch (e) {
      error = e?.message || String(e);
    } finally {
      loading = false;
    }
  }

  async function openRevision(revision) {
    selected = revision;
    loadingContent = true;
    try {
      selectedContent = await noteRevisionRequest(notePath, revision.sha);
    } catch (e) {
      error = e?.message || String(e);
      selectedContent = null;
    } finally {
      loadingContent = false;
    }
  }

  async function restore() {
    if (!selected) return;
    restoring = true;
    error = '';
    try {
      await restoreNoteRevisionRequest(notePath, selected.sha);
      await load();
      dispatch('restored');
      onRestored();
    } catch (e) {
      error = e?.message || String(e);
    } finally {
      restoring = false;
    }
  }

  // Diff lines arrive pre-rendered by git; colour them by meaning.
  function lineClass(line) {
    if (line.startsWith('+++') || line.startsWith('---')) return 'text-[var(--text-tertiary)]';
    if (line.startsWith('@@')) return 'text-[var(--blue)]';
    if (line.startsWith('+')) return 'text-[var(--text-primary)] bg-[color-mix(in_srgb,var(--text-primary)_7%,transparent)]';
    if (line.startsWith('-')) return 'text-[var(--red)] bg-[color-mix(in_srgb,var(--red)_8%,transparent)]';
    return 'text-[var(--text-secondary)]';
  }

  $: if (notePath) load();
</script>

<ModalShell
  title={$localizedText.history.title}
  widthClass="w-[min(94vw,60rem)]"
  closeOnEscape={true}
  on:close={() => dispatch('close')}
>
  {#if loading}
    <p class="text-sm text-[var(--text-secondary)]">{$localizedText.history.loading}</p>
  {:else if !tracked}
    <p class="text-sm text-[var(--text-secondary)]">{$localizedText.history.notSynced}</p>
  {:else if !revisions.length}
    <p class="text-sm text-[var(--text-secondary)]">{$localizedText.history.empty}</p>
  {:else}
    <div class="grid gap-6 lg:grid-cols-[minmax(0,18rem)_1fr]">
      <ol class="max-h-[60vh] space-y-px overflow-y-auto border border-[var(--border-subtle)]">
        {#each revisions as revision (revision.sha)}
          <li>
            <button
              type="button"
              on:click={() => openRevision(revision)}
              class="w-full border-0 border-b border-[var(--border-subtle)] px-3 py-2.5 text-left transition {selected?.sha === revision.sha ? 'bg-[var(--bg-secondary)]' : 'bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)]/50'}"
            >
              <span class="block text-xs font-bold text-[var(--text-primary)]">{revision.message || $localizedText.history.noMessage}</span>
              <span class="mt-1 block text-[length:var(--text-whisper)] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                {revision.author} · {formatDate(revision.date)} · {revision.short}
              </span>
            </button>
          </li>
        {/each}
      </ol>

      <div class="min-w-0">
        {#if error}
          <p class="mb-3 text-xs text-[var(--red)]">{error}</p>
        {/if}
        {#if !selected}
          <p class="text-sm text-[var(--text-secondary)]">{$localizedText.history.pickRevision}</p>
        {:else if loadingContent}
          <p class="text-sm text-[var(--text-secondary)]">{$localizedText.history.loading}</p>
        {:else if selectedContent}
          <div class="flex items-center justify-between gap-4">
            <p class="text-[length:var(--text-whisper)] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
              {$localizedText.history.diffTitle}
            </p>
            <button
              type="button"
              on:click={restore}
              disabled={restoring || !selectedContent.changed}
              class="text-xs uppercase tracking-widest font-bold transition enabled:hover:opacity-70 disabled:opacity-30"
            >
              {restoring ? $localizedText.history.restoring : $localizedText.history.restore}
            </button>
          </div>
          {#if !selectedContent.changed}
            <p class="mt-2 text-xs text-[var(--text-tertiary)]">{$localizedText.history.unchanged}</p>
          {:else}
            <pre class="mt-3 max-h-[52vh] overflow-auto border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/25 p-3 font-mono text-xs leading-relaxed">{#each selectedContent.diff.split('\n') as line, i}<span class="block {lineClass(line)}">{line || ' '}</span>{/each}</pre>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</ModalShell>