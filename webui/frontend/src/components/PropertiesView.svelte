<script>
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { localizedText, locale } from '../lib/strings.js';
  import { loadPropertyTableRequest } from '../lib/editor-api.js';
  import { localeDate } from '../lib/date-format.js';
  import { propertyInputText } from '../lib/properties.js';

  // The notes as a table of their custom properties. The query uses the search syntax, so
  // `prop:status=done` filters the rows; a click on a row opens its note.
  const dispatch = createEventDispatcher();

  let query = '';
  let sort = 'modified';
  let dir = 'desc';
  let keys = [];
  // The shown property columns. Null until the first answer, when the first three properties are picked.
  let columns = null;
  let rows = [];
  let status = 'loading';
  let timer;
  let latest = 0;

  onMount(() => { load(); });
  onDestroy(() => clearTimeout(timer));

  async function load() {
    const request = ++latest;
    try {
      const data = await loadPropertyTableRequest({ query: query.trim(), sort, dir });
      if (request !== latest) return;
      rows = Array.isArray(data.rows) ? data.rows : [];
      keys = Array.isArray(data.keys) ? data.keys : [];
      if (columns === null) columns = keys.slice(0, 3).map((item) => item.key);
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
    load();
  }

  function ariaSort(column) {
    if (sort !== column) return 'none';
    return dir === 'asc' ? 'ascending' : 'descending';
  }

  function toggleColumn(key) {
    columns = columns.includes(key) ? columns.filter((item) => item !== key) : [...columns, key];
  }

  function cellText(row, key) {
    const property = row.properties.find((item) => String(item.key).toLowerCase() === key.toLowerCase());
    if (!property) return '';
    if (property.type === 'checkbox') return property.value ? $localizedText.properties.yes : $localizedText.properties.no;
    return propertyInputText(property);
  }

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
      <h1 class="text-xl font-bold text-[var(--text-primary)]">{$localizedText.properties.tableTitle}</h1>
      <input
        type="search"
        bind:value={query}
        on:input={onQueryInput}
        placeholder={$localizedText.properties.tableSearch}
        aria-label={$localizedText.properties.tableSearch}
        data-testid="properties-query"
        class="w-full rounded-md border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)]"
      />
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.properties.syntaxHint}</p>
    </header>

    {#if keys.length > 0}
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label={$localizedText.properties.columns}>
        <span class="text-[length:var(--text-whisper)] uppercase tracking-[0.15em] text-[var(--text-tertiary)]">{$localizedText.properties.columns}</span>
        {#each keys as item (item.key)}
          <button
            type="button"
            aria-pressed={columns?.includes(item.key)}
            on:click={() => toggleColumn(item.key)}
            class="rounded-md border px-2 py-1 text-xs {columns?.includes(item.key) ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'}"
          >{item.key} ({item.count})</button>
        {/each}
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
      <div class="overflow-x-auto border border-[var(--border-subtle)]">
        <table class="w-full min-w-max border-collapse text-left text-xs">
          <thead class="bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
            <tr>
              <th class="px-3 py-2 font-medium" aria-sort={ariaSort('title')}>
                <button type="button" class="font-medium" on:click={() => sortBy('title')}>{$localizedText.properties.noteColumn}</button>
              </th>
              {#each columns || [] as key (key)}
                <th class="px-3 py-2 font-medium" aria-sort={ariaSort(key)}>
                  <button type="button" class="font-medium" on:click={() => sortBy(key)}>{key}</button>
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
    {/if}
  </div>
</section>
