<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { customNoteTemplates, getTemplateCatalog, hiddenLibraryTemplateIds } from '../lib/template-library.js';
  import { loadRecentNotesRequest, loadTreeData } from '../lib/sidebar-api.js';
  import { pinnedNotes } from '../lib/sidebar-pinned.js';
  import { matchesNoteFilters, parseQuickSwitcherQuery, rankQuickSwitcherResults } from '../lib/quick-switcher.js';
  import { locale, localizedText } from '../lib/strings.js';

  export let open = false;
  export let mode = 'commands';

  const dispatch = createEventDispatcher();

  let inputEl;
  let query = '';
  let notes = [];
  let recentItems = [];
  let pinnedItems = [];
  let isLoading = false;
  let error = '';
  let lastOpen = false;
  let lastMode = mode;
  let activeIndex = 0;

  function displayPath(itemPath) {
    return itemPath?.startsWith('notes/') ? itemPath.slice(6) : itemPath;
  }

  function noteTitle(node) {
    return node.metadata?.title || node.name?.replace(/\.md$/, '') || node.name;
  }

  function collectNotes(node, result = []) {
    if (!node) return result;
    if (!node.is_dir) {
      result.push({
        id: node.path,
        type: 'note',
        section: 'notes',
        label: noteTitle(node),
        detail: displayPath(node.path),
        path: node.path,
        name: node.name,
        // Carried from the tree metadata so tag:/category:/created: filters can
        // actually match. They used to be dropped here, which made every such
        // filter a silent no-op.
        tags: node.metadata?.tags ?? [],
        metadata: node.metadata ?? null,
      });
    }
    for (const child of node.children || []) collectNotes(child, result);
    return result;
  }

  async function loadNotes() {
    isLoading = true;
    error = '';
    try {
      notes = collectNotes(await loadTreeData()).sort((a, b) => a.label.localeCompare(b.label));
    } catch (err) {
      error = $localizedText.commandPalette.loadFailed(err.message);
    } finally {
      isLoading = false;
    }
  }

  async function loadRecentItems() {
    try {
      const recent = await loadRecentNotesRequest();
      recentItems = recent.map((note) => ({
        id: note.path,
        type: 'recent',
        section: 'recent',
        label: note.name?.replace(/\.md$/i, '') || note.path?.split('/').at(-1)?.replace(/\.md$/i, '') || '',
        detail: displayPath(note.path),
        path: note.path,
        name: note.name,
      }));
    } catch {
      recentItems = [];
    }
  }

  /**
   * Закрепления приходят из того же стора, что и в сайдбаре, — то есть из
   * шапки заметок. Раньше палитра читала их из localStorage, и после переноса
   * закреплений в файлы список здесь просто опустел бы.
   */
  function loadPinnedItems() {
    let current = [];
    pinnedNotes.subscribe((value) => { current = value; })();
    pinnedItems = current.map((note) => ({
      id: note.path,
      type: 'pinned',
      section: 'pinned',
      label: note.name?.replace(/\.md$/i, '') || note.path.split('/').at(-1)?.replace(/\.md$/i, '') || '',
      detail: displayPath(note.path),
      path: note.path,
      name: note.name,
    }));
  }

  function templateItems() {
    return getTemplateCatalog($locale, $hiddenLibraryTemplateIds, $customNoteTemplates).map((template) => ({
      id: template.id,
      type: 'template',
      section: 'templates',
      label: template.title,
      detail: `${template.approachTitle || template.group} · ${template.description}`,
      templateId: template.id,
    }));
  }

  function commands() {
    return [
      {
        id: 'quickOpen',
        type: 'command',
        section: 'commands',
        label: $localizedText.commandPalette.commands.quickOpen,
        detail: $localizedText.commandPalette.commandDetails.quickOpen,
        shortcut: '⌘O',
      },
      {
        id: 'continueWork',
        type: 'command',
        section: 'commands',
        label: $localizedText.commandPalette.commands.continueWork,
        detail: $localizedText.commandPalette.commandDetails.continueWork,
      },
      {
        id: 'openSettings',
        type: 'command',
        section: 'commands',
        label: $localizedText.commandPalette.commands.openSettings,
        detail: $localizedText.commandPalette.commandDetails.openSettings,
      },
      {
        id: 'newNote',
        type: 'command',
        section: 'commands',
        label: $localizedText.commandPalette.commands.newNote,
        detail: $localizedText.commandPalette.commandDetails.newNote,
      },
      {
        id: 'openTemplates',
        type: 'command',
        section: 'commands',
        label: $localizedText.commandPalette.commands.openTemplates,
        detail: $localizedText.commandPalette.commandDetails.openTemplates,
      },
      {
        id: 'openTags',
        type: 'command',
        section: 'commands',
        label: $localizedText.commandPalette.commands.openTags,
        detail: $localizedText.commandPalette.commandDetails.openTags,
      },
      {
        id: 'openTrash',
        type: 'command',
        section: 'commands',
        label: $localizedText.commandPalette.commands.openTrash,
        detail: $localizedText.commandPalette.commandDetails.openTrash,
      },
      {
        id: 'toggleSidebar',
        type: 'command',
        section: 'commands',
        label: $localizedText.commandPalette.commands.toggleSidebar,
        detail: $localizedText.commandPalette.commandDetails.toggleSidebar,
        shortcut: '⌘B',
      },
    ];
  }

  function fuzzyMatch(item, value) {
    const needle = value.trim().toLowerCase();
    if (!needle) return true;
    const haystack = `${item.label} ${item.detail}`.toLowerCase();
    let position = 0;
    for (const char of needle) {
      position = haystack.indexOf(char, position);
      if (position === -1) return false;
      position += 1;
    }
    return true;
  }

  function matchScore(item, value) {
    const needle = value.trim().toLowerCase();
    if (!needle) return 0;
    const label = String(item.label || '').toLowerCase();
    const detail = String(item.detail || '').toLowerCase();
    if (label === needle) return 0;
    if (label.startsWith(needle)) return 1;
    if (label.includes(needle)) return 2;
    if (detail.includes(needle)) return 3;
    return 4;
  }

  function filterItems(items, value) {
    return items
      .filter((item) => fuzzyMatch(item, value))
      .sort((a, b) => matchScore(a, value) - matchScore(b, value))
      .slice(0, 12);
  }

  function isFeaturedPath(path) {
    return [...pinnedItems, ...recentItems].some((item) => item.path === path);
  }

  function close() {
    dispatch('close');
    // Escape and a click outside hand focus back to where the user was; without it
    // focus fell to the page body and a keyboard user lost their place.
    returnFocusEl?.focus?.();
    returnFocusEl = null;
  }

  function selectItem(item) {
    if (!item) return;
    if (item.type === 'note') {
      dispatch('openNote', { path: item.path, name: item.name || item.label, isDir: false });
      close();
      return;
    }
    if (item.type === 'pinned' || item.type === 'recent') {
      dispatch('openNote', { path: item.path, name: item.name || item.label, isDir: false });
      close();
      return;
    }
    if (item.type === 'template') {
      dispatch('command', { id: 'openTemplate', templateId: item.templateId });
      close();
      return;
    }
    dispatch('command', item.id);
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = filteredItems.length ? (activeIndex + 1) % filteredItems.length : 0;
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = filteredItems.length ? (activeIndex - 1 + filteredItems.length) % filteredItems.length : 0;
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      selectItem(filteredItems[activeIndex]);
    }
  }

  let returnFocusEl = null;

  async function activatePalette() {
    returnFocusEl = typeof document !== 'undefined' ? document.activeElement : null;
    lastOpen = true;
    lastMode = mode;
    query = '';
    activeIndex = 0;
    loadPinnedItems();
    await tick();
    inputEl?.focus();
    if (!notes.length) loadNotes();
    loadRecentItems();
  }

  $: if (open && (!lastOpen || mode !== lastMode)) activatePalette();
  $: if (!open && lastOpen) lastOpen = false;
  // Operators are stripped once, then the leftover term drives the fuzzy match.
  // Filtering the featured sections on the raw query made `folder:` match the
  // literal characters "folder:" instead of the folder, so Pinned and Recent
  // ignored operators that the Notes list honoured.
  $: parsedQuery = parseQuickSwitcherQuery(query);
  $: freeTerm = parsedQuery.term;

  /**
   * Filter a featured section: drop anything failing the operators, then fuzzy
   * match the remaining free term. Recent items are described by their backend
   * payload (tags, category, date), pinned ones by the tree.
   *
   * The query arrives as arguments, not through the closure: Svelte re-runs a `$:`
   * statement only for the variables it names. Reading parsedQuery inside this
   * function left Pinned and Recent unfiltered whenever their lists had loaded
   * before the user typed.
   */
  function filterFeatured(items, limit, parsed, term) {
    return items
      .filter((item) => matchesNoteFilters(parsed, {
        name: item.label,
        path: item.path,
        tags: item.tags ?? [],
        metadata: item.metadata ?? null,
      }))
      .filter((item) => !term || fuzzyMatch(item, term))
      .sort((a, b) => matchScore(a, term) - matchScore(b, term))
      .slice(0, limit);
  }

  $: commandItems = mode === 'notes' ? [] : filterItems(commands(), freeTerm);
  $: visiblePinnedItems = filterFeatured(pinnedItems, 4, parsedQuery, freeTerm);
  $: visibleRecentItems = filterFeatured(
    recentItems.filter((item) => !pinnedItems.some((pinned) => pinned.path === item.path)),
    4,
    parsedQuery,
    freeTerm,
  );
  $: visibleTemplateItems = filterItems(templateItems(), freeTerm).slice(0, mode === 'notes' ? 4 : 3);
  $: noteItems = mode === 'notes'
    ? rankQuickSwitcher(query, notes.filter((item) => !isFeaturedPath(item.path)))
    : filterItems(notes.filter((item) => !isFeaturedPath(item.path)), query);

  /**
   * Notes-mode ranking: использует rankQuickSwitcherResults для
   * поддержки `tag:`/`path:` фильтров и более точного скоринга.
   */
  function rankQuickSwitcher(queryText, items) {
    const ranked = rankQuickSwitcherResults(
      queryText,
      items.map((it) => ({ name: it.label, path: it.path, tags: it.tags ?? [], metadata: it.metadata ?? null })),
    );
    const byPath = new Map(items.map((it) => [it.path, it]));
    return ranked
      .map(({ item }) => byPath.get(item.path))
      .filter(Boolean);
  }
  $: filteredItems = mode === 'notes'
    ? [...visiblePinnedItems, ...visibleRecentItems, ...noteItems.slice(0, 10)]
    : [...commandItems, ...visiblePinnedItems, ...visibleRecentItems, ...visibleTemplateItems, ...noteItems.slice(0, Math.max(0, 10 - commandItems.length))];
  $: if (activeIndex >= filteredItems.length) activeIndex = 0;
