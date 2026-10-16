<script>
  import { createEventDispatcher } from 'svelte';
  import { highlightExcerpt, searchSnippet } from '../lib/search.js';
  import { cardExcerpt } from '../lib/card-excerpt.js';
  import { relativeDay } from '../lib/date-format.js';
  import { displayFolderName, locale, localizedText } from '../lib/strings.js';

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
    return cardExcerpt(value);
  }

  function dateLocale(currentLocale = 'en') {
    if (currentLocale === 'ru') return 'ru-RU';
    if (currentLocale === 'en') return 'en-US';
    return currentLocale || 'en-US';
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
  $: pathLabel = (visiblePath(note?.path) || '').replace(/^[^/]+/, (top) => displayFolderName(top, $localizedText));
  $: visibleName = String(note?.name || '');
  $: cardDateValue = note?.modified || note?.lastOpened;
  $: cardDatePrefix = note?.modified ? $localizedText.app.board.modified : $localizedText.app.board.opened;
  // The card shows the day; the tooltip says what the date is and gives the exact moment.
  $: openedDate = relativeDay(cardDateValue, $locale, { today: $localizedText.app.board.today, yesterday: $localizedText.app.board.yesterday });
  $: openedDateTime = cardDateTime(cardDateValue);
  $: openedDateTitle = cardDateValue ? `${cardDatePrefix} ${cardDateTitle(cardDateValue, $locale)}` : '';
  $: cardStyle = `--note-accent: ${accent}; --note-tint: color-mix(in srgb, ${accent} 13%, transparent); --note-glow: color-mix(in srgb, ${accent} 18%, transparent);`;
  $: cardClass = compact
    ? 'note-card group relative flex min-h-36 w-full flex-col overflow-hidden rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 pb-3 pt-3 text-left shadow-sm shadow-black/[0.03] transition hover:border-[var(--text-secondary)]/40'
    : 'note-card group relative flex h-48 w-full flex-col overflow-hidden rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-4 text-left shadow-sm shadow-black/[0.03] transition hover:border-[var(--text-secondary)]/40 sm:px-5 sm:hover:-translate-y-0.5 sm:hover:shadow-xl sm:hover:shadow-black/10';
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

  <span class="relative block shrink-0 font-serif {compact ? 'line-clamp-2 text-base' : 'truncate text-lg sm:text-xl'} font-bold leading-tight tracking-tight break-anywhere">
    {#if highlight && query}
      {@html highlightExcerpt(visibleName, query)}
    {:else}
      {visibleName}
    {/if}
  </span>
  {#if pathLabel}
    <span class="relative mt-1 block shrink-0 truncate text-[length:var(--text-whisper)] uppercase tracking-[0.14em] text-[var(--text-tertiary)] {compact ? '' : 'sm:text-[length:var(--text-whisper)] sm:tracking-[0.16em]'}">
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
      <span class="italic text-[var(--text-tertiary)]">{$localizedText.app.board.emptyNote}</span>
    {/if}
  </span>

  {#if compact}
    <span class="relative mt-auto flex min-w-0 shrink-0 flex-col gap-1.5 pt-1.5">
      {#if visibleTags.length > 0}
        <span class="flex min-w-0 gap-1.5 overflow-hidden">
          {#each visibleTags as tag}
            <span class="min-w-0 truncate rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)]/45 px-2 py-0.5 text-[length:var(--text-whisper)] leading-tight text-[var(--text-secondary)]">
              #{tag}
            </span>
          {/each}
        </span>
      {/if}
      {#if openedDate}
        <time
          class="min-h-4 truncate text-[length:var(--text-whisper)] uppercase tracking-[0.1em] text-[var(--text-tertiary)]"
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
          <span class="rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)]/45 px-2 py-0.5 text-[length:var(--text-whisper)] text-[var(--text-secondary)]">
            #{tag}
          </span>
        {/each}
        {#if hiddenTagCount > 0}
          <span class="rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)]/45 px-2 py-0.5 text-[length:var(--text-whisper)] text-[var(--text-secondary)]">
            +{hiddenTagCount}
          </span>
        {/if}
      {/if}
      </span>
      {#if openedDate}
        <time
          class="min-h-4 truncate text-[length:var(--text-whisper)] uppercase tracking-[0.12em] text-[var(--text-tertiary)]"
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
