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
  import { Button } from '@monos/ui';
  import ModalShell from './ModalShell.svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { locale, localizedText } from '../lib/strings.js';
  import { noteHistoryRequest, noteRevisionRequest, restoreNoteRevisionRequest, revisionTitle, groupRevisionsByDay, relativeDay } from '../lib/git-history.js';

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

  const formatTime = (value) => new Intl.DateTimeFormat(dateLocale($locale), { timeStyle: 'short' }).format(new Date(value));
  const formatDay = (value) => new Intl.DateTimeFormat(dateLocale($locale), { dateStyle: 'long' }).format(new Date(value));
  function dayLabel(date, texts) {
    const relative = relativeDay(date);
    return relative ? texts[relative] : formatDay(date);
  }
  $: groups = groupRevisionsByDay(revisions);

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
    if (line.startsWith('-')) return 'text-[var(--red-text)] bg-[color-mix(in_srgb,var(--red)_8%,transparent)]';
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
    <!-- Not a dead end: the way to get a history is one click away. -->
    <Button variant="ghost" size="md" data-testid="history-open-sync" class="mt-4" on:click={() => dispatch('openSettings')}>{$localizedText.history.setUpSync}</Button>
  {:else if !revisions.length}
    <p class="text-sm text-[var(--text-secondary)]">{$localizedText.history.empty}</p>
  {:else}
    <div class="grid gap-6 lg:grid-cols-[minmax(0,18rem)_1fr]">
      <div class="max-h-[60vh] overflow-y-auto pr-2" data-testid="history-timeline">
        <p class="mb-2 text-[length:var(--text-whisper)] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">↑ {$localizedText.history.newerEnd}</p>
        <ol class="relative" aria-label={$localizedText.history.timeline}>
          {#each groups as group, groupIndex (`${group.key}:${groupIndex}`)}
            <li class="relative {groupIndex > 0 ? 'mt-4' : ''}">
              <!-- One rail per day, running on into the next; it starts at the first dot and ends at the last. -->
              <span class="absolute left-[5.5px] w-px bg-[var(--border-subtle)] {groupIndex === 0 ? 'top-[3.4rem]' : '-top-4'} {groupIndex === groups.length - 1 ? 'bottom-[2.1rem]' : '-bottom-4'}" aria-hidden="true"></span>
              <p class="mb-2 pl-6 text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]" data-testid="history-day">{dayLabel(group.date, $localizedText.history)}</p>
              <ol>
                {#each group.revisions as revision, index (revision.sha)}
                  {@const latest = groupIndex === 0 && index === 0}
                  <li class="relative pl-6">
                    <span
                      class="absolute left-0 top-3 h-3 w-3 rounded-full border-2 {selected?.sha === revision.sha ? 'border-[var(--text-primary)] bg-[var(--text-primary)]' : latest ? 'border-[var(--text-primary)] bg-[var(--bg-primary)]' : 'border-[var(--text-tertiary)] bg-[var(--bg-primary)]'}"
                      aria-hidden="true"
                    ></span>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid="history-revision"
                      aria-pressed={selected?.sha === revision.sha}
                      on:click={() => openRevision(revision)}
                      class="mb-1 w-full justify-start px-3 py-2 normal-case {selected?.sha === revision.sha ? 'bg-surface' : ''}"
                    >
                      <span class="flex items-baseline justify-between gap-2">
                        <span class="text-xs font-bold text-[var(--text-primary)]">{revisionTitle(revision.message, $localizedText.history.messages) || $localizedText.history.noMessage}</span>
                        <span class="shrink-0 text-[length:var(--text-whisper)] tabular-nums text-[var(--text-secondary)]">{formatTime(revision.date)}</span>
                      </span>
                      <span class="mt-1 block text-[length:var(--text-whisper)] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                        {revision.author}, {revision.short}{#if latest}{', '}{$localizedText.history.newest}{/if}
                      </span>
                    </Button>
                  </li>
                {/each}
              </ol>
            </li>
          {/each}
        </ol>
        <p class="mt-2 text-[length:var(--text-whisper)] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">↓ {$localizedText.history.olderEnd}</p>
      </div>

      <div class="min-w-0">
        {#if error}
          <p class="mb-3 text-xs text-[var(--red-text)]">{error}</p>
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
            <Button variant="primary" size="sm" on:click={restore} disabled={restoring || !selectedContent.changed}>
              {restoring ? $localizedText.history.restoring : $localizedText.history.restore}
            </Button>
          </div>
          {#if !selectedContent.changed}
            <p class="mt-2 text-xs text-[var(--text-tertiary)]">{$localizedText.history.unchanged}</p>
          {:else}
            <pre class="rounded-ui mt-3 max-h-[52vh] overflow-auto border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-secondary)_25%,transparent)] p-3 font-mono text-xs leading-relaxed">{#each selectedContent.diff.split('\n') as line, i}<span class="block {lineClass(line)}">{line || ' '}</span>{/each}</pre>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</ModalShell>