</script>

{#if open}
  <div class="fixed inset-0 z-[300] flex items-start justify-center bg-black/20 px-4 pt-[12vh] backdrop-blur-sm" role="presentation">
    <button class="absolute inset-0 cursor-default" aria-label={$localizedText.commandPalette.close} on:click={close}></button>

    <div
      class="relative w-full max-w-2xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'notes' ? $localizedText.commandPalette.quickSwitcher : $localizedText.commandPalette.title}
    >
      <div class="border-b border-[var(--border-subtle)] px-5 py-4">
        <div class="mb-3 flex items-center justify-between gap-4">
          <div>
            <div class="text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.24em] text-[var(--text-secondary)]">
              {mode === 'notes' ? $localizedText.commandPalette.quickSwitcher : $localizedText.commandPalette.title}
            </div>
            <div class="mt-1 text-xs text-[var(--text-secondary)]">
              {mode === 'notes' ? $localizedText.commandPalette.quickSwitcherHint : $localizedText.commandPalette.commandHint}
            </div>
          </div>
          <div class="hidden items-center gap-2 text-[length:var(--text-whisper)] uppercase tracking-widest text-[var(--text-muted)] sm:flex">
            <span class="border border-[var(--border-subtle)] px-1.5 py-0.5">↑↓</span>
            <span class="border border-[var(--border-subtle)] px-1.5 py-0.5">Enter</span>
            <span class="border border-[var(--border-subtle)] px-1.5 py-0.5">Esc</span>
          </div>
        </div>

        <input
          bind:this={inputEl}
          bind:value={query}
          on:keydown={handleKeydown}
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-results"
          aria-autocomplete="list"
          aria-label={mode === 'notes' ? $localizedText.commandPalette.quickSwitcherPlaceholder : $localizedText.commandPalette.placeholder}
          placeholder={mode === 'notes' ? $localizedText.commandPalette.quickSwitcherPlaceholder : $localizedText.commandPalette.placeholder}
          class="w-full bg-transparent py-1.5 text-xl font-serif outline-none placeholder:text-[var(--text-tertiary)]"
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <div id="command-palette-results" role="listbox" class="max-h-[55vh] overflow-y-auto py-2">
        {#if isLoading && !filteredItems.length}
          <div class="px-5 py-8 text-center text-xs uppercase tracking-widest text-[var(--text-secondary)]">{$localizedText.commandPalette.loading}</div>
        {:else if filteredItems.length}
          {#each filteredItems as item, index (item.type + item.id)}
            {#if index === 0 || filteredItems[index - 1].section !== item.section}
              <div class="px-5 pb-1 pt-3 text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                {$localizedText.commandPalette.sections[item.section]}
              </div>
            {/if}
            <button
              class="flex w-full items-center justify-between gap-4 px-5 py-3 text-left transition {activeIndex === index ? 'bg-[var(--bg-secondary)]' : 'hover:bg-[var(--bg-secondary)]/70'}"
              role="option"
              aria-selected={activeIndex === index}
              on:mouseenter={() => activeIndex = index}
              on:click={() => selectItem(item)}
            >
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium">{item.label}</span>
                <span class="mt-0.5 block truncate text-xs text-[var(--text-secondary)]">{item.detail}</span>
              </span>
              {#if item.shortcut}
                <span class="shrink-0 border border-[var(--border-subtle)] px-2 py-1 text-[length:var(--text-whisper)] uppercase tracking-widest text-[var(--text-muted)]">{item.shortcut}</span>
              {/if}
            </button>
          {/each}
          {#if isLoading}
            <div class="px-5 py-3 text-[length:var(--text-whisper)] uppercase tracking-widest text-[var(--text-tertiary)]">{$localizedText.commandPalette.loading}</div>
          {/if}
        {:else if error}
          <div class="px-5 py-8 text-sm text-[var(--red)]">{error}</div>
        {:else}
          <div class="px-5 py-8 text-center text-xs uppercase tracking-widest text-[var(--text-secondary)]">
            {$localizedText.commandPalette.noResults}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
