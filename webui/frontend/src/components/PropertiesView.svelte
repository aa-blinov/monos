<script context="module">
  // How the table was left: kept while the app runs (the filter) and between runs (sort and columns).
  const session = { query: '' };
  const SAVED_KEY = 'propertiesTable';
  function savedView() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_KEY) || 'null');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  }
</script>

<script>
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { localizedText, locale } from '../lib/strings.js';
  import SearchField from './SearchField.svelte';
  import { loadPropertyTableRequest } from '../lib/editor-api.js';
  import { localeDate } from '../lib/date-format.js';
  import { propertyInputText } from '../lib/properties.js';

  // The notes as a table of their custom properties. The query uses the search syntax, so
  // `prop:status=done` filters the rows; a click on a row opens its note.
  const dispatch = createEventDispatcher();

  const saved = savedView();
  let query = session.query;
  let sort = typeof saved.sort === 'string' ? saved.sort : 'modified';
  let dir = saved.dir === 'asc' ? 'asc' : 'desc';
  let keys = [];
  // The shown property columns: the person's last choice, or (when there is none) the well-known fields first.
  let columns = Array.isArray(saved.columns) ? saved.columns : null;
  let total = 0;
  let showAllKeys = false;
  let keyQuery = '';
  const WELL_KNOWN = ['status', 'priority', 'due', 'project', 'type', 'author', 'rating', 'date', 'category'];
  const COLLAPSED_KEYS = 8;
  function rememberView() {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify({ sort, dir, columns }));
    } catch {
      // Nothing to keep it in: the table still works.
    }
  }
  function defaultColumns(list) {
    const lower = new Map(list.map((item) => [String(item.key).toLowerCase(), item.key]));
    const known = WELL_KNOWN.filter((name) => lower.has(name)).map((name) => lower.get(name));
    // Without well-known fields (an imported vault with plugin keys) the most used three.
    return (known.length ? known : list.map((item) => item.key)).slice(0, 3);
  }
  let rows = [];
  let status = 'loading';
  let timer;
  let latest = 0;

  onMount(() => { load(); });
  onDestroy(() => { clearTimeout(timer); session.query = query; });

  async function load() {
    const request = ++latest;
    try {
      const data = await loadPropertyTableRequest({ query: query.trim(), sort, dir });
      if (request !== latest) return;
      rows = Array.isArray(data.rows) ? data.rows : [];
      keys = Array.isArray(data.keys) ? data.keys : [];
      total = Number(data.total) || rows.length;
      if (columns === null) columns = defaultColumns(keys);
      else columns = columns.filter((key) => keys.some((item) => item.key === key));
      if (!columns.length && keys.length) columns = defaultColumns(keys);
      status = 'ready';
    } catch (error) {
      if (request !== latest) return;
      console.error('Failed to load properties:', error);
      status = 'error';
    }
  }

  // Typing waits a moment, so the table is not requested for every letter.
  function onQueryInput() {
    clearTimeout(timer);
    timer = setTimeout(load, 200);
  }

  function sortBy(column) {
    if (sort === column) {
      dir = dir === 'asc' ? 'desc' : 'asc';
    } else {
      sort = column;
      dir = column === 'modified' ? 'desc' : 'asc';
    }
    rememberView();
    load();
  }

  function ariaSort(column) {
    if (sort !== column) return 'none';
    return dir === 'asc' ? 'ascending' : 'descending';
  }

  // Collapsed: the most used keys and every chosen one; open: all of them, narrowed by what is typed.
  $: visibleKeys = showAllKeys
    ? keys.filter((item) => !keyQuery.trim() || String(item.key).toLowerCase().includes(keyQuery.trim().toLowerCase()))
    : keys.filter((item, index) => index < COLLAPSED_KEYS || columns?.includes(item.key));

  function toggleColumn(key) {
    columns = columns.includes(key) ? columns.filter((item) => item !== key) : [...columns, key];
    rememberView();
  }

  // The due date is the app's own field: it reads as "Due", not as the key it is stored under.
  const columnLabel = (key) => (String(key).toLowerCase() === 'due' ? $localizedText.editor.due : key);

  function cellText(row, key) {
    const property = row.properties.find((item) => String(item.key).toLowerCase() === key.toLowerCase());
    if (!property) return '';
    if (property.type === 'checkbox') return property.value ? $localizedText.properties.yes : $localizedText.properties.no;
    // Dates as the Modified column shows them, not as stored (2026-10-20).
    if (property.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(property.value))) return localeDate(new Date(`${property.value}T12:00:00`), $locale);
    return propertyInputText(property);
  }

  // On a narrow screen the table scrolls sideways; a fade at the right edge says there is more.
  let scroller;
  let moreToRight = false;
  function updateFade() {
    moreToRight = Boolean(scroller) && scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 4;
  }
  $: if (scroller && rows) requestAnimationFrame(updateFade);

  function modifiedText(value) {
    return value ? localeDate(new Date(value), $locale) : '';
  }

  function openRow(row) {
    dispatch('navigate', { path: row.path, name: row.title, isDir: false });
  }
