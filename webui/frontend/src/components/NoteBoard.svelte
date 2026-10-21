<script>
  import { cardExcerpt } from '../lib/card-excerpt.js';
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { boardColumnCount, boardSort, boardTag, fittingColumnCounts, homeRecentTotal, loadHomeRecentNotes, loadHomeTags } from '../lib/dashboard.js';
  import { Check, ChevronDown, Copy, ExternalLink, FolderOpen, Palette, PanelTop, Pin, Plus } from 'lucide-svelte';
  import { pinNote, unpinNote } from '../lib/sidebar-pinned.js';
  import { writeNoteDragPayload } from '../lib/drag-payload.js';
  import BoardTags from './BoardTags.svelte';
  import NoteCard from './NoteCard.svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { loadFileContent, setItemColorRequest } from '../lib/editor-api.js';
  import { localizedText } from '../lib/strings.js';
  import { boardColumns, boardGroupByColor, activeTheme } from '../stores.js';
  import { computeContextMenuPosition } from '../lib/context-menu-position.js';
  import { getNoteColorOptions } from '../lib/note-colors.js';

  export let notes = [];
  export let query = '';
  export let highlight = false;
  export let mobile = false;
  export let showCreateCard = false;

  const dispatch = createEventDispatcher();

  let orderedNotes = [];
  let notesSignature = '';
  let contextMenu = { show: false, x: 0, y: 0, note: null };
  let contextMenuEl = null;
  let contextMenuPos = { x: 0, y: 0 };
  const CONTEXT_MENU_MARGIN = 4;
  $: if (contextMenu.show && contextMenuEl) adjustContextMenuPosition();
  async function adjustContextMenuPosition() {
    await tick();
    if (!contextMenu.show || !contextMenuEl) return;
    const rect = contextMenuEl.getBoundingClientRect();
    const next = computeContextMenuPosition({
      x: contextMenu.x,
      y: contextMenu.y,
      menuWidth: rect.width,
      menuHeight: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      margin: CONTEXT_MENU_MARGIN,
    });
    contextMenuPos = { x: next.x, y: next.y };
  }
  // The board's own width, not the window's: the sidebar takes its share.
  let boardWidth = 0;
  const hydratedExcerptPaths = new Set();

  $: colorOptions = getNoteColorOptions($activeTheme);

  $: {
    const nextSignature = notes.map((note) => `${note.path}:${note.modified || note.lastOpened || ''}:${note.pinned ? 'p' : ''}`).join('|');
    if (nextSignature !== notesSignature) {
      notesSignature = nextSignature;
      // A reset (a pin toggled, a note changed) keeps the excerpts already read for the cards.
      const loaded = new Map(orderedNotes.filter(hasRealExcerpt).map((note) => [note.path, note.excerpt]));
      orderedNotes = notes.map((note) => (!hasRealExcerpt(note) && loaded.has(note.path) ? { ...note, excerpt: loaded.get(note.path) } : note));
      hydrateMissingExcerpts(notes);
    }
  }

  $: gridClass = mobile
    ? 'grid grid-cols-2 items-stretch gap-3 md:grid-cols-3'
    : 'grid items-start gap-4';
  // Only the counts that fit are offered; the chosen one is kept, and comes back when the board widens.
  $: availableColumnCounts = fittingColumnCounts(boardWidth);
  $: drawnColumns = boardColumnCount($boardColumns, availableColumnCounts);
  $: gridStyle = mobile ? '' : `grid-template-columns: repeat(${drawnColumns}, minmax(0, 1fr));`;
  $: visibleNotes = orderedNotes;
  $: shouldGroupByColor = $boardGroupByColor && !query.trim();
  $: visibleGroups = groupNotesByColor(visibleNotes, shouldGroupByColor);
  // "Pinned" and the rest get their own headings once something is pinned; without pins the board needs none.
  $: sectioned = !shouldGroupByColor && !query.trim() && visibleNotes.some((note) => note.pinned);
  $: sections = sectioned ? splitPinned(visibleNotes, $boardSort, $localizedText) : [];
  $: displayGroups = sections.length > 0
    ? sections
    : visibleGroups.length > 0
      ? visibleGroups
      : [{ id: 'empty', color: null, label: '', notes: [], showHeading: false }];
  // The invitation to write sits first among the unpinned notes, not under the pinned heading.
  $: createGroupId = sectioned && sections.length > 1 ? 'rest' : displayGroups[0]?.id;
  $: sortOptions = [
    ['modified', $localizedText.app.board.sortModified],
    ['opened', $localizedText.app.board.sortOpened],
    ['title', $localizedText.app.board.sortTitle],
  ];

  onMount(() => { void loadHomeTags(); });

  function splitPinned(items, sort, text) {
    const pinned = items.filter((note) => note.pinned);
    const rest = items.filter((note) => !note.pinned);
    const board = text.app.board;
    const groups = [{ id: 'pinned', color: null, label: board.pinnedGroup, notes: pinned, showHeading: true, hideCount: true }];
    if (rest.length > 0 || showCreateCard) {
      groups.push({ id: 'rest', color: null, label: sort === 'title' ? board.titleGroup : board.recentGroup, notes: rest, showHeading: true, hideCount: true });
    }
    return groups;
  }

  function chooseTag(tag) {
    $boardTag = tag;
    void loadHomeRecentNotes({ queueIfBusy: true });
  }

  function chooseSort(value) {
    $boardSort = value;
    closeSortMenu();
    sortTriggerEl?.focus();
    void loadHomeRecentNotes({ queueIfBusy: true });
  }

  // The order is a menu, not a native select: the system draws its own popup (another accent colour, another
  // font) and a select also takes the keyboard focus ring from a mouse click, which nothing else here does.
  let sortMenuOpen = false;
  let sortMenuLeft = 0;
  let sortMenuEl = null;
  let sortTriggerEl = null;
  let toolbarEl = null;

  $: currentSortLabel = sortOptions.find(([value]) => value === $boardSort)?.[1] || '';

  async function toggleSortMenu() {
    if (sortMenuOpen) {
      closeSortMenu();
      return;
    }
    // The menu hangs from the left edge of its button, as the tag list does; when that would run past the
    // toolbar's right edge, it moves left just enough to stay inside.
    sortMenuLeft = Math.max(0, sortTriggerEl?.offsetLeft ?? 0);
    sortMenuOpen = true;
    await tick();
    const menu = sortMenuEl?.getBoundingClientRect();
    const bar = toolbarEl?.getBoundingClientRect();
    if (menu && bar && menu.right > bar.right) {
      sortMenuLeft = Math.max(0, sortMenuLeft - (menu.right - bar.right));
      await tick();
    }
    sortMenuEl?.querySelector('[aria-checked="true"]')?.focus();
  }

  function closeSortMenu() {
    sortMenuOpen = false;
  }

  function sortItems() {
    return [...(sortMenuEl?.querySelectorAll('[role="menuitemradio"]') || [])];
  }

  function handleSortTriggerKeydown(event) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (!sortMenuOpen) void toggleSortMenu();
  }

  function handleSortMenuKeys(event) {
    const items = sortItems();
    const index = items.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeSortMenu();
      sortTriggerEl?.focus();
      return;
    }
    if (event.key === 'Tab') {
      closeSortMenu();
      return;
    }
    let next = null;
    if (event.key === 'ArrowDown') next = items[(index + 1) % items.length];
    else if (event.key === 'ArrowUp') next = items[(index - 1 + items.length) % items.length];
    else if (event.key === 'Home') next = items[0];
    else if (event.key === 'End') next = items[items.length - 1];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }

  function handleWindowClick() {
    closeContextMenu();
    closeSortMenu();
  }

  function closeContextMenu() {
    contextMenu = { show: false, x: 0, y: 0, note: null };
  }

  function createNote() {
    dispatch('createNote');
  }

  function cardExcerptFromContent(content) {
    return cardExcerpt(content);
  }

  function hasRealExcerpt(note) {
    const excerpt = String(note?.excerpt || '').trim();
    return excerpt && !/^last opened:/i.test(excerpt);
  }

  async function hydrateMissingExcerpts(nextNotes) {
    const candidates = nextNotes
      .filter((note) => note?.path && !hasRealExcerpt(note) && !hydratedExcerptPaths.has(note.path))
      .slice(0, 24);

    for (const note of candidates) {
      hydratedExcerptPaths.add(note.path);
      try {
        const data = await loadFileContent(note.path);
        const excerpt = cardExcerptFromContent(data.content);
        orderedNotes = orderedNotes.map((item) => item.path === note.path ? { ...item, excerpt } : item);
      } catch (error) {
        console.error('Failed to hydrate board excerpt:', error);
      }
    }
  }

  function updateLocalNote(note) {
    if (!note?.path) return;
    orderedNotes = orderedNotes.map((item) => item.path === note.path ? { ...item, ...note } : item);
    dispatch('noteTouched', note);
  }

  function groupNotesByColor(items, shouldGroup) {
    if (!shouldGroup) return [{ id: 'all', color: null, label: '', notes: items, showHeading: false }];

    const seen = new Map();
    for (const note of items) {
      const color = note?.color || '';
      if (!seen.has(color)) {
        const group = {
          id: color || 'none',
          color,
          label: color ? $localizedText.app.board.colorGroup(color) : $localizedText.app.board.noColorGroup,
          notes: [],
          showHeading: true,
        };
        seen.set(color, group);
      }
      seen.get(color).notes.push(note);
    }
    const order = ['', ...colorOptions];
    return [...seen.values()].sort((a, b) => {
      const aIndex = order.includes(a.color) ? order.indexOf(a.color) : order.length;
      const bIndex = order.includes(b.color) ? order.indexOf(b.color) : order.length;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return a.id.localeCompare(b.id);
    });
  }

  function openFull(note) {
    if (!note?.path) return;
    closeContextMenu();
    dispatch('openFull', note);
  }

  function revealNote(note) {
    if (!note?.path) return;
    closeContextMenu();
    dispatch('reveal', { path: note.path });
  }

  async function copyPath(note) {
    if (!note?.path || typeof navigator === 'undefined') return;
    closeContextMenu();
    await navigator.clipboard?.writeText?.(note.path);
  }

  // «Показать в Finder» есть только в приложении для компьютера: там оболочка умеет открыть папку.
  const canRevealInFinder = typeof window !== 'undefined' && Boolean(window.monosMenu?.reveal);

  function revealInFinder(path) {
    closeContextMenu();
    window.monosMenu?.reveal?.(path);
  }

  async function recolorNote(note, color) {
    if (!note?.path) return;
    try {
      await setItemColorRequest(note.path, color);
      const nextNote = { ...note, color };
      orderedNotes = orderedNotes.map((item) => item.path === note.path ? nextNote : item);
      closeContextMenu();
      dispatch('noteTouched', nextNote);
    } catch (error) {
      console.error('Failed to recolor note:', error);
    }
  }

  // A card carries its path the way a tree row does, so dropping it on a folder in the
  // sidebar moves the file. The move itself belongs to the sidebar, which already owns it.
  // Order is deliberately not a thing here: /api/notes/reorder exists, but a manual order in
  // the rebuildable index would not follow the note to another device the way a pin does.
  function handleCardDragStart(event, note) {
    if (!note?.path) return;
    writeNoteDragPayload(event.dataTransfer, [note.path]);
  }

  // Pin or unpin from the board itself; the sidebar's list and the card's mark follow through the shared store.
  async function togglePin(note) {
    if (!note?.path) return;
    const pinning = !note.pinned;
    closeContextMenu();
    try {
      if (pinning) await pinNote(note.path, note.title || note.name);
      else await unpinNote(note.path, note.title || note.name);
    } catch (error) {
      console.error('Failed to change the pin:', error);
    }
  }

  function handleCardContext(event) {
    const { note, x, y } = event.detail;
    contextMenu = { show: true, note, x, y };
  }

