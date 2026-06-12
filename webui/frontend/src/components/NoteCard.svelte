<script>
  import { createEventDispatcher } from 'svelte';
  import { highlightExcerpt, searchSnippet } from '../lib/search.js';
  import { localizedText } from '../lib/strings.js';

  export let note;
  export let query = '';
  export let highlight = false;
  export let compact = false;
  export let draggable = true;

  const dispatch = createEventDispatcher();

  function visiblePath(path) {
    return path?.startsWith('notes/') ? path.slice(6) : path;
  }

  function excerptText(value) {
    const text = String(value || '')
      .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/[#*_`>~-]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return /^last opened:/i.test(text) ? '' : text;
  }

  function formatOpenedDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function handleContextMenu(event) {
    event.preventDefault();
    dispatch('context', { note, x: event.clientX, y: event.clientY });
  }

  $: accent = note?.color || 'var(--border-subtle)';
  $: tags = Array.isArray(note?.tags) ? note.tags : [];
  $: compactTags = tags.slice(0, 2);
  $: visibleTags = compact ? compactTags : tags.slice(0, 3);
  $: hiddenTagCount = Math.max(0, tags.length - visibleTags.length);
  $: excerpt = excerptText(note?.excerpt);
  $: visibleExcerpt = highlight && query ? searchSnippet(excerpt, query, compact ? 56 : 180) : excerpt;
  $: openedDate = formatOpenedDate(note?.lastOpened);
  $: cardStyle = `--note-accent: ${accent}; --note-tint: color-mix(in srgb, ${accent} 13%, transparent); --note-glow: color-mix(in srgb, ${accent} 18%, transparent);`;
  $: cardClass = compact
    ? 'note-card group relative flex h-36 w-full flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-3 text-left shadow-sm shadow-black/[0.03] transition hover:border-[var(--text-secondary)]/40'
    : 'note-card group relative flex h-48 w-full flex-col overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-4 text-left shadow-sm shadow-black/[0.03] transition hover:border-[var(--text-secondary)]/40 sm:px-5 sm:hover:-translate-y-0.5 sm:hover:shadow-xl sm:hover:shadow-black/10';
</script>

<button
  type="button"
  class={cardClass}
  style={cardStyle}
  {draggable}
  on:click={() => dispatch('open', note)}
  on:contextmenu={handleContextMenu}
  on:dragstart={(event) => dispatch('dragStart', { note, event })}
  on:dragover={(event) => { event.preventDefault(); dispatch('dragOver', { note, event }); }}
  on:drop={(event) => dispatch('drop', { note, event })}
>
  <span class="pointer-events-none absolute inset-0 bg-[var(--note-tint)] opacity-70 transition group-hover:opacity-100"></span>
  <span class="pointer-events-none absolute -right-12 -top-16 h-32 w-32 rounded-full bg-[var(--note-glow)] blur-2xl"></span>

  <span class="relative mb-2 block shrink-0 truncate text-[9px] uppercase tracking-[0.14em] text-[var(--text-secondary)]/70 {compact ? '' : 'sm:mb-3 sm:text-[10px] sm:tracking-[0.16em]'}">
    {visiblePath(note?.path)}
  </span>
  <span class="relative block shrink-0 font-serif {compact ? 'line-clamp-2 text-base' : 'truncate text-lg sm:text-xl'} font-medium leading-tight tracking-tight break-anywhere">
    {note?.name || ''}
  </span>

  <span class="relative mt-2 block shrink-0 {compact ? 'compact-excerpt text-xs leading-relaxed' : 'desktop-excerpt text-sm leading-relaxed'} text-[var(--text-secondary)] break-anywhere">
    {#if visibleExcerpt}
      {#if highlight && query}
        {@html highlightExcerpt(visibleExcerpt, query)}
      {:else}
        {visibleExcerpt}
      {/if}
    {:else}
      <span class="italic text-[var(--text-secondary)]/65">{$localizedText.app.board.emptyNote}</span>
    {/if}
  </span>

  {#if compact && visibleTags.length > 0}
    <span class="relative mt-auto flex min-w-0 shrink-0 gap-1.5 pt-2">
      {#each visibleTags as tag}
        <span class="min-w-0 truncate rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)]/45 px-2 py-0.5 text-[10px] leading-tight text-[var(--text-secondary)]">
          #{tag}
        </span>
      {/each}
    </span>
  {:else if !compact}
    <span class="relative mt-auto flex min-w-0 shrink-0 flex-col gap-1.5 pt-3">
      <span class="flex h-6 min-w-0 flex-wrap gap-1.5 overflow-hidden">
      {#if visibleTags.length > 0}
        {#each visibleTags as tag}
          <span class="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)]/45 px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
            #{tag}
          </span>
        {/each}
        {#if hiddenTagCount > 0}
          <span class="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)]/45 px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
            +{hiddenTagCount}
          </span>
        {/if}
      {/if}
      </span>
      <span class="h-4 truncate text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]/60">
      {#if openedDate || note?.category}
        {#if openedDate}
          {$localizedText.app.board.opened} {openedDate}
        {:else}
          {note.category}
        {/if}
      {/if}
      </span>
    </span>
  {/if}
</button>

<style>
  .break-anywhere {
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .compact-excerpt {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  .desktop-excerpt {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    height: 3.25em;
    overflow: hidden;
  }
</style>
