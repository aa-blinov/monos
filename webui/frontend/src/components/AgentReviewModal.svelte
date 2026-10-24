<script>
  /**
   * What the agent changed since it started, one file at a time: the difference against the checkpoint, and
   * "Keep" or "Revert" for this file or for all of them. Kept edits go to the other devices with the next sync
   * in a commit of their own; reverted files are back as they were, and an open note shows it at once.
   */
  import { createEventDispatcher } from 'svelte';
  import { Button, Card } from '@monos/ui';
  import ModalShell from './ModalShell.svelte';
  import { displayFolderName, localizedText } from '../lib/strings.js';
  import { agentDiff, agentReview, keepAgentChanges, revertAgentChanges } from '../lib/agent-review.js';

  const dispatch = createEventDispatcher();
  let selected = null;
  let diff = '';
  let loading = false;
  let busy = false;
  let error = '';

  $: changes = $agentReview.changes || [];
  $: if (changes.length && (!selected || !changes.some((change) => change.path === selected))) select(changes[0].path);
  $: if (!changes.length) dispatch('close');
  $: current = changes.find((change) => change.path === selected) || null;

  function label(path) {
    const parts = path.replace(/^notes\//, '').replace(/\.md$/, '').split('/');
    const name = parts.pop();
    const folder = parts.map((part, index) => (index === 0 ? displayFolderName(part, $localizedText) : part)).join(' / ');
    return { name, folder };
  }

  async function select(path) {
    selected = path;
    loading = true;
    error = '';
    try {
      diff = await agentDiff(path);
    } catch (failure) {
      diff = '';
      error = failure?.message || String(failure);
    } finally {
      loading = false;
    }
  }

  async function act(kind, paths) {
    busy = true;
    error = '';
    try {
      if (kind === 'keep') await keepAgentChanges(paths);
      else await revertAgentChanges(paths);
    } catch (failure) {
      error = failure?.message || String(failure);
    } finally {
      busy = false;
    }
  }

  function lineClass(line) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file')) return 'hidden';
    // A hunk header (`@@ -3,6 +3,6 @@`) is git's bookkeeping: shown as a quiet break between the changed places.
    if (line.startsWith('@@')) return 'text-[var(--text-tertiary)]';
    if (line.startsWith('+')) return 'text-[var(--text-primary)] bg-[color-mix(in_srgb,var(--green)_12%,transparent)]';
    if (line.startsWith('-')) return 'text-[var(--red-text)] bg-[color-mix(in_srgb,var(--red)_8%,transparent)]';
    return 'text-[var(--text-secondary)]';
  }
</script>

<ModalShell title={$localizedText.agentReview.title} subtitle={$localizedText.agentReview.subtitle(changes.length)} widthClass="w-[min(95vw,72rem)]" closeOnEscape={true} on:close={() => dispatch('close')}>
  <div class="grid min-h-[22rem] grid-cols-1 gap-4 md:grid-cols-[18rem_1fr]" data-testid="agent-review">
    <ul class="max-h-[56vh] space-y-1 overflow-y-auto">
      {#each changes as change (change.path)}
        <li>
          <Card
            as="button"
            type="button"
            interactive
            selected={selected === change.path}
            padding="none"
            on:click={() => select(change.path)}
            class="w-full flex flex-row items-start justify-start gap-2 px-2 py-1.5 text-left normal-case"
            data-testid="agent-review-item"
          >
            <span class="mt-0.5 w-16 shrink-0 text-[length:var(--text-whisper)] uppercase tracking-[0.12em] {change.status === 'added' ? 'text-[var(--green-text)]' : change.status === 'deleted' ? 'text-[var(--red-text)]' : 'text-[var(--blue)]'}">{$localizedText.agentReview.status[change.status]}</span>
            <span class="min-w-0">
              <span class="block truncate text-sm text-[var(--text-primary)]">{label(change.path).name}</span>
              {#if label(change.path).folder}<span class="block truncate text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{label(change.path).folder}</span>{/if}
            </span>
          </Card>
        </li>
      {/each}
    </ul>
    <div class="flex min-w-0 flex-col">
      {#if current}
        <div class="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2">
          <p class="mr-auto min-w-0 truncate text-sm font-bold text-[var(--text-primary)]">{label(current.path).name}</p>
          {#if current.status !== 'deleted'}
            <Button variant="quiet" size="sm" on:click={() => dispatch('open', current.path)}>{$localizedText.agentReview.open}</Button>
          {/if}
          <Button variant="danger" size="sm" data-testid="agent-review-revert" disabled={busy} on:click={() => act('revert', [current.path])}>{$localizedText.agentReview.revert}</Button>
          <Button variant="primary" size="sm" data-testid="agent-review-keep" disabled={busy} on:click={() => act('keep', [current.path])}>{$localizedText.agentReview.keep}</Button>
        </div>
        {#if loading}
          <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.agentReview.loading}</p>
        {:else}
          <pre class="rounded-ui max-h-[52vh] flex-1 overflow-auto border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-secondary)_25%,transparent)] p-3 font-mono text-xs leading-relaxed" data-testid="agent-review-diff">{#each diff.split('\n') as line}<span class="block {lineClass(line)}">{line.startsWith('@@') ? '⋯' : line || ' '}</span>{/each}</pre>
        {/if}
      {/if}
      {#if error}<p class="mt-2 text-xs text-[var(--red-text)]">{error}</p>{/if}
    </div>
  </div>
  <div class="mt-6 flex flex-wrap items-center justify-end gap-x-6 gap-y-2 border-t border-[var(--border-subtle)] pt-4">
    <p class="mr-auto text-xs text-[var(--text-tertiary)]">{$localizedText.agentReview.footnote}</p>
    <Button variant="danger" size="sm" data-testid="agent-review-revert-all" disabled={busy} on:click={() => act('revert', changes.map((c) => c.path))}>{$localizedText.agentReview.revertAll}</Button>
    <Button variant="primary" size="sm" data-testid="agent-review-keep-all" disabled={busy} on:click={() => act('keep', changes.map((c) => c.path))}>{$localizedText.agentReview.keepAll}</Button>
  </div>
</ModalShell>