</script>

<svelte:window on:click={handleWindowClick} />

{#if !query.trim()}
<!-- The tags and the order filter the board, so they stay in sight while the cards scroll under them.
     The bar sits one step (1rem) below and above the content: the page's own top padding is taken down to
     that step, and the background reaches up over what is left, so a card cannot show in the strip above. -->
<div class="sticky top-0 z-30 flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] pb-4 before:absolute before:inset-x-0 before:bottom-full before:h-4 before:bg-[var(--bg-primary)] before:content-[''] sm:-top-2 sm:-mt-2 lg:-top-4 lg:-mt-4">
  <BoardTags on:choose={(event) => chooseTag(event.detail)} />
  <div bind:this={toolbarEl} class="relative z-30 ml-auto inline-flex items-center gap-1 rounded-ui border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-primary)_65%,transparent)] p-1 shadow-sm shadow-black/5 backdrop-blur-sm">
    <button
      type="button"
      id="board-sort"
      bind:this={sortTriggerEl}
      aria-haspopup="menu"
      aria-expanded={sortMenuOpen}
      aria-label={`${$localizedText.app.board.sortLabel}: ${currentSortLabel}`}
      class="inline-flex h-7 cursor-pointer items-center gap-1 rounded-ui bg-transparent px-2 text-[length:var(--text-whisper-lg)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] {sortMenuOpen ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : ''}"
      on:click|stopPropagation={toggleSortMenu}
      on:keydown={handleSortTriggerKeydown}
    >
      <span class="truncate">{currentSortLabel}</span>
      <ChevronDown size="12" strokeWidth="1.7" class="shrink-0 transition-transform {sortMenuOpen ? 'rotate-180' : ''}" aria-hidden="true" />
    </button>
    {#if sortMenuOpen}
      <div
        bind:this={sortMenuEl}
        role="menu"
        tabindex="-1"
        aria-label={$localizedText.app.board.sortLabel}
        data-testid="board-sort-menu"
        class="absolute top-full z-50 mt-1 w-44 rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-1 shadow-lg shadow-black/10"
        style="left: {sortMenuLeft}px"
        on:click|stopPropagation
        on:keydown={handleSortMenuKeys}
      >
        {#each sortOptions as [value, label]}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={$boardSort === value}
            class="flex w-full items-center gap-2 rounded-ui px-2 py-1.5 text-left text-xs transition hover:bg-[var(--bg-secondary)] {$boardSort === value ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}"
            on:click={() => chooseSort(value)}
          >
            <span class="min-w-0 flex-1 truncate">{label}</span>
            {#if $boardSort === value}<Check size="12" strokeWidth="1.7" aria-hidden="true" />{/if}
          </button>
        {/each}
      </div>
    {/if}
    <span class="mx-1 h-4 w-px bg-[var(--border-subtle)]" aria-hidden="true"></span>
    <TooltipIconButton
      class="flex h-7 items-center gap-1.5 rounded-ui px-2 text-[length:var(--text-whisper-lg)] transition {$boardGroupByColor ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'}"
      label={$boardGroupByColor ? $localizedText.app.board.ungroupByColor : $localizedText.app.board.groupByColor}
      tooltip={$boardGroupByColor ? $localizedText.app.board.ungroupByColor : $localizedText.app.board.groupByColor}
      tooltipAlign="end"
      aria-pressed={$boardGroupByColor}
      on:click={() => $boardGroupByColor = !$boardGroupByColor}
    >
      <Palette size="14" strokeWidth="1.7" aria-hidden="true" />
      <span class="hidden sm:inline" aria-hidden="true">{$localizedText.app.board.groupByColorShort}</span>
    </TooltipIconButton>
    {#if !mobile && availableColumnCounts.length > 1}
      <span class="mx-1 h-4 w-px bg-[var(--border-subtle)]" aria-hidden="true"></span>
      <!-- The word names the group, so the numbers need no "columns" after each. -->
      <span class="px-1 text-[length:var(--text-whisper-lg)] text-[var(--text-tertiary)]" aria-hidden="true">{$localizedText.app.board.columnsLabel}</span>
      {#each availableColumnCounts as columnCount}
        <TooltipIconButton
          class="h-7 min-w-8 rounded-ui px-2 text-[length:var(--text-whisper-lg)] tabular-nums tracking-[0.08em] transition {drawnColumns === columnCount ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'}"
          label={$localizedText.app.board.columns(columnCount)}
          tooltip={$localizedText.app.board.columns(columnCount)}
          tooltipAlign="end"
          aria-pressed={drawnColumns === columnCount}
          on:click={() => $boardColumns = String(columnCount)}
        >
          {columnCount}
        </TooltipIconButton>
      {/each}
    {/if}
  </div>
</div>
{/if}

<div class="space-y-8" role="presentation" bind:clientWidth={boardWidth}>
  {#each displayGroups as group (group.id)}
    <section class="space-y-3">
      {#if group.showHeading}
        <div class="flex items-center gap-3 text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
          <span
            class="h-3 w-3 rounded-full border border-[var(--border-subtle)]"
            style="background: {group.color || 'transparent'};"
            aria-hidden="true"
          ></span>
          <span>{group.label}</span>
          {#if !group.hideCount}<span class="text-[var(--text-tertiary)]">{group.notes.length}</span>{/if}
        </div>
      {/if}
      <div class={gridClass} style={gridStyle} role="list">
        {#if showCreateCard && group.id === createGroupId && !query.trim()}
          <!-- An invitation, not a note: a dashed outline that steps forward on hover, so the first slot
               does not weigh like a blank card. -->
          <button
            type="button"
            class="{mobile ? 'h-36 px-3 py-3' : 'h-48 px-4 py-4 sm:px-5'} group flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-ui border border-dashed border-[var(--border-subtle)] bg-transparent text-center text-[var(--text-tertiary)] transition hover:border-[var(--text-tertiary)] hover:bg-[color-mix(in_srgb,var(--bg-secondary)_40%,transparent)] hover:text-[var(--text-primary)] focus-visible:border-[var(--text-tertiary)] focus-visible:text-[var(--text-primary)]"
            on:click={createNote}
          >
            <Plus size="20" strokeWidth="1.7" aria-hidden="true" />
            <span class="block text-xs uppercase tracking-[0.16em]">
              {$localizedText.app.homeActions.newNote.replace(/^\+\s*/, '')}
            </span>
          </button>
        {/if}
        {#each group.notes as note (note.path)}
          <NoteCard
            {note}
            {query}
            {highlight}
            compact={mobile}
            draggable={!highlight}
            on:dragStart={(event) => handleCardDragStart(event.detail.event, event.detail.note)}
            on:open={(event) => openFull(event.detail)}
            on:context={handleCardContext}
          />
        {/each}
      </div>
    </section>
  {/each}
</div>

{#if !query.trim() && $homeRecentTotal !== null && orderedNotes.length > 0}
  <p class="mt-6 text-center text-[length:var(--text-whisper)] uppercase tracking-[0.14em] text-[var(--text-tertiary)]" data-testid="board-count">
    {$localizedText.app.board.shownOf(Math.min(orderedNotes.length, $homeRecentTotal), $homeRecentTotal)}
  </p>
{/if}

{#if contextMenu.show}
  <div
    bind:this={contextMenuEl}
    class="fixed z-[130] w-48 overflow-hidden rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] py-1 shadow-lg shadow-black/10"
    style="left: {contextMenuPos.x}px; top: {contextMenuPos.y}px;"
    role="menu"
    tabindex="-1"
    on:click|stopPropagation
    on:keydown={(event) => event.key === 'Escape' && closeContextMenu()}
  >
    <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-[var(--bg-secondary)]" role="menuitem" data-testid="card-pin-toggle" on:click={() => togglePin(contextMenu.note)}>
      <Pin size="14" strokeWidth="1.7" fill={contextMenu.note?.pinned ? 'currentColor' : 'none'} aria-hidden="true" /> {contextMenu.note?.pinned ? $localizedText.sidebar.context.unpin : $localizedText.sidebar.context.pin}
    </button>
    <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-[var(--bg-secondary)]" role="menuitem" on:click={() => openFull(contextMenu.note)}>
      <ExternalLink size="14" strokeWidth="1.7" aria-hidden="true" /> {$localizedText.app.board.openFull}
    </button>
    <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-[var(--bg-secondary)]" role="menuitem" on:click={() => revealNote(contextMenu.note)}>
      <PanelTop size="14" strokeWidth="1.7" aria-hidden="true" /> {$localizedText.editorHeader.revealInTree}
    </button>
    <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-[var(--bg-secondary)]" role="menuitem" on:click={() => copyPath(contextMenu.note)}>
      <Copy size="14" strokeWidth="1.7" aria-hidden="true" /> {$localizedText.app.board.copyPath}
    </button>
    {#if canRevealInFinder}
      <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-[var(--bg-secondary)]" role="menuitem" data-testid="card-show-in-finder" on:click={() => revealInFinder(contextMenu.note?.path)}>
        <FolderOpen size="14" strokeWidth="1.7" aria-hidden="true" /> {$localizedText.sidebar.context.showInFinder}
      </button>
    {/if}
    <div class="mt-1 border-t border-[var(--border-subtle)] px-3 py-2">
      <div class="mb-2 flex items-center gap-2 text-[length:var(--text-whisper)] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        <Palette size="12" strokeWidth="1.7" aria-hidden="true" /> {$localizedText.app.board.color}
      </div>
      <div class="grid grid-cols-5 gap-1.5">
        {#each colorOptions as color}
          <button
            type="button"
            class="h-6 w-6 rounded-full border transition hover:scale-110 {contextMenu.note?.color === color ? 'border-[var(--text-primary)]' : 'border-transparent'}"
            style="background: {color};"
            aria-label={$localizedText.app.board.applyColor(color)}
            on:click={() => recolorNote(contextMenu.note, color)}
          ></button>
        {/each}
      </div>
    </div>
  </div>
{/if}
