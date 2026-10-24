<script>
  /**
   * One device deleted the note and the other changed it. Git has no text to merge then — nothing in the
   * note carries markers — so without this the note looked ordinary while the sync stayed blocked on it.
   * The choice is the whole note: keep it (with the changes) or let the deletion stand. Either way the
   * changed text stays in the history and the conflict archive.
   */
  import { createEventDispatcher } from 'svelte';
  import { Button } from '@monos/ui';
  import { renderMarkdownPreview } from '../lib/preview-html.js';
  import { splitFrontmatter } from '../lib/frontmatter.js';
  import { localizedText } from '../lib/strings.js';

  export let content = '';
  /** True when this device deleted the note (the text shown came from the other device). */
  export let deletedHere = false;
  /** The other device's name, when known. */
  export let otherDevice = '';
  export let busy = false;

  const dispatch = createEventDispatcher();
  $: text = $localizedText.editor;
  $: keepSide = deletedHere ? 'theirs' : 'ours';
  $: deleteSide = deletedHere ? 'ours' : 'theirs';
</script>

<div class="space-y-4" data-testid="conflict-deleted">
  <div class="rounded-ui border border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-3">
    <p class="text-sm font-bold text-[var(--red-text)]">
      {deletedHere ? text.conflictDeletedHereTitle(otherDevice) : text.conflictDeletedThereTitle(otherDevice)}
    </p>
    <p class="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{text.conflictDeletedHint}</p>
    <div class="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <Button variant="ghost" size="sm"
        type="button"
        data-testid="conflict-keep-note"
        disabled={busy}
        on:click={() => dispatch('keep', { side: keepSide })}
        class="text-xs font-bold uppercase tracking-widest text-[var(--text-primary)] transition enabled:hover:opacity-70 disabled:opacity-30"
      >
        {deletedHere ? text.conflictRestoreNote : text.conflictKeepNote}
      </Button>
      <Button variant="danger" size="sm"
        type="button"
        data-testid="conflict-delete-note"
        disabled={busy}
        on:click={() => dispatch('keep', { side: deleteSide })}
        class="text-xs font-bold uppercase tracking-widest text-[var(--red-text)] transition enabled:hover:opacity-70 disabled:opacity-30"
      >
        {text.conflictDeleteNote}
      </Button>
    </div>
  </div>
  <p class="text-[length:var(--text-whisper)] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
    {deletedHere ? text.conflictDeletedHereText(otherDevice) : text.conflictDeletedThereText}
  </p>
  <div class="prose-plain">{@html renderMarkdownPreview(splitFrontmatter(content).body)}</div>
</div>

<style>
  .prose-plain :global(h1) { font-size: 1.15rem; font-weight: 700; line-height: 1.3; margin: 0 0 0.6rem; }
  .prose-plain :global(h2) { font-size: 1.05rem; font-weight: 700; line-height: 1.3; margin: 0.9rem 0 0.4rem; }
  .prose-plain :global(p) { margin: 0 0 0.7rem; line-height: 1.65; }
  .prose-plain :global(ul),
  .prose-plain :global(ol) { margin: 0 0 0.7rem; padding-left: 1.4em; }
  .prose-plain :global(ul) { list-style: disc; }
  .prose-plain :global(ol) { list-style: decimal; }
  .prose-plain :global(li) { margin-bottom: 0.2rem; line-height: 1.6; }
  .prose-plain :global(a) { color: var(--blue); }
</style>
