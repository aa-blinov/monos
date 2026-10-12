<script>
  /**
   * A note that carries unresolved merge markers, shown in place.
   *
   * The normal editor cannot represent a conflict: `marked` turns the `=======`
   * separator into a setext underline, so the first marker and the line after
   * it collapse into a heading, and the closing marker becomes a run of nested
   * blockquotes. Every marker is gone and the structure is fiction.
   *
   * So a conflicted note never reaches the editor. The text around each conflict
   * is ordinary Markdown and is rendered normally — only the regions themselves
   * are shown raw, which is the one representation that stays honest. Cutting
   * the regions out and showing them on their own would lose the surrounding
   * paragraph that gives a conflicting line its meaning, and the note would look
   * emptied rather than conflicted.
   *
   * Resolution happens here too: each region keeps the side you pick, and the
   * choices are composed in place so one region can take "ours" while the next
   * takes "both".
   */
  import { createEventDispatcher } from 'svelte';
  import { splitByConflicts } from '../lib/conflict-markers.js';
  import { renderMarkdownPreview } from '../lib/preview-html.js';
  import { localizedText } from '../lib/strings.js';

  export let content = '';

  const dispatch = createEventDispatcher();

  // Per-region choices accumulate until the user applies them.
  let choices = {};

  $: segments = splitByConflicts(content).map((segment, at) => ({
    ...segment,
    // Which conflict number this is, so per-region choices map to the region
    // index that resolveRegion() expects.
    conflictNo: segment.type === 'conflict'
      ? splitByConflicts(content).slice(0, at).filter((x) => x.type === 'conflict').length
      : -1,
  }));
  $: conflictCount = segments.filter((segment) => segment.type === 'conflict').length;
  $: pending = Object.keys(choices).length;
  $: hasBase = segments.some((s) => s.type === 'conflict' && s.value.base);

  function choose(index, choice) {
    choices = { ...choices, [index]: choice };
    // Re-derive from the untouched source so switching a choice replaces rather
    // than stacks.
    if (choices[index] === choice) {
      const next = { ...choices };
      delete next[index];
      choices = next;
    }
  }

  function applyAll(choice) {
    const next = {};
    for (let i = 0; i < conflictCount; i += 1) next[i] = choice;
    choices = next;
  }

  function apply() {
    dispatch('resolve', { choices });
  }
</script>

