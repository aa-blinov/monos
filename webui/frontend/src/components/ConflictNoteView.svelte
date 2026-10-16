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
  import { locale, localizedText } from '../lib/strings.js';
  import { relativeDay } from '../lib/date-format.js';
  import { wordDiff } from '../lib/word-diff.js';

  export let content = '';
  /**
   * Who wrote each side and when, from the server: `{ ours: { device, date }, theirs: { device, date } }`.
   * Either may be missing (markers left in a note with no conflict in git); the generic names stand in.
   */
  export let sides = null;

  // A side is named by its device, as Obsidian names a conflict copy: "Phone" means more than "the other version".
  $: oursName = sides?.ours?.device || $localizedText.editor.conflictOurs;
  $: theirsName = sides?.theirs?.device || $localizedText.editor.conflictTheirs;
  $: dayWords = { today: $localizedText.app.board.today, yesterday: $localizedText.app.board.yesterday };
  $: oursWhen = sides?.ours?.date ? relativeDay(sides.ours.date, $locale, dayWords) : '';
  $: theirsWhen = sides?.theirs?.date ? relativeDay(sides.theirs.date, $locale, dayWords) : '';

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
    // The words that differ between the two sides, marked in both columns.
    diff: segment.type === 'conflict' ? wordDiff(segment.value.ours, segment.value.theirs) : null,
  }));
  $: conflictCount = segments.filter((segment) => segment.type === 'conflict').length;
  $: pending = Object.keys(choices).length;
  $: hasBase = segments.some((s) => s.type === 'conflict' && s.value.base);

  // Picking a side records it; picking the same side again takes the choice back. (The old version
  // recorded the choice and then removed it in the next line, so a single part could never be applied.)
  function choose(index, choice) {
    if (choices[index] === choice) {
      const next = { ...choices };
      delete next[index];
      choices = next;
      return;
    }
    choices = { ...choices, [index]: choice };
  }

  /** Whether a side's text stays after the choice made for this part. */
  const keeps = (choice, side) => !choice || choice === side || choice === 'both';

  // One version for the whole note is applied at once: the simple case takes one click, not one per part.
  function keepWhole(choice) {
    const all = {};
    for (let i = 0; i < conflictCount; i += 1) all[i] = choice;
    dispatch('resolve', { choices: all, whole: true });
  }

  function apply() {
    dispatch('resolve', { choices });
  }
</script>

