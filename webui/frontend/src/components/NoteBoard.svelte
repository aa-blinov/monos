<script>
  import { cardExcerpt } from '../lib/card-excerpt.js';
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { boardColumnCount, boardSort, boardTag, fittingColumnCounts, homeRecentTotal, loadHomeRecentNotes, loadHomeTags } from '../lib/dashboard.js';
  import { ChevronDown, Copy, ExternalLink, FolderOpen, Palette, PanelTop, Pin, Plus } from 'lucide-svelte';
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
  import { Button, IconButton, Menu } from '@monos/ui';

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
    void loadHomeRecentNotes({ queueIfBusy: true });
  }

  $: currentSortLabel = sortOptions.find(([value]) => value === $boardSort)?.[1] || '';
  $: sortMenuItems = sortOptions.map(([value, label]) => ({ value, label, checked: $boardSort === value, testid: `board-sort-${value}` }));

  function handleWindowClick() {
    closeContextMenu();
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
  <div data-testid="board-toolbar" class="relative z-30 ml-auto inline-flex items-center gap-1 rounded-ui border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-primary)_65%,transparent)] p-1 shadow-sm shadow-black/5 backdrop-blur-sm">
    <Menu
      items={sortMenuItems}
      label={$localizedText.app.board.sortLabel}
      placement="bottom"
      align="start"
      width="auto"
      menuTestid="board-sort-menu"
      class="inline-flex items-center"
      on:select={(event) => chooseSort(event.detail.value)}
    >
      <svelte:fragment slot="trigger" let:open let:toggle let:triggerProps>
        <button
          type="button"
          id="board-sort"
          {...triggerProps}
          aria-label={`${$localizedText.app.board.sortLabel}: ${currentSortLabel}`}
          class="inline-flex h-7 cursor-pointer items-center gap-1 rounded-ui bg-transparent px-2 text-[length:var(--text-whisper-lg)] text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] {open ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : ''}"
          on:click|stopPropagation={toggle}
        >
          <span class="truncate">{currentSortLabel}</span>
          <ChevronDown size="12" strokeWidth="1.7" class="shrink-0 transition-transform {open ? 'rotate-180' : ''}" aria-hidden="true" />
        </button>
      </svelte:fragment>
    </Menu>
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
    <Button variant="ghost" size="sm" role="menuitem" data-testid="card-pin-toggle" on:click={() => togglePin(contextMenu.note)} class="w-full justify-start gap-2 px-3 normal-case">
      <Pin size="14" strokeWidth="1.7" fill={contextMenu.note?.pinned ? 'currentColor' : 'none'} aria-hidden="true" /> {contextMenu.note?.pinned ? $localizedText.sidebar.context.unpin : $localizedText.sidebar.context.pin}
    </Button>
    <Button variant="ghost" size="sm" role="menuitem" on:click={() => openFull(contextMenu.note)} class="w-full justify-start gap-2 px-3 normal-case">
      <ExternalLink size="14" strokeWidth="1.7" aria-hidden="true" /> {$localizedText.app.board.openFull}
    </Button>
    <Button variant="ghost" size="sm" role="menuitem" on:click={() => revealNote(contextMenu.note)} class="w-full justify-start gap-2 px-3 normal-case">
      <PanelTop size="14" strokeWidth="1.7" aria-hidden="true" /> {$localizedText.editorHeader.revealInTree}
    </Button>
    <Button variant="ghost" size="sm" role="menuitem" on:click={() => copyPath(contextMenu.note)} class="w-full justify-start gap-2 px-3 normal-case">
      <Copy size="14" strokeWidth="1.7" aria-hidden="true" /> {$localizedText.app.board.copyPath}
    </Button>
    {#if canRevealInFinder}
      <Button variant="ghost" size="sm" role="menuitem" data-testid="card-show-in-finder" on:click={() => revealInFinder(contextMenu.note?.path)} class="w-full justify-start gap-2 px-3 normal-case">
        <FolderOpen size="14" strokeWidth="1.7" aria-hidden="true" /> {$localizedText.sidebar.context.showInFinder}
      </Button>
    {/if}
    <div class="mt-1 border-t border-[var(--border-subtle)] px-3 py-2">
      <div class="mb-2 flex items-center gap-2 text-[length:var(--text-whisper)] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        <Palette size="12" strokeWidth="1.7" aria-hidden="true" /> {$localizedText.app.board.color}
      </div>
      <div class="grid grid-cols-5 gap-1.5">
        {#each colorOptions as color}
          <IconButton
            bare
            tooltipText=""
            class="h-6 w-6 rounded-full border transition hover:scale-110 {contextMenu.note?.color === color ? 'border-[var(--text-primary)]' : 'border-transparent'}"
            style="background: {color};"
            label={$localizedText.app.board.applyColor(color)}
            on:click={() => recolorNote(contextMenu.note, color)}
          ></IconButton>
        {/each}
      </div>
    </div>
  </div>
{/if}
