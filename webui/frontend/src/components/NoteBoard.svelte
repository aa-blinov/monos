<script>
  import { createEventDispatcher } from 'svelte';
  import { Copy, ExternalLink, LayoutGrid, Palette, PanelTop } from 'lucide-svelte';
  import ModalShell from './ModalShell.svelte';
  import NoteCard from './NoteCard.svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { loadFileContent, reorderBoardNotesRequest, setItemColorRequest } from '../lib/editor-api.js';
  import { renderMarkdownPreview, stripFrontmatter } from '../lib/preview-html.js';
  import { localizedText } from '../lib/strings.js';
  import { boardColumns } from '../stores.js';

  export let notes = [];
  export let query = '';
  export let highlight = false;
  export let mobile = false;
  export let showCreateCard = false;

  const dispatch = createEventDispatcher();

  let orderedNotes = [];
  let notesSignature = '';
  let draggedNote = null;
  let previewNote = null;
  let previewHtml = '';
  let previewEmpty = false;
  let previewLoading = false;
  let contextMenu = { show: false, x: 0, y: 0, note: null };
  const hydratedExcerptPaths = new Set();

  const colorOptions = [
    '#a89984', '#928374', '#fb4934', '#fe8019', '#fabd2f',
    '#b8bb26', '#8ec07c', '#83a598', '#458588', '#d3869b'
  ];

  $: {
    const nextSignature = notes.map((note) => `${note.path}:${note.lastOpened || ''}`).join('|');
    if (nextSignature !== notesSignature) {
      notesSignature = nextSignature;
      orderedNotes = notes;
      hydrateMissingExcerpts(notes);
    }
  }

  $: gridClass = mobile
    ? 'grid grid-cols-2 items-start gap-3 md:grid-cols-3'
    : $boardColumns === '2'
      ? 'grid items-start gap-4 lg:grid-cols-2'
      : $boardColumns === '4'
      ? 'grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
        : 'grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3';
  $: visibleNotes = orderedNotes;
  $: canReorderCards = !mobile && !query.trim();
  $: visibleGroups = groupNotesByColor(visibleNotes, canReorderCards);
  $: displayGroups = visibleGroups.length > 0
    ? visibleGroups
    : [{ id: 'empty', color: null, label: '', notes: [], showHeading: false }];

  function closeContextMenu() {
    contextMenu = { show: false, x: 0, y: 0, note: null };
  }

  function createNote() {
    dispatch('createNote');
  }

  function cardExcerptFromContent(content) {
    return stripFrontmatter(content)
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/[#*_`>~-]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 320);
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

    const groups = [];
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
        groups.push(group);
      }
      seen.get(color).notes.push(note);
    }
    return groups;
  }

  async function persistBoardOrder() {
    if (!canReorderCards) return;
    const paths = orderedNotes.map((note) => note.path).filter(Boolean);
    if (paths.length === 0) return;
    try {
      const reordered = await reorderBoardNotesRequest(paths);
      if (Array.isArray(reordered) && reordered.length > 0) {
        const byPath = new Map(reordered.map((note) => [note.path, note]));
        orderedNotes = orderedNotes.map((note) => byPath.get(note.path) ? { ...note, ...byPath.get(note.path) } : note);
      }
      dispatch('notesReordered', { notes: orderedNotes });
    } catch (error) {
      console.error('Failed to persist board order:', error);
    }
  }

  async function openPreview(note) {
    if (!note?.path) return;
    closeContextMenu();
    previewNote = note;
    previewHtml = '';
    previewEmpty = false;
    previewLoading = true;
    try {
      const data = await loadFileContent(note.path);
      previewEmpty = stripFrontmatter(data.content).length === 0;
      previewHtml = renderMarkdownPreview(data.content);
      updateLocalNote({ ...note, excerpt: cardExcerptFromContent(data.content) });
    } catch (error) {
      previewHtml = renderMarkdownPreview($localizedText.app.board.previewFailed(error.message));
    } finally {
      previewLoading = false;
    }
  }

  function openFull(note = previewNote) {
    if (!note?.path) return;
    closeContextMenu();
    previewNote = null;
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

  function reorderBefore(sourcePath, targetPath) {
    if (!sourcePath || !targetPath || sourcePath === targetPath) return;
    const sourceIndex = orderedNotes.findIndex((note) => note.path === sourcePath);
    const targetIndex = orderedNotes.findIndex((note) => note.path === targetPath);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const nextNotes = [...orderedNotes];
    const [source] = nextNotes.splice(sourceIndex, 1);
    nextNotes.splice(targetIndex, 0, source);
    orderedNotes = nextNotes;
  }

  function autoScrollDuringDrag(event) {
    const container = event.currentTarget?.closest?.('[data-board-scroll]');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const edge = 80;
    if (event.clientY < rect.top + edge) container.scrollTop -= 18;
    if (event.clientY > rect.bottom - edge) container.scrollTop += 18;
  }

  function handleCardContext(event) {
    const { note, x, y } = event.detail;
    contextMenu = { show: true, note, x, y };
  }

  function handleDragStart(event) {
    if (!canReorderCards) return;
    draggedNote = event.detail.note;
    event.detail.event.dataTransfer?.setData('text/plain', draggedNote?.path || '');
    if (event.detail.event.dataTransfer) event.detail.event.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(event) {
    if (!canReorderCards) return;
    event.detail?.event?.preventDefault?.();
    autoScrollDuringDrag(event.detail.event);
    if (!draggedNote) return;
    reorderBefore(draggedNote.path, event.detail.note?.path);
  }

  async function handleDrop(event) {
    if (!canReorderCards) return;
    event.detail?.event?.preventDefault?.();
    if (!draggedNote) return;
    const note = draggedNote;
    draggedNote = null;
    if (note?.path) await persistBoardOrder();
  }

  function handleBoardDragOver(event) {
    if (canReorderCards) event.preventDefault();
  }

  async function handleBoardDrop(event) {
    if (!canReorderCards) return;
    event?.preventDefault?.();
    if (!draggedNote) return;
    const note = draggedNote;
    draggedNote = null;
    if (note?.path) await persistBoardOrder();
  }
</script>

<svelte:window on:click={closeContextMenu} />

{#if !mobile && !query.trim()}
<div class="mb-4 flex justify-end">
  <div class="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)]/65 p-1 shadow-sm shadow-black/5 backdrop-blur-sm">
    <span class="flex h-7 w-7 items-center justify-center text-[var(--text-secondary)]/70" aria-hidden="true">
      <LayoutGrid size="14" strokeWidth="1.7" />
    </span>
    {#each [2, 3, 4] as columnCount}
      <TooltipIconButton
        class="h-7 min-w-8 rounded-full px-2 text-[11px] font-bold tabular-nums tracking-[0.08em] transition {$boardColumns === String(columnCount) ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] shadow-sm shadow-black/10' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'}"
        label={$localizedText.app.board.columns(columnCount)}
        tooltip={$localizedText.app.board.columns(columnCount)}
        on:click={() => $boardColumns = String(columnCount)}
      >
        {columnCount}
      </TooltipIconButton>
    {/each}
  </div>
</div>
{/if}

<div class="space-y-8" role="presentation" on:dragover={handleBoardDragOver} on:drop={handleBoardDrop}>
  {#each displayGroups as group, groupIndex (group.id)}
    <section class="space-y-3">
      {#if group.showHeading}
        <div class="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
          <span
            class="h-3 w-3 rounded-full border border-[var(--border-subtle)]"
            style="background: {group.color || 'transparent'};"
            aria-hidden="true"
          ></span>
          <span>{group.label}</span>
          <span class="text-[var(--text-secondary)]/55">{group.notes.length}</span>
        </div>
      {/if}
      <div class={gridClass} role="list">
        {#if showCreateCard && groupIndex === 0 && !query.trim()}
          <button
            type="button"
            class="{mobile ? 'h-36 rounded-2xl px-3 py-3' : 'h-48 rounded-3xl px-4 py-4 sm:px-5'} group flex w-full flex-col items-center justify-center overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-center shadow-sm shadow-black/[0.03] transition hover:border-[var(--text-secondary)]/45 hover:bg-[var(--bg-secondary)]/45"
            on:click={createNote}
          >
            <span class="block font-serif text-sm font-semibold tracking-tight text-[var(--text-primary)] transition group-hover:text-[var(--text-primary)] sm:text-base">
              {$localizedText.app.homeActions.newNote}
            </span>
          </button>
        {/if}
        {#each group.notes as note (note.path)}
          <NoteCard
            {note}
            {query}
            {highlight}
            compact={mobile}
            draggable={canReorderCards}
            on:open={(event) => mobile ? openFull(event.detail) : openPreview(event.detail)}
            on:context={handleCardContext}
            on:dragStart={handleDragStart}
            on:dragOver={handleDragOver}
            on:drop={handleDrop}
          />
        {/each}
      </div>
    </section>
  {/each}
</div>

{#if contextMenu.show}
  <div
    class="fixed z-[130] w-48 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] py-1 shadow-lg shadow-black/10"
    style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
    role="menu"
    tabindex="-1"
    on:click|stopPropagation
    on:keydown={(event) => event.key === 'Escape' && closeContextMenu()}
  >
    <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-[var(--bg-secondary)]" role="menuitem" on:click={() => openPreview(contextMenu.note)}>
      <PanelTop size="14" aria-hidden="true" /> {$localizedText.app.board.preview}
    </button>
    <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-[var(--bg-secondary)]" role="menuitem" on:click={() => openFull(contextMenu.note)}>
      <ExternalLink size="14" aria-hidden="true" /> {$localizedText.app.board.openFull}
    </button>
    <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-[var(--bg-secondary)]" role="menuitem" on:click={() => revealNote(contextMenu.note)}>
      <PanelTop size="14" aria-hidden="true" /> {$localizedText.editorHeader.revealInTree}
    </button>
    <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-[var(--bg-secondary)]" role="menuitem" on:click={() => copyPath(contextMenu.note)}>
      <Copy size="14" aria-hidden="true" /> {$localizedText.app.board.copyPath}
    </button>
    <div class="mt-1 border-t border-[var(--border-subtle)] px-3 py-2">
      <div class="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
        <Palette size="12" aria-hidden="true" /> {$localizedText.app.board.color}
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

{#if previewNote}
  <ModalShell
    title={previewNote.name}
    widthClass="w-[min(94vw,48rem)] max-h-[86vh] overflow-hidden flex flex-col"
    closeOnEscape={true}
    on:close={() => previewNote = null}
  >
    <div
      class="mb-4 min-h-5 shrink-0 truncate text-[10px] uppercase leading-5 tracking-[0.16em] text-[var(--text-secondary)]/70"
      data-testid="note-preview-path"
    >
      {previewNote.path}
    </div>
    <div
      class="min-h-0 flex-1 overflow-y-auto rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/20 p-5"
      data-testid="note-preview-body"
    >
      {#if previewLoading}
        <div class="py-12 text-center text-xs uppercase tracking-widest text-[var(--text-secondary)]">{$localizedText.app.board.loadingPreview}</div>
      {:else if previewHtml}
        <div class="prose-preview text-sm leading-relaxed text-[var(--text-primary)]">
          {@html previewHtml}
        </div>
      {:else if previewEmpty}
        <div class="py-12 text-center text-xs uppercase tracking-widest text-[var(--text-secondary)]">{$localizedText.app.board.emptyNote}</div>
      {:else}
        <div class="py-12 text-center text-xs uppercase tracking-widest text-[var(--text-secondary)]">{$localizedText.app.board.emptyNote}</div>
      {/if}
    </div>
    <div class="mt-6 flex shrink-0 gap-4">
      <button type="button" class="flex-1 text-sm font-medium transition hover:opacity-60" on:click={() => previewNote = null}>
        {$localizedText.sidebar.modals.cancel}
      </button>
      <button type="button" class="flex-1 text-sm font-bold uppercase tracking-widest transition hover:opacity-60" on:click={() => openFull(previewNote)}>
        {$localizedText.app.board.openFull}
      </button>
    </div>
  </ModalShell>
{/if}

<style>
  .prose-preview :global(h1),
  .prose-preview :global(h2),
  .prose-preview :global(h3) {
    font-family: var(--font-serif, Georgia, serif);
    margin: 0.8rem 0 0.35rem;
  }

  .prose-preview :global(p) {
    margin: 0.65rem 0;
  }

  .prose-preview :global(ul),
  .prose-preview :global(ol) {
    margin: 0.65rem 0;
    padding-left: 1.2rem;
  }

  .prose-preview :global(code) {
    border: 1px solid var(--border-subtle);
    border-radius: 0.35rem;
    padding: 0.05rem 0.25rem;
    font-size: 0.9em;
  }

  .prose-preview :global(pre) {
    overflow-x: auto;
    border: 1px solid var(--border-subtle);
    border-radius: 1rem;
    padding: 1rem;
  }
</style>
