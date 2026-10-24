<script>
  /**
   * Where the GitHub connection stands, beside the button that makes it: working (with the time spent), done,
   * done with conflicts, failed — or, at rest, what the notes are connected to. The button alone showed
   * "Connecting…" for a moment and went back, so a connection that had worked looked like nothing had happened.
   */
  import { localizedText } from '../lib/strings.js';

  /** @type {'idle'|'connecting'|'done'|'conflicts'|'error'} */
  export let phase = 'idle';
  export let repo = '';
  export let branch = '';
  export let seconds = 0;
  export let message = '';
  // What git reports for the folder now, for the resting state.
  export let connectedRepo = '';
  export let connectedBranch = '';

  $: text = $localizedText.settings;
</script>

<div class="min-w-0 flex-1 text-xs leading-relaxed" data-testid="connect-status" data-phase={phase}>
  {#if phase === 'connecting'}
    <p class="flex items-center gap-2 text-[var(--text-primary)]" role="status">
      <span class="h-2 w-2 shrink-0 rounded-full bg-[var(--yellow)] motion-safe:animate-pulse" aria-hidden="true"></span>
      <span class="truncate">{text.connectingTo(repo)}</span>
      <span class="shrink-0 tabular-nums text-[var(--text-tertiary)]">{text.connectingElapsed(seconds)}</span>
    </p>
    <p class="mt-1 text-[var(--text-tertiary)]">{text.connectingHint}</p>
  {:else if phase === 'error'}
    <p class="text-[var(--red-text)]" role="alert">{message || text.connectFailed}</p>
  {:else if phase === 'conflicts'}
    <p class="flex items-start gap-2 text-[var(--text-primary)]" role="status">
      <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--red)]" aria-hidden="true"></span>
      <span>{text.connectedConflicts}</span>
    </p>
  {:else if phase === 'done'}
    <p class="flex items-center gap-2 text-[var(--text-primary)]" role="status">
      <span class="h-2 w-2 shrink-0 rounded-full bg-[var(--green)]" aria-hidden="true"></span>
      <span class="truncate">{text.connectedTo(repo, branch)}</span>
    </p>
    <p class="mt-1 text-[var(--text-tertiary)]">{text.connectedDone}</p>
  {:else if connectedRepo}
    <p class="flex items-center gap-2 text-[var(--text-secondary)]">
      <span class="h-2 w-2 shrink-0 rounded-full bg-[var(--green)]" aria-hidden="true"></span>
      <span class="truncate">{text.connectedTo(connectedRepo, connectedBranch)}</span>
    </p>
  {/if}
</div>