<div class="space-y-4">
  {#if conflictCount > 0}
    <div class="rounded-ui flex flex-wrap items-center gap-x-6 gap-y-2 border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/35 px-4 py-3">
      <p class="mr-auto text-xs leading-relaxed text-[var(--text-secondary)]">
        {$localizedText.editor.conflictResolveHint}
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="conflict-whole-ours"
          on:click={() => keepWhole('ours')}
          class="text-xs font-bold text-[var(--text-primary)] transition hover:opacity-70"
        >
          {oursName}
        </button>
        <button
          type="button"
          data-testid="conflict-whole-theirs"
          on:click={() => keepWhole('theirs')}
          class="text-xs font-bold text-[var(--blue)] transition hover:opacity-70"
        >
          {theirsName}
        </button>
      </div>
      <p class="basis-full text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{$localizedText.editor.conflictWholeKept}</p>
    </div>
  {/if}

  {#each segments as segment, index (index)}
    {#if segment.type === 'text'}
      <div class="prose-plain">{@html renderMarkdownPreview(segment.value)}</div>
    {:else}
      <section class="rounded-ui border border-[color-mix(in_srgb,var(--red)_30%,transparent)]">
        <header class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--red)_8%,transparent)] px-4 py-2">
          <p class="text-[length:var(--text-whisper)] uppercase tracking-[0.16em] text-[var(--red)]">
            {$localizedText.editor.conflictRegionLabel}
          </p>
          <div class="ml-auto flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-pressed={choices[segment.conflictNo] === 'ours'}
              on:click={() => choose(segment.conflictNo, 'ours')}
              class="rounded-ui px-2 py-1 text-[length:var(--text-whisper)] uppercase tracking-[0.14em] transition {choices[segment.conflictNo] === 'ours' ? 'bg-[var(--bg-secondary)] ' : ''}{choices[segment.conflictNo] === 'ours' ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}"
            >
              {$localizedText.editor.conflictKeepSide(oursName)}
            </button>
            <button
              type="button"
              aria-pressed={choices[segment.conflictNo] === 'theirs'}
              on:click={() => choose(segment.conflictNo, 'theirs')}
              class="rounded-ui px-2 py-1 text-[length:var(--text-whisper)] uppercase tracking-[0.14em] transition {choices[segment.conflictNo] === 'theirs' ? 'bg-[var(--bg-secondary)] ' : ''}{choices[segment.conflictNo] === 'theirs' ? 'font-bold text-[var(--blue)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}"
            >
              {$localizedText.editor.conflictKeepSide(theirsName)}
            </button>
            <button
              type="button"
              aria-pressed={choices[segment.conflictNo] === 'both'}
              on:click={() => choose(segment.conflictNo, 'both')}
              class="rounded-ui px-2 py-1 text-[length:var(--text-whisper)] uppercase tracking-[0.14em] transition {choices[segment.conflictNo] === 'both' ? 'bg-[var(--bg-secondary)] ' : ''}{choices[segment.conflictNo] === 'both' ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}"
            >
              {$localizedText.editor.conflictKeepBoth}
            </button>
          </div>
        </header>

        <div class="grid gap-px bg-[var(--border-subtle)]" class:sm:grid-cols-3={hasBase} class:sm:grid-cols-2={!hasBase}>
          {#if hasBase}
            <!-- On a phone the two versions come first; where they started from is context, read after. -->
            <div class="order-last bg-[var(--bg-primary)] p-4 sm:order-none">
              <p class="mb-2 text-[length:var(--text-whisper)] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {$localizedText.editor.conflictBase}
              </p>
              <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-tertiary)]">{segment.value.base || '—'}</pre>
            </div>
          {/if}

          <!-- The dropped side dims its text, not its cell: a see-through cell lets the grid lines show through. -->
          <div class="bg-[var(--bg-primary)] p-4" data-testid="conflict-ours-cell"><div class="transition-opacity" class:opacity-40={!keeps(choices[segment.conflictNo], 'ours')}>
            <p class="mb-2 text-[length:var(--text-whisper)] uppercase tracking-[0.14em] font-bold text-[var(--text-primary)]" data-testid="conflict-ours-label">
              {oursName}{#if sides?.ours?.device}<span class="font-normal normal-case tracking-normal text-[var(--text-tertiary)]">{' — '}{$localizedText.editor.conflictThisDevice}</span>{/if}
            </p>
            {#if oursWhen}<p class="-mt-1 mb-2 text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{oursWhen}</p>{/if}
            <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-primary)]">{#each segment.diff.ours as piece}{#if piece.changed}<mark class="rounded-ui bg-[color-mix(in_srgb,var(--yellow)_35%,transparent)] text-inherit">{piece.text}</mark>{:else}{piece.text}{/if}{:else}—{/each}</pre>
          </div></div>

          <!-- The dropped side dims its text, not its cell: a see-through cell lets the grid lines show through. -->
          <div class="bg-[var(--bg-primary)] p-4" data-testid="conflict-theirs-cell"><div class="transition-opacity" class:opacity-40={!keeps(choices[segment.conflictNo], 'theirs')}>
            <p class="mb-2 text-[length:var(--text-whisper)] uppercase tracking-[0.14em] font-bold text-[var(--blue)]" data-testid="conflict-theirs-label">
              {theirsName}
            </p>
            {#if theirsWhen}<p class="-mt-1 mb-2 text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{theirsWhen}</p>{/if}
            <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-primary)]">{#each segment.diff.theirs as piece}{#if piece.changed}<mark class="rounded-ui bg-[color-mix(in_srgb,var(--yellow)_35%,transparent)] text-inherit">{piece.text}</mark>{:else}{piece.text}{/if}{:else}—{/each}</pre>
          </div></div>
        </div>
      </section>
    {/if}
  {/each}

  {#if conflictCount > 0}
    <!-- Apply sits after the last part too: the choices are made down here, not in the bar above. -->
    <div class="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 pt-1" data-testid="conflict-apply-bar">
      <p class="mr-auto text-xs text-[var(--text-secondary)]">{$localizedText.editor.conflictChosen(pending, conflictCount)}</p>
      <button
        type="button"
        on:click={apply}
        disabled={pending === 0}
        class="text-xs uppercase tracking-widest font-bold text-[var(--text-primary)] transition enabled:hover:opacity-70 disabled:opacity-30"
      >
        {$localizedText.editor.conflictApply}
      </button>
    </div>
  {/if}
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
  .prose-plain :global(ul) { list-style: disc; }
  .prose-plain :global(ol) { list-style: decimal; }
  .prose-plain :global(li) { margin-bottom: 0.2rem; line-height: 1.6; }
  .prose-plain :global(code) { background: var(--bg-secondary); padding: 0.05em 0.3em; border-radius: var(--radius); font-size: 0.9em; }
  .prose-plain :global(pre) { background: var(--bg-secondary); padding: 0.8rem; border-radius: var(--radius); overflow-x: auto; margin: 0 0 0.7rem; }
  .prose-plain :global(blockquote) { border-left: 2px solid var(--border-subtle); margin: 0 0 0.7rem; padding-left: 0.9rem; color: var(--text-secondary); }
  .prose-plain :global(a) { color: var(--blue); }
</style>