</script>

<section class="h-full overflow-y-auto px-4 py-4 sm:py-6 lg:px-12 lg:py-8" data-testid="properties-view">
  <div class="mx-auto max-w-6xl space-y-5">
    <header class="space-y-2">
      <div class="mb-5">
        <h1 class="truncate font-serif text-3xl tracking-tight">{$localizedText.properties.tableTitle}</h1>
        <p class="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">{$localizedText.properties.tableHint}</p>
      </div>
      <SearchField
        bind:value={query}
        on:input={onQueryInput}
        placeholder={$localizedText.properties.tableSearch}
        testid="properties-query"
      />
      <p class="text-xs text-[var(--text-tertiary)] max-sm:hidden">{$localizedText.properties.syntaxHint}</p>
      <details class="text-xs text-[var(--text-tertiary)] sm:hidden">
        <summary class="min-h-10 cursor-pointer py-2">{$localizedText.properties.syntaxTitle}</summary>
        <p class="pb-2">{$localizedText.properties.syntaxHint}</p>
      </details>
    </header>

    {#if keys.length > 0}
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label={$localizedText.properties.columns}>
        <span class="text-[length:var(--text-whisper)] uppercase tracking-[0.15em] text-[var(--text-tertiary)]">{$localizedText.properties.columns}</span>
        {#each visibleKeys as item (item.key)}
          <button
            type="button"
            aria-pressed={columns?.includes(item.key)}
            on:click={() => toggleColumn(item.key)}
            class="rounded-ui border px-2 py-1 text-xs max-sm:min-h-10 {columns?.includes(item.key) ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'}"
          >{columnLabel(item.key)} ({item.count})</button>
        {/each}
        {#if showAllKeys || keys.length > visibleKeys.length}
          <button type="button" data-testid="properties-more-columns" aria-expanded={showAllKeys} on:click={() => { showAllKeys = !showAllKeys; keyQuery = ''; }} class="min-h-8 border-0 bg-transparent p-0 text-xs uppercase tracking-widest text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] max-sm:min-h-10">{showAllKeys ? $localizedText.properties.fewerColumns : $localizedText.properties.moreColumns(keys.length - visibleKeys.length)}</button>
        {/if}
        {#if showAllKeys}
          <input type="search" data-testid="properties-column-search" bind:value={keyQuery} placeholder={$localizedText.properties.findColumn} aria-label={$localizedText.properties.findColumn} class="h-8 w-full rounded-ui border border-[var(--border-subtle)] bg-transparent px-2 text-xs text-[var(--text-primary)] max-sm:h-10" />
        {/if}
      </div>
    {/if}

    {#if status === 'loading'}
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.properties.loading}</p>
    {:else if status === 'error'}
      <p role="alert" class="text-xs text-[var(--red)]">{$localizedText.properties.loadFailed}</p>
    {:else if keys.length === 0 && !query.trim()}
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.properties.noProperties}</p>
    {:else if rows.length === 0}
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.properties.emptyTable}</p>
    {:else}
      <div class="relative">
      <div class="rounded-ui overflow-x-auto border border-[var(--border-subtle)]" bind:this={scroller} on:scroll={updateFade}>
        <table class="w-full min-w-max border-collapse text-left text-xs">
          <thead class="bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
            <tr>
              <th class="px-3 py-2 font-medium" aria-sort={ariaSort('title')}>
                <button type="button" class="font-medium" on:click={() => sortBy('title')}>{$localizedText.properties.noteColumn}</button>
              </th>
              {#each columns || [] as key (key)}
                <th class="px-3 py-2 font-medium" aria-sort={ariaSort(key)}>
                  <button type="button" class="font-medium" on:click={() => sortBy(key)}>{columnLabel(key)}</button>
                </th>
              {/each}
              <th class="px-3 py-2 font-medium" aria-sort={ariaSort('modified')}>
                <button type="button" class="font-medium" on:click={() => sortBy('modified')}>{$localizedText.properties.modified}</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.path)}
              <tr class="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)]">
                <td class="px-3 py-2">
                  <button type="button" class="block max-w-xs truncate text-left text-[var(--text-primary)] hover:underline" on:click={() => openRow(row)}>{row.title}</button>
                </td>
                {#each columns || [] as key (key)}
                  <td class="px-3 py-2 text-[var(--text-secondary)]">{cellText(row, key)}</td>
                {/each}
                <td class="whitespace-nowrap px-3 py-2 text-[var(--text-tertiary)]">{modifiedText(row.modified)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if total > rows.length}
        <p class="mt-2 text-xs text-[var(--text-tertiary)]" data-testid="properties-total">{$localizedText.properties.shownOf(rows.length, total)}</p>
      {/if}
      {#if moreToRight}
        <span class="pointer-events-none absolute inset-y-px right-px w-10 rounded-ui bg-gradient-to-l from-[var(--bg-primary)] to-transparent" aria-hidden="true" data-testid="table-more"></span>
      {/if}
      </div>
    {/if}
  </div>
</section>
