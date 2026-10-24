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
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import { Button, FieldControl } from '@monos/ui';
  import { localizedText, locale } from '../lib/strings.js';
  import SearchField from './SearchField.svelte';
  import { loadPropertyTableRequest, setPropertyRequest } from '../lib/editor-api.js';
  import { localeDate } from '../lib/date-format.js';
  import { propertyInputText, propertyInputType, propertyValueFrom } from '../lib/properties.js';

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
  $: chosenFirst = [...keys.filter((item) => columns?.includes(item.key)), ...keys.filter((item) => !columns?.includes(item.key))];
  $: visibleKeys = showAllKeys
    ? chosenFirst.filter((item) => !keyQuery.trim() || String(item.key).toLowerCase().includes(keyQuery.trim().toLowerCase()))
    : chosenFirst.slice(0, Math.max(COLLAPSED_KEYS, columns?.length || 0));

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

  // ---- Editing in the table: a click on a cell changes the property of that note, without opening it. ----
  let editing = null; // { path, key }
  let editValue = '';
  let editError = '';
  let saving = false;
  const typeOf = (key) => keys.find((item) => item.key === key)?.type || 'text';
  const propertyOf = (row, key) => row.properties.find((item) => String(item.key).toLowerCase() === key.toLowerCase());

  function startEdit(row, key) {
    if (saving) return;
    if (typeOf(key) === 'checkbox') { toggleCheckbox(row, key); return; }
    editing = { path: row.path, key };
    editError = '';
    editValue = propertyInputText(propertyOf(row, key));
  }

  function cancelEdit() {
    editing = null;
    editError = '';
  }

  async function writeProperty(row, key, body) {
    saving = true;
    try {
      const had = Boolean(propertyOf(row, key));
      const result = await setPropertyRequest(row.path, body);
      row.properties = Array.isArray(result?.properties) ? result.properties : row.properties;
      const has = Boolean(propertyOf(row, key));
      // The row stays where it is (a table that reorders under the pointer is hard to follow); only the counts of
      // the fields are brought up to date. The next read puts the rows in their order.
      if (had !== has) {
        const entry = keys.find((item) => item.key === key);
        if (entry) entry.count = Math.max(0, entry.count + (has ? 1 : -1));
        else if (has) keys = [...keys, { key, count: 1, type: typeOf(key) }];
        keys = keys;
      }
      rows = rows;
      editError = '';
      return true;
    } catch (error) {
      console.error('Failed to save the property:', error);
      editError = $localizedText.properties.saveFailed;
      return false;
    } finally {
      saving = false;
    }
  }

  async function commitEdit() {
    if (!editing || saving) return;
    const { path, key } = editing;
    const row = rows.find((item) => item.path === path);
    if (!row) { cancelEdit(); return; }
    const type = typeOf(key);
    const existing = propertyOf(row, key);
    const raw = editValue.trim();
    if (raw === propertyInputText(existing).trim()) { cancelEdit(); return; }
    if (raw === '') {
      if (!existing) { cancelEdit(); return; }
      if (await writeProperty(row, key, { key: existing.key, remove: true })) cancelEdit();
      return;
    }
    const value = propertyValueFrom(type, raw);
    if (value === null) { editError = $localizedText.properties.invalidValue.replace('{type}', $localizedText.properties.typeNames[type]); return; }
    if (await writeProperty(row, key, { key: existing?.key || key, type, value })) cancelEdit();
  }

  async function toggleCheckbox(row, key) {
    const existing = propertyOf(row, key);
    await writeProperty(row, key, { key: existing?.key || key, type: 'checkbox', value: !(existing && existing.value === true) });
  }

  function focusFieldOnMount(node) {
    void tick().then(() => {
      const input = node.querySelector('input, select, textarea');
      input?.focus();
      input?.select?.();
    });
  }

  function editKeys(event) {
    if (event.key === 'Enter') { event.preventDefault(); commitEdit(); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelEdit(); }
  }

  // ---- Suggestions in the filter: the fields, then the values the notes carry for the field. ----
  let searchInput;
  let searchFocused = false;
  $: token = (query.match(/(\S*)$/) || ['', ''])[1];
  $: suggestions = suggestFor(token, keys, rows);
  function suggestFor(current, fieldList, rowList) {
    const field = current.match(/^(-?)prop:([^=<>!]*)$/i);
    if (field) {
      const typed = field[2].toLowerCase();
      return fieldList.filter((item) => !/\s/.test(item.key) && item.key.toLowerCase().includes(typed)).slice(0, 8)
        .map((item) => ({ text: `${field[1]}prop:${item.key}`, label: `${item.key} (${item.count})`, keep: true }));
    }
    const value = current.match(/^(-?prop:)([^=<>!\s]+)=(.*)$/i);
    if (value) {
      const typed = value[3].toLowerCase();
      const seen = new Map();
      for (const row of rowList) {
        const property = row.properties.find((item) => String(item.key).toLowerCase() === value[2].toLowerCase());
        const text = property ? propertyInputText(property) : '';
        if (text && !/\s/.test(text) && text.toLowerCase().includes(typed)) seen.set(text, (seen.get(text) || 0) + 1);
      }
      return [...seen].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([text, count]) => ({ text: `${value[1]}${value[2]}=${text}`, label: `${text} (${count})` }));
    }
    if (!current) return fieldList.slice(0, 5).map((item) => ({ text: `prop:${item.key}`, label: `prop:${item.key}`, keep: true })).filter((item) => !/\s/.test(item.text));
    return [];
  }
  function applySuggestion(item) {
    query = `${query.slice(0, query.length - token.length)}${item.text}${item.keep ? '=' : ' '}`;
    session.query = query;
    clearTimeout(timer);
    timer = setTimeout(load, 120);
    searchInput?.focus();
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
    <div class="space-y-2">
      <div class="mb-5">
        <h1 class="truncate font-serif text-3xl tracking-tight">{$localizedText.properties.tableTitle}</h1>
        <p class="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">{$localizedText.properties.tableHint}</p>
      </div>
      <div on:focusin={() => { searchFocused = true; }} on:focusout={() => { searchFocused = false; }}>
      <SearchField
        bind:value={query}
        bind:inputEl={searchInput}
        on:input={onQueryInput}
        placeholder={$localizedText.properties.tableSearch}
        testid="properties-query"
      />
      </div>
      {#if suggestions.length > 0 && searchFocused}
        <ul class="flex flex-wrap gap-2" data-testid="properties-suggestions" aria-label={$localizedText.properties.suggestions}>
          {#each suggestions as item (item.text)}
            <li>
              <span role="presentation" on:mousedown|preventDefault><Button variant="outline" size="sm" data-testid="properties-suggestion" class="normal-case" on:click={() => applySuggestion(item)}>{item.label}</Button></span>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="text-xs text-[var(--text-tertiary)] max-sm:hidden">{$localizedText.properties.syntaxHint}</p>
      <details class="text-xs text-[var(--text-tertiary)] sm:hidden">
        <summary class="min-h-10 cursor-pointer py-2">{$localizedText.properties.syntaxTitle}</summary>
        <p class="pb-2">{$localizedText.properties.syntaxHint}</p>
      </details>
    </div>

    {#if keys.length > 0}
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label={$localizedText.properties.columns}>
        <span class="text-[length:var(--text-whisper)] uppercase tracking-[0.15em] text-[var(--text-tertiary)]">{$localizedText.properties.columns}</span>
        {#each visibleKeys as item (item.key)}
          <Button
            variant={columns?.includes(item.key) ? 'outline' : 'ghost'}
            size="sm"
            aria-pressed={columns?.includes(item.key)}
            class="normal-case"
            on:click={() => toggleColumn(item.key)}
          >{columnLabel(item.key)} ({item.count})</Button>
        {/each}
        {#if showAllKeys || keys.length > visibleKeys.length}
          <Button variant="ghost" size="sm" data-testid="properties-more-columns" aria-expanded={showAllKeys} on:click={() => { showAllKeys = !showAllKeys; keyQuery = ''; }}>{showAllKeys ? $localizedText.properties.fewerColumns : $localizedText.properties.moreColumns(keys.length - visibleKeys.length)}</Button>
        {/if}
        {#if showAllKeys}
          <SearchField
            testid="properties-column-search"
            bind:value={keyQuery}
            label={$localizedText.properties.findColumn}
            placeholder={$localizedText.properties.findColumn}
            size="sm"
            class="w-full"
          />
        {/if}
      </div>
    {/if}

    {#if status === 'loading'}
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.properties.loading}</p>
    {:else if status === 'error'}
      <p role="alert" class="text-xs text-[var(--red-text)]">{$localizedText.properties.loadFailed}</p>
    {:else if keys.length === 0 && !query.trim()}
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.properties.noProperties}</p>
    {:else if rows.length === 0}
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.properties.emptyTable}</p>
    {:else}
      <div class="relative">
      <div class="rounded-ui max-h-[68vh] overflow-auto border border-[var(--border-subtle)]" bind:this={scroller} on:scroll={updateFade} data-testid="properties-scroller">
        <table class="w-full min-w-max border-collapse text-left text-xs">
          <thead class="sticky top-0 z-[3] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
            <tr>
              <th class="sticky left-0 z-[4] bg-[var(--bg-secondary)] px-3 py-2 font-medium" aria-sort={ariaSort('title')}>
                <Button variant="quiet" size="sm" class="font-medium" on:click={() => sortBy('title')}>{$localizedText.properties.noteColumn}</Button>
              </th>
              {#each columns || [] as key (key)}
                <th class="px-3 py-2 font-medium" aria-sort={ariaSort(key)}>
                  <Button variant="quiet" size="sm" class="font-medium" on:click={() => sortBy(key)}>{columnLabel(key)}</Button>
                </th>
              {/each}
              <th class="px-3 py-2 font-medium" aria-sort={ariaSort('modified')}>
                <Button variant="quiet" size="sm" class="font-medium" on:click={() => sortBy('modified')}>{$localizedText.properties.modified}</Button>
              </th>
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.path)}
              <tr class="group border-t border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)]">
                <td class="sticky left-0 z-[1] bg-[var(--bg-primary)] px-3 py-2 group-hover:bg-[var(--bg-secondary)]">
                  <Button variant="quiet" size="sm" class="max-w-[14rem] justify-start text-left normal-case max-sm:max-w-[9rem]" on:click={() => openRow(row)}><span class="min-w-0 truncate">{row.title}</span></Button>
                </td>
                {#each columns || [] as key (key)}
                  <td class="px-1 py-1 text-[var(--text-secondary)]">
                    {#if editing && editing.path === row.path && editing.key === key}
                      <div use:focusFieldOnMount role="presentation" class="min-w-[7rem]" on:input={(event) => { editValue = event.target.value; }} on:keydown={editKeys}>
                        <FieldControl
                          type={propertyInputType(typeOf(key))}
                          value={editValue}
                          on:blur={commitEdit}
                          aria-label={`${columnLabel(key)}: ${row.title}`}
                          aria-invalid={editError ? 'true' : undefined}
                          data-testid="properties-cell-input"
                          class="h-8 w-full min-w-[7rem] px-2 text-xs"
                        />
                      </div>
                      {#if editError}<span role="alert" class="mt-0.5 block text-[length:var(--text-whisper)] text-[var(--red-text)]">{editError}</span>{/if}
                    {:else}
                      <Button
                        variant="quiet"
                        size="sm"
                        data-testid="properties-cell"
                        on:click={() => startEdit(row, key)}
                        title={$localizedText.properties.editCell}
                        class="block min-h-8 w-full min-w-[5rem] justify-start px-2 text-left text-xs max-sm:min-h-10"
                      >{cellText(row, key) || ' '}</Button>
                    {/if}
                  </td>
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
