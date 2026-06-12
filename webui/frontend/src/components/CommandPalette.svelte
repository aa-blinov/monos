<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { getLocalizedTemplates } from '../lib/note-templates.js';
  import { loadRecentNotesRequest, loadTreeData } from '../lib/sidebar-api.js';
  import { locale, localizedText } from '../lib/strings.js';

  export let open = false;
  export let mode = 'commands';

  const dispatch = createEventDispatcher();
  const PINNED_NOTES_KEY = 'pinnedNotes';

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

  function loadPinnedItems() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PINNED_NOTES_KEY) || '[]');
      pinnedItems = Array.isArray(parsed)
        ? parsed.filter((note) => note?.path).map((note) => ({
          id: note.path,
          type: 'pinned',
          section: 'pinned',
          label: note.name?.replace(/\.md$/i, '') || note.path.split('/').at(-1)?.replace(/\.md$/i, '') || '',
          detail: displayPath(note.path),
          path: note.path,
          name: note.name,
        }))
        : [];
    } catch {
      pinnedItems = [];
    }
  }

  function templateItems() {
    return getLocalizedTemplates($locale).map((template) => ({
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
        id: 'openSettings',
        type: 'command',
        section: 'commands',
        label: $localizedText.commandPalette.commands.openSettings,
        detail: $localizedText.commandPalette.commandDetails.openSettings,
      },
      {
        id: 'toggleSidebar',
        type: 'command',
        section: 'commands',
        label: $localizedText.commandPalette.commands.toggleSidebar,
        detail: $localizedText.commandPalette.commandDetails.toggleSidebar,
        shortcut: '⌘B',
      },
      {
        id: 'toggleTheme',
        type: 'command',
        section: 'commands',
        label: $localizedText.commandPalette.commands.toggleTheme,
        detail: $localizedText.commandPalette.commandDetails.toggleTheme,
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

  async function activatePalette() {
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
  $: commandItems = mode === 'notes' ? [] : filterItems(commands(), query);
  $: visiblePinnedItems = filterItems(pinnedItems, query).slice(0, 4);
  $: visibleRecentItems = filterItems(recentItems.filter((item) => !pinnedItems.some((pinned) => pinned.path === item.path)), query).slice(0, 4);
  $: visibleTemplateItems = filterItems(templateItems(), query).slice(0, mode === 'notes' ? 4 : 3);
  $: noteItems = filterItems(notes.filter((item) => !isFeaturedPath(item.path)), query);
  $: filteredItems = mode === 'notes'
    ? [...visiblePinnedItems, ...visibleRecentItems, ...noteItems.slice(0, 10), ...visibleTemplateItems]
    : [...commandItems, ...visiblePinnedItems, ...visibleRecentItems, ...visibleTemplateItems, ...noteItems.slice(0, Math.max(0, 10 - commandItems.length))];
  $: if (activeIndex >= filteredItems.length) activeIndex = 0;
</script>

{#if open}
  <div class="fixed inset-0 z-[300] flex items-start justify-center bg-black/25 px-4 pt-[12vh] backdrop-blur-sm" role="presentation">
    <button class="absolute inset-0 cursor-default" aria-label={$localizedText.commandPalette.close} on:click={close}></button>

    <div class="relative w-full max-w-2xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-2xl">
      <div class="border-b border-[var(--border-subtle)] px-5 py-4">
        <div class="mb-3 flex items-center justify-between gap-4">
          <div>
            <div class="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--text-secondary)]">
              {mode === 'notes' ? $localizedText.commandPalette.quickSwitcher : $localizedText.commandPalette.title}
            </div>
            <div class="mt-1 text-xs text-[var(--text-secondary)]">
              {mode === 'notes' ? $localizedText.commandPalette.quickSwitcherHint : $localizedText.commandPalette.commandHint}
            </div>
          </div>
          <div class="hidden items-center gap-2 text-[10px] uppercase tracking-widest text-[var(--text-muted)] sm:flex">
            <span class="border border-[var(--border-subtle)] px-1.5 py-0.5">↑↓</span>
            <span class="border border-[var(--border-subtle)] px-1.5 py-0.5">Enter</span>
            <span class="border border-[var(--border-subtle)] px-1.5 py-0.5">Esc</span>
          </div>
        </div>

        <input
          bind:this={inputEl}
          bind:value={query}
          on:keydown={handleKeydown}
          placeholder={mode === 'notes' ? $localizedText.commandPalette.quickSwitcherPlaceholder : $localizedText.commandPalette.placeholder}
          class="w-full bg-transparent py-2 text-xl font-serif outline-none placeholder:text-[var(--text-secondary)]/40"
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <div class="max-h-[55vh] overflow-y-auto py-2">
        {#if isLoading && !filteredItems.length}
          <div class="px-5 py-8 text-center text-xs uppercase tracking-widest text-[var(--text-secondary)]">{$localizedText.commandPalette.loading}</div>
        {:else if filteredItems.length}
          {#each filteredItems as item, index (item.type + item.id)}
            {#if index === 0 || filteredItems[index - 1].section !== item.section}
              <div class="px-5 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]/70">
                {$localizedText.commandPalette.sections[item.section]}
              </div>
            {/if}
            <button
              class="flex w-full items-center justify-between gap-4 px-5 py-3 text-left transition {activeIndex === index ? 'bg-[var(--bg-secondary)]' : 'hover:bg-[var(--bg-secondary)]/70'}"
              on:mouseenter={() => activeIndex = index}
              on:click={() => selectItem(item)}
            >
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium">{item.label}</span>
                <span class="mt-0.5 block truncate text-xs text-[var(--text-secondary)]">{item.detail}</span>
              </span>
              {#if item.shortcut}
                <span class="shrink-0 border border-[var(--border-subtle)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{item.shortcut}</span>
              {/if}
            </button>
          {/each}
          {#if isLoading}
            <div class="px-5 py-3 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]/60">{$localizedText.commandPalette.loading}</div>
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
