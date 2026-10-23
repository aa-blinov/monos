<script>
  /**
   * A locked note that changed on two devices. Its text is a sealed envelope, so git did not merge it:
   * the file is still this device's sealed version and both versions wait in git. Without the passphrase
   * one of them can be kept whole. With it, both are opened in memory and merged like any note — the parts
   * changed on one side are taken, the rest is chosen part by part — and the result is sealed again before
   * it is written. Nothing is written in plain text at any point.
   */
  import { createEventDispatcher } from 'svelte';
  import { Button } from '@monos/ui';
  import { Lock } from 'lucide-svelte';
  import ConflictNoteView from './ConflictNoteView.svelte';
  import { mergeThreeWay } from '../lib/three-way-merge.js';
  import { resolveRegion } from '../lib/conflict-markers.js';
  import { renderMarkdownPreview } from '../lib/preview-html.js';
  import { splitFrontmatter } from '../lib/frontmatter.js';
  import { formFieldClass } from '../lib/form-field.js';
  import { localizedText } from '../lib/strings.js';

  export let filePath = '';
  export let sides = null;
  export let busy = false;

  const dispatch = createEventDispatcher();
  let passphrase = '';
  let opening = false;
  let error = '';
  let opened = null;

  $: text = $localizedText.editor;
  $: oursName = (opened?.sides || sides)?.ours?.device || text.conflictOurs;
  $: theirsName = (opened?.sides || sides)?.theirs?.device || text.conflictTheirs;
  $: merged = opened && !opened.unreadable.length
    ? mergeThreeWay(opened.base, opened.ours, opened.theirs, { ours: oursName, theirs: theirsName })
    : null;

  async function openVersions() {
    if (!passphrase || opening) return;
    opening = true;
    error = '';
    try {
      const response = await fetch('/api/git/locked-conflict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, passphrase }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 403) throw new Error($localizedText.lock.wrongPassphrase);
      if (!response.ok) throw new Error(body.detail || `HTTP ${response.status}`);
      opened = body;
      passphrase = '';
    } catch (failure) {
      error = failure?.message || String(failure);
    } finally {
      opening = false;
    }
  }

  // The choices for the parts both devices changed, applied to the merged text, from the last part back.
  function applyChoices(event) {
    let next = merged.text;
    const ordered = Object.entries(event.detail?.choices || {}).map(([i, c]) => [Number(i), c]).sort((a, b) => b[0] - a[0]);
    for (const [index, choice] of ordered) next = resolveRegion(next, index, choice);
    dispatch('resolveText', { content: next, whole: Boolean(event.detail?.whole) });
  }
</script>

<div class="space-y-4" data-testid="locked-conflict">
  <div class="rounded-ui border border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-3">
    <p class="flex items-center gap-2 text-sm font-bold text-[var(--red)]">
      <Lock size="14" strokeWidth="1.7" aria-hidden="true" />{text.lockedConflictTitle}
    </p>
    <p class="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{text.lockedConflictHint}</p>
  </div>

  {#if !opened}
    <form class="space-y-3" on:submit|preventDefault={openVersions}>
      <label for="locked-conflict-pass" class="block text-xs text-[var(--text-secondary)]">{text.lockedConflictPassLabel}</label>
      <div class="flex flex-wrap items-center gap-3">
        <input
          id="locked-conflict-pass"
          type="password"
          autocomplete="off"
          bind:value={passphrase}
          disabled={opening || busy}
          class="min-w-0 flex-1 {formFieldClass()}"
        />
        <Button type="submit" variant="primary" size="sm" data-testid="locked-conflict-open" disabled={!passphrase || opening || busy}>
          {text.lockedConflictOpen}
        </Button>
      </div>
      {#if error}<p role="alert" class="text-xs text-[var(--red)]">{error}</p>{/if}
    </form>
  {/if}

  {#if !opened || opened.unreadable.length}
    <div class="rounded-ui flex flex-wrap items-baseline gap-x-5 gap-y-2 border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-secondary)_35%,transparent)] px-4 py-3">
      {#if opened?.unreadable.length}
        <p class="basis-full text-xs leading-relaxed text-[var(--text-secondary)]" data-testid="locked-conflict-unreadable">
          {text.lockedConflictUnreadable(opened.unreadable.includes('theirs') ? theirsName : oursName)}
        </p>
      {/if}
      <p class="text-xs text-[var(--text-secondary)]">{text.lockedConflictKeepWhole}</p>
      <Button variant="quiet" size="sm" data-testid="locked-keep-ours" disabled={busy} on:click={() => dispatch('keep', { side: 'ours' })} class="underline decoration-line underline-offset-4">{oursName}</Button>
      <Button variant="quiet" size="sm" data-testid="locked-keep-theirs" disabled={busy} on:click={() => dispatch('keep', { side: 'theirs' })} class="text-[var(--blue)] underline decoration-[color-mix(in_srgb,var(--blue)_40%,transparent)] underline-offset-4">{theirsName}</Button>
      <p class="basis-full text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{text.conflictWholeKept}</p>
    </div>
  {:else if merged && merged.conflicts === 0}
    <!-- The two devices changed different parts: both edits fit together, nothing to choose. -->
    <div class="rounded-ui flex flex-wrap items-center gap-x-5 gap-y-2 border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-secondary)_35%,transparent)] px-4 py-3">
      <p class="mr-auto text-xs text-[var(--text-secondary)]">{text.lockedConflictMergeable}</p>
      <Button variant="primary" size="sm" data-testid="locked-conflict-merge" disabled={busy} on:click={() => dispatch('resolveText', { content: merged.text })}>{text.lockedConflictMerge}</Button>
    </div>
    <div class="prose-plain">{@html renderMarkdownPreview(splitFrontmatter(merged.text).body)}</div>
  {:else if merged}
    <ConflictNoteView content={merged.text} sides={opened.sides} requireAll={true} on:resolve={applyChoices} />
  {/if}
</div>

<style>
  .prose-plain :global(p) { margin: 0 0 0.7rem; line-height: 1.65; }
  .prose-plain :global(ul) { list-style: disc; margin: 0 0 0.7rem; padding-left: 1.4em; }
  .prose-plain :global(ol) { list-style: decimal; margin: 0 0 0.7rem; padding-left: 1.4em; }
  .prose-plain :global(h1),
  .prose-plain :global(h2) { font-weight: 700; margin: 0.8rem 0 0.4rem; }
</style>
