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
  import { Button, FieldControl } from '@monos/ui';
  import { splitByConflicts } from '../lib/conflict-markers.js';
  import { renderMarkdownPreview } from '../lib/preview-html.js';
  import { locale, localizedText } from '../lib/strings.js';
  import { relativeDay } from '../lib/date-format.js';
  import { wordDiff } from '../lib/word-diff.js';
  import { describeProperties, frontmatterEnd, mergeProperties } from '../lib/conflict-properties.js';

  export let content = '';
  /**
   * Who wrote each side and when, from the server: `{ ours: { device, date }, theirs: { device, date } }`.
   * Either may be missing (markers left in a note with no conflict in git); the generic names stand in.
   */
  export let sides = null;
  /** Apply only once every part has a choice (a locked note cannot be saved half-resolved). */
  export let requireAll = false;

  // A side is named by its device, as Obsidian names a conflict copy: "Phone" means more than "the other version".
  $: oursName = sides?.ours?.device || $localizedText.editor.conflictOurs;
  $: theirsName = sides?.theirs?.device || $localizedText.editor.conflictTheirs;
  $: dayWords = { today: $localizedText.app.board.today, yesterday: $localizedText.app.board.yesterday };
  $: oursWhen = sides?.ours?.date ? relativeDay(sides.ours.date, $locale, dayWords) : '';
  $: theirsWhen = sides?.theirs?.date ? relativeDay(sides.theirs.date, $locale, dayWords) : '';

  const dispatch = createEventDispatcher();

  // Per-region choices accumulate until the user applies them.
  let choices = {};

  // The properties block at the top is YAML: its plain lines are not shown, and a part inside it is shown
  // as named values ("Tags: дом") rather than raw `tags: ["дом"]`.
  $: propsEnd = frontmatterEnd(content);
  $: propertyNames = $localizedText.editor.conflictPropertyNames;
  $: dateFormat = new Intl.DateTimeFormat($locale === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  $: describe = (text) => describeProperties(text, propertyNames, {
    yes: $localizedText.editor.conflictYes,
    no: $localizedText.editor.conflictNo,
    // A due date reads as a date: "20 Oct 2026", not 2026-10-20.
    date: (iso) => dateFormat.format(new Date(`${iso}T12:00:00`)),
  });
  $: segments = buildSegments(content, propsEnd, describe);

  function buildSegments(text, end, show) {
    const out = [];
    let cursor = 0;
    let conflictNo = 0;
    for (const segment of splitByConflicts(text)) {
      if (segment.type === 'text') {
        const start = cursor;
        cursor += segment.value.length;
        if (cursor <= end) continue;
        out.push({ ...segment, value: start < end ? segment.value.slice(end - start) : segment.value });
        continue;
      }
      const region = segment.value;
      cursor = region.end;
      const property = region.start < end;
      const shown = property
        ? { ours: show(region.ours), theirs: show(region.theirs), base: region.base ? show(region.base) : '' }
        : region;
      out.push({
        ...segment,
        conflictNo: conflictNo++,
        property,
        shown,
        // "Both" for properties merges by key; two values for one plain key cannot both stay.
        canKeepBoth: !property || mergeProperties(region.ours, region.theirs) !== null,
        // The words that differ between the two sides, marked in both columns.
        diff: wordDiff(shown.ours, shown.theirs),
      });
    }
    return out;
  }
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
  // (A part written by hand keeps neither side as it was: both dim.)

  // "Write my own": a part neither version gets right (the day from one, the time from the other) is written
  // by hand, starting from this device's text.
  let customTexts = {};
  function chooseCustom(segment) {
    if (customTexts[segment.conflictNo] === undefined) {
      customTexts = { ...customTexts, [segment.conflictNo]: segment.value.ours };
    }
    choose(segment.conflictNo, 'custom');
  }

  // One version for the whole note is applied at once: the simple case takes one click, not one per part.
  function keepWhole(choice) {
    const all = {};
    for (let i = 0; i < conflictCount; i += 1) all[i] = choice;
    dispatch('resolve', { choices: all, whole: true });
  }

  function apply() {
    const out = {};
    for (const [index, choice] of Object.entries(choices)) {
      out[index] = choice === 'custom' ? { custom: customTexts[index] ?? '' } : choice;
    }
    dispatch('resolve', { choices: out });
  }
</script>

<div class="space-y-4">
  {#if conflictCount > 0}
    <!-- The most common choice, so it reads as one: "Keep the whole note as on: PHONE  LAPTOP", the names
         underlined as links are, right next to the words they finish. -->
    <div class="rounded-ui flex flex-wrap items-baseline gap-x-5 gap-y-2 border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-secondary)_35%,transparent)] px-4 py-3">
      <p class="text-xs leading-relaxed text-[var(--text-secondary)]">
        {$localizedText.editor.conflictResolveHint}
      </p>
      <Button variant="quiet" size="sm" data-testid="conflict-whole-ours" on:click={() => keepWhole('ours')} class="text-ink underline decoration-line underline-offset-4">{oursName}</Button>
      <Button variant="quiet" size="sm" data-testid="conflict-whole-theirs" on:click={() => keepWhole('theirs')} class="text-[var(--blue)] underline decoration-[color-mix(in_srgb,var(--blue)_40%,transparent)] underline-offset-4">{theirsName}</Button>
      <p class="basis-full text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{$localizedText.editor.conflictWholeKept}</p>
    </div>
  {/if}

  {#each segments as segment, index (index)}
    {#if segment.type === 'text'}
      <div class="prose-plain">{@html renderMarkdownPreview(segment.value)}</div>
    {:else}
      <section class="rounded-ui border border-[color-mix(in_srgb,var(--red)_30%,transparent)]">
        <header class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--red)_8%,transparent)] px-4 py-2">
          <p class="text-[length:var(--text-whisper)] uppercase tracking-[0.16em] text-[var(--red-text)]">
            {segment.property ? $localizedText.editor.conflictPropertiesLabel : $localizedText.editor.conflictRegionLabel}
          </p>
          <div class="ml-auto flex flex-wrap items-center gap-3">
            <Button
              variant={choices[segment.conflictNo] === 'ours' ? 'outline' : 'ghost'}
              size="sm"
              aria-pressed={choices[segment.conflictNo] === 'ours'}
              on:click={() => choose(segment.conflictNo, 'ours')}
              class="normal-case"
              >
                {$localizedText.editor.conflictKeepSide(oursName)}
              </Button>
            <Button
              variant={choices[segment.conflictNo] === 'theirs' ? 'outline' : 'ghost'}
              size="sm"
              aria-pressed={choices[segment.conflictNo] === 'theirs'}
              on:click={() => choose(segment.conflictNo, 'theirs')}
              class="normal-case"
              >
                {$localizedText.editor.conflictKeepSide(theirsName)}
              </Button>
            {#if segment.canKeepBoth}
            <Button
              variant={choices[segment.conflictNo] === 'both' ? 'outline' : 'ghost'}
              size="sm"
              aria-pressed={choices[segment.conflictNo] === 'both'}
              on:click={() => choose(segment.conflictNo, 'both')}
              class="normal-case"
              >
                {$localizedText.editor.conflictKeepBoth}
              </Button>
            {/if}
            {#if !segment.property}
            <Button
              variant={choices[segment.conflictNo] === 'custom' ? 'outline' : 'ghost'}
              size="sm"
              aria-pressed={choices[segment.conflictNo] === 'custom'}
              on:click={() => chooseCustom(segment)}
              class="normal-case"
              >
                {$localizedText.editor.conflictWriteOwn}
              </Button>
            {/if}
          </div>
        </header>

        <div class="grid gap-px bg-[var(--border-subtle)]" class:sm:grid-cols-3={hasBase} class:sm:grid-cols-2={!hasBase}>
          {#if hasBase}
            <!-- On a phone the two versions come first; where they started from is context, read after. -->
            <div class="order-last bg-[var(--bg-primary)] p-4 sm:order-none">
              <p class="mb-2 text-[length:var(--text-whisper)] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                {$localizedText.editor.conflictBase}
              </p>
              <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-tertiary)]">{segment.shown.base || $localizedText.app.emptyValue}</pre>
            </div>
          {/if}

          <!-- The dropped side dims its text, not its cell: a see-through cell lets the grid lines show through. -->
          <div class="bg-[var(--bg-primary)] p-4" data-testid="conflict-ours-cell"><div class="transition-opacity" class:opacity-40={!keeps(choices[segment.conflictNo], 'ours')}>
            <p class="mb-2 text-[length:var(--text-whisper)] uppercase tracking-[0.14em] font-bold text-[var(--text-primary)]" data-testid="conflict-ours-label">
              {oursName}{#if sides?.ours?.device}<span class="font-normal normal-case tracking-normal text-[var(--text-tertiary)]">{' ('}{$localizedText.editor.conflictThisDevice}{')'}</span>{/if}
            </p>
            {#if oursWhen}<p class="-mt-1 mb-2 text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{oursWhen}</p>{/if}
            <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-primary)]">{#each segment.diff.ours as piece}{#if piece.changed}<mark class="rounded-ui bg-[color-mix(in_srgb,var(--yellow)_35%,transparent)] text-inherit">{piece.text}</mark>{:else}{piece.text}{/if}{:else}{$localizedText.app.emptyValue}{/each}</pre>
          </div></div>

          <!-- The dropped side dims its text, not its cell: a see-through cell lets the grid lines show through. -->
          <div class="bg-[var(--bg-primary)] p-4" data-testid="conflict-theirs-cell"><div class="transition-opacity" class:opacity-40={!keeps(choices[segment.conflictNo], 'theirs')}>
            <p class="mb-2 text-[length:var(--text-whisper)] uppercase tracking-[0.14em] font-bold text-[var(--blue)]" data-testid="conflict-theirs-label">
              {theirsName}
            </p>
            {#if theirsWhen}<p class="-mt-1 mb-2 text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{theirsWhen}</p>{/if}
            <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-primary)]">{#each segment.diff.theirs as piece}{#if piece.changed}<mark class="rounded-ui bg-[color-mix(in_srgb,var(--yellow)_35%,transparent)] text-inherit">{piece.text}</mark>{:else}{piece.text}{/if}{:else}{$localizedText.app.emptyValue}{/each}</pre>
          </div></div>
        </div>
        {#if choices[segment.conflictNo] === 'custom'}
          <div class="border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4">
            <label class="mb-2 block text-[length:var(--text-whisper)] uppercase tracking-[0.14em] text-[var(--text-secondary)]" for="conflict-own-{segment.conflictNo}">
              {$localizedText.editor.conflictOwnLabel}
            </label>
            <FieldControl
              bare
              as="textarea"
              id="conflict-own-{segment.conflictNo}"
              data-testid="conflict-own-text"
              bind:value={customTexts[segment.conflictNo]}
              rows={Math.min(12, Math.max(3, String(customTexts[segment.conflictNo] || '').split('\n').length + 1))}
              class="w-full resize-y rounded-ui border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-secondary)_35%,transparent)] p-3 font-mono text-xs leading-relaxed text-[var(--text-primary)] outline-none focus:border-[var(--text-tertiary)]"
            />
          </div>
        {/if}
      </section>
    {/if}
  {/each}

  {#if conflictCount > 0}
    <!-- Apply sits after the last part too: the choices are made down here, not in the bar above. -->
    <div class="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 pt-1" data-testid="conflict-apply-bar">
      <p class="mr-auto text-xs text-[var(--text-secondary)]">{$localizedText.editor.conflictChosen(pending, conflictCount)}</p>
      <Button
        variant="primary"
        size="sm"
        on:click={apply}
        disabled={pending === 0 || (requireAll && pending < conflictCount)}
      >
        {$localizedText.editor.conflictApply}
      </Button>
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
