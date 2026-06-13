<script>
  import { createEventDispatcher } from 'svelte';
  import { highlightExcerpt, searchSnippet } from '../lib/search.js';
  import { locale, localizedText } from '../lib/strings.js';

  export let note;
  export let query = '';
  export let highlight = false;
  export let compact = false;
  export let draggable = true;

  const dispatch = createEventDispatcher();

  function visiblePath(path) {
    const cleanPath = String(path || '').replace(/^notes\/?/, '');
    const parts = cleanPath.split('/').filter(Boolean);
    if (parts.length <= 1) return '';
    return parts.slice(0, -1).join('/');
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

  function dateLocale(currentLocale = 'en') {
    if (currentLocale === 'ru') return 'ru-RU';
    if (currentLocale === 'en') return 'en-US';
    return currentLocale || 'en-US';
  }

  function formatOpenedDate(value, currentLocale = 'en', short = false) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    const options = short
      ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
      : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Intl.DateTimeFormat(dateLocale(currentLocale), options).format(date);
  }

  function openedDateLabel(value, currentLocale = 'en', short = false) {
    const formattedDate = formatOpenedDate(value, currentLocale, short);
    if (!formattedDate) return '';
    return short ? formattedDate : `${$localizedText.app.board.opened} ${formattedDate}`;
  }

  function cardDateTime(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
  }

  function cardDateTitle(value, currentLocale = 'en') {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(dateLocale(currentLocale), {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
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
  $: pathLabel = visiblePath(note?.path);
  $: openedDate = openedDateLabel(note?.lastOpened, $locale, compact);
  $: openedDateTime = cardDateTime(note?.lastOpened);
  $: openedDateTitle = cardDateTitle(note?.lastOpened, $locale);
  $: cardStyle = `--note-accent: ${accent}; --note-tint: color-mix(in srgb, ${accent} 13%, transparent); --note-glow: color-mix(in srgb, ${accent} 18%, transparent);`;
  $: cardClass = compact
    ? 'note-card group relative flex h-36 w-full flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 pb-3.5 pt-3 text-left shadow-sm shadow-black/[0.03] transition hover:border-[var(--text-secondary)]/40'
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

  <span class="relative block shrink-0 font-serif {compact ? 'line-clamp-2 text-base' : 'truncate text-lg sm:text-xl'} font-medium leading-tight tracking-tight break-anywhere">
    {note?.name || ''}
  </span>
  {#if pathLabel}
    <span class="relative mt-1 block shrink-0 truncate text-[9px] uppercase tracking-[0.14em] text-[var(--text-secondary)]/70 {compact ? '' : 'sm:text-[10px] sm:tracking-[0.16em]'}">
      {pathLabel}
    </span>
  {/if}

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

  {#if compact}
    <span class="relative mt-auto flex min-w-0 shrink-0 flex-col gap-1.5 pt-1.5">
      {#if visibleTags.length > 0}
        <span class="flex min-w-0 gap-1.5 overflow-hidden">
          {#each visibleTags as tag}
            <span class="min-w-0 truncate rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)]/45 px-2 py-0.5 text-[10px] leading-tight text-[var(--text-secondary)]">
              #{tag}
            </span>
          {/each}
        </span>
      {/if}
      {#if openedDate}
        <time
          class="min-h-4 truncate text-[9px] uppercase tracking-[0.1em] text-[var(--text-secondary)]/60"
          datetime={openedDateTime}
          title={openedDateTitle}
        >
          {openedDate}
        </time>
      {/if}
    </span>
  {:else if !compact}
    <span class="relative mt-auto flex min-w-0 shrink-0 flex-col gap-2.5 pt-3">
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
      {#if openedDate}
        <time
          class="min-h-4 truncate text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]/60"
          datetime={openedDateTime}
          title={openedDateTitle}
        >
          {openedDate}
        </time>
      {/if}
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
    -webkit-line-clamp: 1;
    line-clamp: 1;
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