<div class="space-y-4">
  {#if conflictCount > 0}
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2 border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/35 px-4 py-3">
      <p class="mr-auto text-xs leading-relaxed text-[var(--text-secondary)]">
        {$localizedText.editor.conflictResolveHint}
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          on:click={() => applyAll('ours')}
          class="text-xs uppercase tracking-widest font-bold transition hover:opacity-70"
        >
          {$localizedText.editor.conflictKeepAllOurs}
        </button>
        <button
          type="button"
          on:click={() => applyAll('theirs')}
          class="text-xs uppercase tracking-widest font-bold transition hover:opacity-70"
        >
          {$localizedText.editor.conflictKeepAllTheirs}
        </button>
        <button
          type="button"
          on:click={apply}
          disabled={pending === 0}
          class="text-xs uppercase tracking-widest font-bold text-[var(--text-primary)] transition enabled:hover:opacity-70 disabled:opacity-30"
        >
          {$localizedText.editor.conflictApply}
        </button>
      </div>
    </div>
  {/if}

  {#each segments as segment, index (index)}
    {#if segment.type === 'text'}
      <div class="prose-plain">{@html renderMarkdownPreview(segment.value)}</div>
    {:else}
      <section class="border border-[color-mix(in_srgb,var(--red)_30%,transparent)]">
        <header class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--red)_8%,transparent)] px-4 py-2">
          <p class="text-[length:var(--text-whisper)] uppercase tracking-[0.16em] text-[var(--red)]">
            {$localizedText.editor.conflictRegionLabel}
          </p>
          <div class="ml-auto flex flex-wrap items-center gap-3">
            <button
              type="button"
              on:click={() => choose(segment.conflictNo, 'ours')}
              class="text-[length:var(--text-whisper)] uppercase tracking-[0.14em] transition {choices[segment.conflictNo] === 'ours' ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}"
            >
              {$localizedText.editor.conflictKeepOurs}
            </button>
            <button
              type="button"
              on:click={() => choose(segment.conflictNo, 'theirs')}
              class="text-[length:var(--text-whisper)] uppercase tracking-[0.14em] transition {choices[segment.conflictNo] === 'theirs' ? 'font-bold text-[var(--blue)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}"
            >
              {$localizedText.editor.conflictKeepTheirs}
            </button>
            <button
              type="button"
              on:click={() => choose(segment.conflictNo, 'both')}
              class="text-[length:var(--text-whisper)] uppercase tracking-[0.14em] transition {choices[segment.conflictNo] === 'both' ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}"
            >
              {$localizedText.editor.conflictKeepBoth}
            </button>
          </div>
        </header>

        <div class="grid gap-px bg-[var(--border-subtle)]" class:sm:grid-cols-3={hasBase} class:sm:grid-cols-2={!hasBase}>
          {#if hasBase}
            <div class="bg-[var(--bg-primary)] p-4">
              <p class="mb-2 text-[length:var(--text-whisper)] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {$localizedText.editor.conflictBase}
              </p>
              <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-tertiary)]">{segment.value.base || '—'}</pre>
            </div>
          {/if}

          <div class="bg-[var(--bg-primary)] p-4" class:opacity-50={choices[segment.conflictNo] && choices[segment.conflictNo] !== 'ours'}>
            <p class="mb-2 text-[length:var(--text-whisper)] uppercase tracking-[0.14em] font-bold text-[var(--text-primary)]">
              {$localizedText.editor.conflictOurs}
            </p>
            <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-primary)]">{segment.value.ours || '—'}</pre>
          </div>

          <div class="bg-[var(--bg-primary)] p-4" class:opacity-50={choices[segment.conflictNo] && choices[segment.conflictNo] !== 'theirs'}>
            <p class="mb-2 text-[length:var(--text-whisper)] uppercase tracking-[0.14em] font-bold text-[var(--blue)]">
              {$localizedText.editor.conflictTheirs}
            </p>
            <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-primary)]">{segment.value.theirs || '—'}</pre>
          </div>
        </div>
      </section>
    {/if}
  {/each}
</div>

<style>
  /* The surrounding text is ordinary Markdown, rendered by the same safe
     pipeline the preview uses, so it keeps its headings and lists. */
  .prose-plain :global(h1) { font-size: 1.15rem; font-weight: 700; line-height: 1.3; margin: 0 0 0.6rem; }
  .prose-plain :global(h2) { font-size: 1.05rem; font-weight: 700; line-height: 1.3; margin: 0.9rem 0 0.4rem; }
  .prose-plain :global(h3) { font-size: 0.95rem; font-weight: 700; margin: 0.8rem 0 0.3rem; }
  .prose-plain :global(p) { margin: 0 0 0.7rem; line-height: 1.65; }
  .prose-plain :global(ul),
  .prose-plain :global(ol) { margin: 0 0 0.7rem; padding-left: 1.4em; }
  .prose-plain :global(li) { margin-bottom: 0.2rem; line-height: 1.6; }
  .prose-plain :global(code) { background: var(--bg-secondary); padding: 0.05em 0.3em; border-radius: 2px; font-size: 0.9em; }
  .prose-plain :global(pre) { background: var(--bg-secondary); padding: 0.8rem; border-radius: 6px; overflow-x: auto; margin: 0 0 0.7rem; }
  .prose-plain :global(blockquote) { border-left: 2px solid var(--border-subtle); margin: 0 0 0.7rem; padding-left: 0.9rem; color: var(--text-secondary); }
  .prose-plain :global(a) { color: var(--blue); }
</style>
