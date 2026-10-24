<script context="module">
  // How the page was left (search, use filter, folder, how far it was scrolled): kept while the app runs, so a
  // trip into a note and back does not start the list over.
  const session = { query: '', filter: 'all', folder: '', scroll: 0, limit: 60 };
</script>

<script>
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import { Check, ChevronLeft, ChevronRight, FileText, ImageOff } from 'lucide-svelte';
  import { localizedText, locale } from '../lib/strings.js';
  import {
    attachmentEmbed, attachmentFolders, deleteAttachmentsRequest, duplicateNames, fetchAllAttachments, fetchAttachmentTrash,
    filterAttachments, folderTail, formatAttachmentSize, restoreAttachmentsRequest, sortAttachments,
  } from '../lib/attachments.js';
  import { attachmentsKind, attachmentsSort } from '../stores.js';
  import { localeDate } from '../lib/date-format.js';
  import SearchField from './SearchField.svelte';
  import ModalShell from './ModalShell.svelte';
  import { Button, FieldControl, FilterChip, IconButton } from '@monos/ui';

  // Every picture and PDF of the notes in one grid, as large as the vault: sorted, narrowed by type, folder and
  // use, drawn in pages of 60. A click on a picture shows it large with its notes; unused files can be moved to a
  // local trash (30 days, with an undo) in one go.
  const dispatch = createEventDispatcher();
  const PAGE = 60;

  let items = [];
  let lockedNotes = 0;
  let status = 'loading';
  let query = session.query;
  let filter = session.filter;
  let folder = session.folder;
  let limit = session.limit;
  let expanded = new Set();
  let scroller;
  let sentinel;
  let viewing = null;
  let selecting = false;
  let selected = new Set();
  let confirming = false;
  let notice = null; // { text, batch? }
  let noticeTimer;
  let copied = false;
  let busy = false;
  let zoomed = false;
  let broken = new Set();
  let oddShape = new Set(); // very tall or very wide pictures: cropped to fill the card, not shrunk to a sliver
  let viewerAspect = 1;
  let trashOpen = false;
  let trashData = null;
  let trashStatus = 'loading';
  let toastHover = false;
  let filtersOpen = false;
  let folderPickerOpen = false;
  let folderQuery = '';

  async function load() {
    try {
      const data = await fetchAllAttachments();
      items = data.items || [];
      lockedNotes = data.lockedNotes || 0;
      status = 'ready';
      await tick();
      if (scroller && session.scroll) scroller.scrollTop = session.scroll;
    } catch (error) {
      console.error('Failed to load attachments:', error);
      status = 'error';
    }
  }

  let observer;
  onMount(() => {
    load();
    observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) limit += PAGE;
    }, { root: null, rootMargin: '600px' });
  });
  onDestroy(() => {
    observer?.disconnect();
    clearTimeout(noticeTimer);
    Object.assign(session, { query, filter, folder, limit, scroll: scroller ? scroller.scrollTop : 0 });
  });
  $: if (observer && sentinel) { observer.disconnect(); observer.observe(sentinel); }

  // Narrowing the list starts it from the top again.
  function narrowed() {
    limit = PAGE;
    if (scroller) scroller.scrollTop = 0;
  }

  function isUnused(item) {
    return lockedNotes === 0 && item.usedBy.length === 0;
  }

  $: folders = attachmentFolders(items);
  $: folderChoices = folders.filter((entry) => !folderQuery.trim() || entry.folder.toLowerCase().includes(folderQuery.trim().toLowerCase()));
  // How many choices narrow the list now, for the phone's "Filters" button.
  $: activeFilters = (filter === 'duplicates' ? 1 : 0) + ($attachmentsKind !== 'all' ? 1 : 0) + (folder ? 1 : 0) + ($attachmentsSort !== 'new' ? 1 : 0);
  // The cleanup in one step: only the unused files, all of them chosen, ready to be looked through and moved.
  function reviewUnused() {
    filter = 'unused';
    folder = '';
    query = '';
    $attachmentsKind = 'all';
    narrowed();
    selecting = true;
    selected = new Set(items.filter(isUnused).map((item) => item.path));
  }

  // From the keyboard, past the cards (each has note links) to the end of the list.
  async function skipToEnd() {
    if (shown.length < filtered.length) limit = filtered.length;
    await tick();
    const last = scroller?.querySelectorAll('[data-testid=attachment-open]');
    last?.[last.length - 1]?.focus();
  }

  function chooseFolder(value) {
    folder = value;
    folderPickerOpen = false;
    folderQuery = '';
    narrowed();
  }
  $: filtered = sortAttachments(filterAttachments(items, { query, filter, lockedNotes, kind: $attachmentsKind, folder }), $attachmentsSort);
  $: shown = filtered.slice(0, limit);
  $: unusedItems = lockedNotes > 0 ? [] : items.filter((item) => item.usedBy.length === 0);
  $: unusedShown = filtered.filter(isUnused);
  $: names = duplicateNames(items);
  // Everything unused is gone: the filter that shows nothing is left, not a dead end.
  $: if (status === 'ready' && filter === 'unused' && lockedNotes === 0 && unusedItems.length === 0) { filter = 'all'; selecting = false; selected = new Set(); }
  // What is selected is what is on the page: files that a filter hides leave the selection.
  $: if (selected.size > 0) {
    const visible = new Set(filtered.map((item) => item.path));
    const kept = [...selected].filter((path) => visible.has(path));
    if (kept.length !== selected.size) selected = new Set(kept);
  }
  $: if (selecting && items.length > 0 && !items.some(isUnused)) stopSelecting();
  $: unusedSize = unusedItems.reduce((sum, item) => sum + item.size, 0);
  $: selectedItems = items.filter((item) => selected.has(item.path));
  $: selectedSize = selectedItems.reduce((sum, item) => sum + item.size, 0);

  const rawUrl = (item) => `/api/attachments/raw?path=${encodeURIComponent(item.path)}`;
  // A card asks for a copy about its own size (the address carries the file's time, so the browser keeps it).
  const thumbUrl = (item, width = 480) => `/api/attachments/thumb?path=${encodeURIComponent(item.path)}&w=${width}&v=${encodeURIComponent(item.modified)}`;

  function toggleExpanded(path) {
    expanded = expanded.has(path) ? new Set([...expanded].filter((item) => item !== path)) : new Set([...expanded, path]);
  }

  function openNote(note) {
    dispatch('navigate', { path: note.path, name: note.title, isDir: false });
  }

  function toggleSelected(item) {
    if (!isUnused(item)) return;
    selected = selected.has(item.path) ? new Set([...selected].filter((path) => path !== item.path)) : new Set([...selected, item.path]);
  }

  function pick(item) {
    if (selecting) toggleSelected(item);
    else viewing = item;
  }

  function stopSelecting() {
    selecting = false;
    selected = new Set();
    confirming = false;
  }

  function showNotice(text, batch = null) {
    clearTimeout(noticeTimer);
    notice = { text, batch };
    noticeTimer = setTimeout(() => { notice = null; }, batch ? 15000 : 4000);
  }

  async function trash(paths) {
    if (busy) return;
    confirming = false;
    busy = true;
    try {
      const result = await deleteAttachmentsRequest(paths);
      const moved = new Set(result.trashed || []);
      items = items.filter((item) => !moved.has(item.path));
      selected = new Set([...selected].filter((path) => !moved.has(path)));
      viewing = null;
      const rest = paths.length - moved.size;
      if (rest > 0) {
        // Some files were not moved (a note began to use them, or they are gone): the list is read again, not guessed.
        await load();
        showNotice(result.deleted > 0
          ? $localizedText.attachments.partlyMoved(result.deleted, formatAttachmentSize(result.bytes, $locale), rest)
          : $localizedText.attachments.nothingMoved, result.batch);
      } else {
        showNotice($localizedText.attachments.trashed(result.deleted, formatAttachmentSize(result.bytes, $locale)), result.batch);
      }
    } catch (error) {
      console.error('Failed to move attachments to the trash:', error);
      showNotice($localizedText.attachments.trashFailed);
    } finally {
      busy = false;
    }
  }

  async function undo() {
    const batch = notice?.batch;
    if (!batch || busy) return;
    busy = true;
    try {
      const result = await restoreAttachmentsRequest(batch);
      await load();
      showNotice(result.renamed ? `${$localizedText.attachments.restored} ${$localizedText.attachments.restoredRenamed(result.renamed)}` : $localizedText.attachments.restored);
    } catch (error) {
      console.error('Failed to restore attachments:', error);
      showNotice($localizedText.attachments.trashFailed);
    } finally {
      busy = false;
    }
  }

  async function openTrash() {
    trashOpen = true;
    trashStatus = 'loading';
    try {
      trashData = await fetchAttachmentTrash();
      trashStatus = 'ready';
    } catch (error) {
      console.error('Failed to read the attachments trash:', error);
      trashStatus = 'error';
    }
  }

  async function restoreFromTrash(batch, paths) {
    if (busy) return;
    busy = true;
    try {
      const result = await restoreAttachmentsRequest(batch, paths);
      trashData = await fetchAttachmentTrash();
      await load();
      if (result.renamed) showNotice($localizedText.attachments.restoredRenamed(result.renamed));
    } catch (error) {
      console.error('Failed to restore from the attachments trash:', error);
      trashStatus = 'error';
    } finally {
      busy = false;
    }
  }

  // The large view walks through the files on the page in their order: arrows and the buttons.
  function step(delta) {
    const at = filtered.findIndex((item) => item.path === viewing?.path);
    const next = filtered[at + delta];
    if (next) { viewing = next; zoomed = false; }
  }
  function viewerKeys(event) {
    if (!viewing || event.target?.closest?.('select, input, textarea')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  }

  async function copyEmbed(item) {
    const text = attachmentEmbed(item);
    let done = false;
    try {
      await navigator.clipboard.writeText(text);
      done = true;
    } catch {
      // The async clipboard may be refused (no permission, a plain-http page): the old way still works.
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      try { done = document.execCommand('copy'); } catch { done = false; }
      field.remove();
    }
    if (done) {
      copied = true;
      setTimeout(() => { copied = false; }, 1800);
    }
  }

  $: viewing, copied = false;
  $: viewing, zoomed = false;
  $: viewing, viewerAspect = 1;
</script>

<section bind:this={scroller} class="h-full overflow-y-auto px-4 py-4 sm:py-6 lg:px-12 lg:py-8" data-testid="attachments-view">
  <div class="mx-auto max-w-6xl space-y-5">
    <header class="space-y-2">
      <div class="mb-5">
        <h1 class="truncate font-serif text-3xl tracking-tight">{$localizedText.attachments.title}</h1>
        <p class="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">{$localizedText.attachments.hint}</p>
      </div>
      <SearchField bind:value={query} on:input={narrowed} on:clear={narrowed} placeholder={$localizedText.attachments.search} testid="attachments-query" />
    </header>

    {#if status === 'loading'}
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.loading}</p>
    {:else if status === 'error'}
      <p role="alert" class="flex items-center gap-4 text-xs text-[var(--red)]">
        {$localizedText.attachments.loadFailed}
        <Button variant="ghost" size="sm" type="button" data-testid="attachments-retry" on:click={() => { status = 'loading'; load(); }} class="min-h-8">{$localizedText.attachments.retry}</Button>
      </p>
    {:else if items.length === 0}
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.empty}</p>
    {:else}
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label={$localizedText.attachments.title}>
        <FilterChip active={filter === 'all'} data-testid="attachments-filter-all" on:click={() => { filter = 'all'; narrowed(); }}>{$localizedText.attachments.filterAll} ({items.length})</FilterChip>
        <FilterChip active={filter === 'unused'} data-testid="attachments-filter-unused" on:click={() => { filter = 'unused'; narrowed(); }}>{$localizedText.attachments.filterUnused} ({unusedItems.length})</FilterChip>

        <Button variant="outline" size="sm" data-testid="attachments-filters-toggle" aria-expanded={filtersOpen} class="sm:hidden" on:click={() => { filtersOpen = !filtersOpen; }}>{$localizedText.attachments.filters(activeFilters)}</Button>
        <div class="contents {filtersOpen ? '' : 'max-sm:hidden'}" data-testid="attachments-filter-row">
        {#if names.size > 0}
          <FilterChip active={filter === 'duplicates'} data-testid="attachments-filter-duplicates" on:click={() => { filter = filter === 'duplicates' ? 'all' : 'duplicates'; narrowed(); }}>{$localizedText.attachments.filterDuplicates}</FilterChip>
        {/if}
        <FieldControl as="select" aria-label={$localizedText.attachments.kindLabel} data-testid="attachments-kind" bind:value={$attachmentsKind} on:change={narrowed} class="!w-auto" options={[
          { value: 'all', label: $localizedText.attachments.kindAll },
          { value: 'image', label: $localizedText.attachments.kindImage },
          { value: 'pdf', label: $localizedText.attachments.kindPdf },
        ]} />
        <Button variant="outline" size="sm" data-testid="attachments-folder" aria-haspopup="dialog" aria-label={$localizedText.attachments.folderLabel} class="max-w-[14rem] normal-case" on:click={() => { folderPickerOpen = true; }}>
          <span class="truncate">{folder ? folderTail(folder) : $localizedText.attachments.folderAll}</span>
        </Button>
        <FieldControl as="select" aria-label={$localizedText.attachments.sortLabel} data-testid="attachments-sort" bind:value={$attachmentsSort} on:change={narrowed} class="!w-auto" options={[
          { value: 'new', label: $localizedText.attachments.sortNew },
          { value: 'size', label: $localizedText.attachments.sortSize },
          { value: 'name', label: $localizedText.attachments.sortName },
          { value: 'notes', label: $localizedText.attachments.sortNotes },
        ]} />

        </div>
        <span class="ml-auto text-xs text-[var(--text-tertiary)]" data-testid="attachments-count">{$localizedText.attachments.count(filtered.length, items.length)}</span>
      </div>

      {#if lockedNotes > 0}
        <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.lockedHint}</p>
      {/if}
      {#if lockedNotes === 0}
        <div class="flex flex-wrap items-center gap-x-4 gap-y-0 text-xs text-[var(--text-tertiary)]">
          {#if unusedItems.length > 0}
          <Button variant="ghost" size="sm" type="button" data-testid="attachments-review-unused" on:click={reviewUnused} class="min-h-8 !px-0">{$localizedText.attachments.reviewUnused}</Button>
          <span data-testid="attachments-unused-summary">{$localizedText.attachments.unusedSummary(unusedItems.length, formatAttachmentSize(unusedSize, $locale))}</span>
          {#if !selecting}
            <Button variant="ghost" size="sm" type="button" data-testid="attachments-select" on:click={() => { selecting = true; }} class="min-h-8 !px-0">{$localizedText.attachments.select}</Button>
          {/if}
          {/if}
          <Button variant="ghost" size="sm" type="button" data-testid="attachments-trash-open" on:click={openTrash} class="min-h-8 !px-0">{$localizedText.attachments.removed}</Button>
        </div>
      {/if}

      {#if selecting}
        <div class="rounded-ui sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs" data-testid="attachments-selection-bar">
          {#if confirming}
            <span class="min-w-0 flex-1">{$localizedText.attachments.confirmTrash(selectedItems.length, formatAttachmentSize(selectedSize, $locale))}</span>
            <Button variant="ghost" size="sm" type="button" data-testid="attachments-confirm" disabled={busy} on:click={() => trash(selectedItems.map((item) => item.path))} class="min-h-8">{$localizedText.attachments.confirmYes}</Button>
            <Button variant="ghost" size="sm" type="button" on:click={() => { confirming = false; }} class="min-h-8">{$localizedText.attachments.confirmNo}</Button>
          {:else}
            <span class="text-[var(--text-secondary)]" data-testid="attachments-selected">{$localizedText.attachments.selected(selectedItems.length, formatAttachmentSize(selectedSize, $locale))}</span>
            <Button variant="ghost" size="sm" type="button" data-testid="attachments-select-unused" on:click={() => { selected = new Set(unusedShown.map((item) => item.path)); }} class="min-h-8">{$localizedText.attachments.selectUnusedShown(unusedShown.length)}</Button>
            {#if selectedItems.length > 0}
              <Button variant="ghost" size="sm" type="button" on:click={() => { selected = new Set(); }} class="min-h-8">{$localizedText.attachments.clearSelection}</Button>
              <Button variant="ghost" size="sm" type="button" data-testid="attachments-trash" on:click={() => { confirming = true; }} class="min-h-8">{$localizedText.attachments.moveToTrash(selectedItems.length)}</Button>
            {/if}
            <Button variant="ghost" size="sm" type="button" on:click={stopSelecting} class="min-h-8">{$localizedText.attachments.selectDone}</Button>
          {/if}
        </div>
      {/if}

      {#if filtered.length === 0}
        <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.noMatches}</p>
      {:else}
        <Button variant="ghost" size="sm" data-testid="attachments-skip" on:click={skipToEnd} class="sr-only focus:not-sr-only">{$localizedText.attachments.skipToEnd}</Button>
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="attachments-grid">
          {#each shown as item (item.path)}
            <li class="rounded-ui relative flex min-w-0 flex-col overflow-hidden border {selected.has(item.path) ? 'border-[var(--text-primary)]' : 'border-[var(--border-subtle)]'}" data-testid="attachment-card">
              <Button variant="ghost" size="sm"
                type="button"
                data-testid="attachment-open"
                aria-label={selecting ? item.name : `${$localizedText.attachments.preview}: ${item.name}`}
                aria-pressed={selecting ? selected.has(item.path) : undefined}
                title={selecting && !isUnused(item) ? $localizedText.attachments.cannotSelectUsed : undefined}
                on:click={() => pick(item)}
                class="flex aspect-[4/3] w-full items-center justify-center overflow-hidden border-0 bg-[var(--bg-secondary)] !p-0 {selecting && !isUnused(item) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}"
              >
                {#if !broken.has(item.path)}
                  <img src={thumbUrl(item)} alt="" loading="lazy" decoding="async" class="h-full w-full {item.kind === 'pdf' ? 'object-cover object-top' : oddShape.has(item.path) ? 'object-cover object-top' : 'object-contain'}" on:load={(event) => { const ratio = event.currentTarget.naturalWidth / (event.currentTarget.naturalHeight || 1); if ((ratio < 0.5 || ratio > 3) && !oddShape.has(item.path)) oddShape = new Set([...oddShape, item.path]); }} on:error={() => { broken = new Set([...broken, item.path]); }} />
                {:else if item.kind === 'image'}
                  <span class="flex flex-col items-center gap-2 px-2 text-center text-[var(--text-tertiary)]" title={$localizedText.attachments.brokenImage}>
                    <ImageOff size="24" strokeWidth="1.7" aria-hidden="true" />
                    <span class="whitespace-normal text-xs">{$localizedText.attachments.brokenImage}</span>
                  </span>
                {:else}
                  <span class="flex flex-col items-center gap-2 text-[var(--text-secondary)]">
                    <FileText size="24" strokeWidth="1.7" aria-hidden="true" />
                    <span class="text-xs">{$localizedText.attachments.pdf}</span>
                  </span>
                {/if}
              </Button>
              {#if selecting && isUnused(item)}
                <span class="pointer-events-none absolute left-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-ui border {selected.has(item.path) ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'border-[var(--text-primary)] bg-[var(--bg-primary)]'}" aria-hidden="true">
                  {#if selected.has(item.path)}<Check size="14" strokeWidth="1.7" />{/if}
                </span>
              {/if}
              <div class="min-w-0 space-y-1 p-3">
                <p class="truncate text-xs font-bold text-[var(--text-primary)]" title={item.name}>{item.name}</p>
                <p class="truncate text-[length:var(--text-whisper)] uppercase tracking-[0.1em] text-[var(--text-tertiary)]" title={item.folder || '/'} data-testid="attachment-folder">{folderTail(item.folder)}</p>
                <p class="text-[length:var(--text-whisper)] uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                  {formatAttachmentSize(item.size, $locale)}, {localeDate(new Date(item.modified), $locale)}
                </p>
                {#if item.usedBy.length === 0}
                  <p class="text-xs text-[var(--text-tertiary)]" data-testid="attachment-unused">{lockedNotes > 0 ? '' : $localizedText.attachments.unused}</p>
                {:else}
                  <div class="space-y-0.5" data-testid="attachment-notes">
                    {#each (expanded.has(item.path) ? item.usedBy : item.usedBy.slice(0, 2)) as note (note.path)}
                      <Button variant="quiet" size="sm" class="w-full justify-start truncate !px-0 text-left" title={note.path} on:click={() => openNote(note)}>{note.title}{#if note.via === 'name'} <span class="ml-1 text-[length:var(--text-whisper)] text-[var(--text-tertiary)]" title={$localizedText.attachments.byNameHint}>({$localizedText.attachments.byName})</span>{/if}</Button>
                    {/each}
                    {#if item.usedBy.length > 2}
                      <Button variant="quiet" size="sm" data-testid="attachment-more-notes" aria-expanded={expanded.has(item.path)} class="!px-0" on:click={() => toggleExpanded(item.path)}>{expanded.has(item.path) ? $localizedText.attachments.showLess : $localizedText.attachments.showAll(item.usedBy.length)}</Button>
                    {/if}
                  </div>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
        {#if shown.length < filtered.length}
          <div bind:this={sentinel} class="py-4 text-center">
            <Button variant="ghost" size="md" data-testid="attachments-more" on:click={() => { limit += PAGE; }}>{$localizedText.attachments.loadMore(shown.length, filtered.length)}</Button>
          </div>
        {/if}
      {/if}
    {/if}
  </div>
</section>

{#if folderPickerOpen}
  <ModalShell title={$localizedText.attachments.folderLabel} widthClass="w-[min(94vw,32rem)]" on:close={() => { folderPickerOpen = false; folderQuery = ''; }}>
    <div class="space-y-3" data-testid="attachments-folder-picker">
      <SearchField bind:value={folderQuery} placeholder={$localizedText.attachments.folderSearch} testid="attachments-folder-query" />
      <ul class="max-h-[50vh] overflow-y-auto" role="listbox" aria-label={$localizedText.attachments.folderLabel}>
        {#if !folderQuery.trim()}
          <li role="option" aria-selected={folder === ''}>
            <Button variant="ghost" size="sm" data-testid="attachments-folder-all" class="w-full justify-start normal-case {folder === '' ? 'font-bold' : ''}" on:click={() => chooseFolder('')}>{$localizedText.attachments.folderAll}</Button>
          </li>
        {/if}
        {#each folderChoices as entry (entry.folder)}
          <li role="option" aria-selected={folder === entry.folder}>
            <Button variant="ghost" size="sm" data-testid="attachments-folder-option" class="w-full justify-between gap-3 normal-case {folder === entry.folder ? 'font-bold' : ''}" style="padding-left: {folderQuery.trim() ? 0 : entry.depth * 16}px" title={entry.folder} on:click={() => chooseFolder(entry.folder)}>
              <span class="min-w-0 truncate">{folderQuery.trim() ? entry.folder : entry.label}</span>
              <span class="shrink-0 text-xs text-[var(--text-tertiary)]">{entry.count}</span>
            </Button>
          </li>
        {:else}
          <li class="py-2 text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.folderNone}</li>
        {/each}
      </ul>
    </div>
  </ModalShell>
{/if}

{#if notice}
  <!-- Fixed to the window: the notice and its Undo must be seen wherever the list is scrolled to. -->
  <div
    role="status"
    data-testid="attachments-notice"
    on:mouseenter={() => { toastHover = true; clearTimeout(noticeTimer); }}
    on:mouseleave={() => { toastHover = false; noticeTimer = setTimeout(() => { notice = null; }, 6000); }}
    on:focusin={() => clearTimeout(noticeTimer)}
    class="rounded-ui fixed inset-x-4 bottom-4 z-[120] mx-auto flex max-w-xl flex-wrap items-center gap-3 border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-3 text-xs text-[var(--text-secondary)] shadow-2xl"
  >
    <span class="min-w-0 flex-1">{notice.text}</span>
    {#if notice.batch}
      <Button variant="ghost" size="sm" type="button" data-testid="attachments-undo" disabled={busy} on:click={undo} class="min-h-8">{$localizedText.attachments.undo}</Button>
    {/if}
    <Button variant="ghost" size="sm" type="button" aria-label={$localizedText.attachments.close} on:click={() => { notice = null; }} class="min-h-8">×</Button>
  </div>
{/if}

{#if trashOpen}
  <ModalShell title={$localizedText.attachments.removed} widthClass="w-[min(94vw,40rem)]" on:close={() => { trashOpen = false; }}>
    <div class="space-y-4" data-testid="attachments-trash-view">
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.removedHint(trashData?.days || 30)}</p>
      {#if trashStatus === 'loading'}
        <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.loading}</p>
      {:else if trashStatus === 'error'}
        <p role="alert" class="text-xs text-[var(--red)]">{$localizedText.attachments.loadFailed}</p>
      {:else if !trashData || trashData.batches.length === 0}
        <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.removedEmpty}</p>
      {:else}
        <div class="max-h-[50vh] space-y-4 overflow-y-auto">
          {#each trashData.batches as entry (entry.batch)}
            <div>
              <div class="mb-1 flex items-center justify-between gap-3 text-[length:var(--text-whisper)] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                <span>{localeDate(new Date(entry.at), $locale)}, {entry.files.length}</span>
                <Button variant="ghost" size="sm" type="button" disabled={busy} on:click={() => restoreFromTrash(entry.batch)} class="min-h-8">{$localizedText.attachments.restoreAll}</Button>
              </div>
              <ul class="divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
                {#each entry.files.slice(0, 100) as file (file.path)}
                  <li class="flex items-center justify-between gap-3 py-1">
                    <span class="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]" title={file.path}>{file.name}</span>
                    <span class="shrink-0 text-xs text-[var(--text-tertiary)]">{formatAttachmentSize(file.size, $locale)}</span>
                    <Button variant="ghost" size="sm" type="button" data-testid="attachments-restore-one" disabled={busy} on:click={() => restoreFromTrash(entry.batch, [file.path])} class="min-h-8">{$localizedText.attachments.restore}</Button>
                  </li>
                {/each}
              </ul>
              {#if entry.files.length > 100}<p class="mt-1 text-xs text-[var(--text-tertiary)]">… {entry.files.length - 100}</p>{/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </ModalShell>
{/if}

<svelte:window on:keydown={viewerKeys} />

{#if viewing}
  {@const at = filtered.findIndex((item) => item.path === viewing.path)}
  <ModalShell title={viewing.name.length > 48 ? `${viewing.name.slice(0, 30)}…${viewing.name.slice(-14)}` : viewing.name} widthClass="w-[min(94vw,56rem)]" on:close={() => { viewing = null; zoomed = false; }}>
    <div class="space-y-4" data-testid="attachment-viewer">
      <div class="relative">
        <div class="flex max-h-[55vh] justify-center bg-[var(--bg-secondary)] {viewing.kind === 'pdf' || (viewerAspect < 0.5 && !zoomed) ? 'items-start overflow-y-auto' : zoomed ? 'items-center overflow-auto' : 'items-center overflow-hidden'}" data-testid="attachment-stage">
          {#if viewing.kind === 'image' && !broken.has(viewing.path)}
            <IconButton bare tooltipText="" label={zoomed ? $localizedText.attachments.zoomOut : $localizedText.attachments.zoomIn} data-testid="attachment-zoom" class="m-0 {zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'}" on:click={() => { zoomed = !zoomed; }}>
              <img src={rawUrl(viewing)} alt={viewing.name} on:load={(event) => { viewerAspect = event.currentTarget.naturalWidth / (event.currentTarget.naturalHeight || 1); }} on:error={() => { broken = new Set([...broken, viewing.path]); }} class={zoomed ? 'max-w-none' : viewerAspect < 0.5 ? 'h-auto w-full' : 'max-h-[55vh] max-w-full object-contain'} />
            </IconButton>
          {:else if viewing.kind === 'image'}
            <p class="p-10 text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.brokenImage}</p>
          {:else if !broken.has(viewing.path)}
            <!-- The first page, as a picture: the page-in-a-page viewer does not draw inside the app's dialog. "Open file" shows the whole document. -->
            <img src={thumbUrl(viewing, 1000)} alt={viewing.name} data-testid="attachment-pdf-page" on:error={() => { broken = new Set([...broken, viewing.path]); }} class="h-auto w-full max-w-full" />
          {:else}
            <p class="p-10 text-center text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.pdfNoPreview}</p>
          {/if}
        </div>
        {#if at > 0}
          <IconButton bare tooltipText="" data-testid="attachment-prev" label={$localizedText.attachments.prev} class="absolute left-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:opacity-70" on:click={() => step(-1)}><ChevronLeft size="20" strokeWidth="1.7" aria-hidden="true" /></IconButton>
        {/if}
        {#if at >= 0 && at < filtered.length - 1}
          <IconButton bare tooltipText="" data-testid="attachment-next" label={$localizedText.attachments.next} class="absolute right-2 top-1/2 h-10 w-10 -translate-y-1/2 rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:opacity-70" on:click={() => step(1)}><ChevronRight size="20" strokeWidth="1.7" aria-hidden="true" /></IconButton>
        {/if}
      </div>
      <p class="text-[length:var(--text-whisper)] uppercase tracking-[0.1em] text-[var(--text-tertiary)]" title={viewing.path}>
        {at >= 0 ? `${$localizedText.attachments.position(at + 1, filtered.length)}, ` : ''}{folderTail(viewing.folder, 3)}, {formatAttachmentSize(viewing.size, $locale)}, {localeDate(new Date(viewing.modified), $locale)} {new Date(viewing.modified).toLocaleTimeString($locale === 'ru' ? 'ru-RU' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
      </p>
      <div>
        <h3 class="mb-1 text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">{$localizedText.attachments.notesTitle}</h3>
        {#if viewing.usedBy.length === 0}
          <p class="text-xs text-[var(--text-tertiary)]">{lockedNotes > 0 ? $localizedText.attachments.lockedHint : $localizedText.attachments.unused}</p>
        {:else}
          <ul class="max-h-40 overflow-y-auto" data-testid="attachment-viewer-notes">
            {#each viewing.usedBy as note (note.path)}
              <li>
                <Button variant="ghost" size="sm" type="button" class="min-h-8" on:click={() => { const target = note; viewing = null; openNote(target); }}>{note.title}{#if note.via === 'name'} <span class="ml-1 text-xs text-[var(--text-tertiary)]" title={$localizedText.attachments.byNameHint}>({$localizedText.attachments.byName})</span>{/if}</Button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs uppercase tracking-widest">
        <a href={rawUrl(viewing)} target="_blank" rel="noopener" class="inline-flex min-h-9 items-center font-bold text-[var(--text-primary)] transition hover:opacity-60">{$localizedText.attachments.open}</a>
        <Button variant="ghost" size="md" data-testid="attachment-copy" on:click={() => copyEmbed(viewing)}>{copied ? $localizedText.attachments.copied : $localizedText.attachments.copyEmbed}</Button>
        {#if isUnused(viewing)}
          <Button variant="danger" size="md" data-testid="attachment-trash" disabled={busy} on:click={() => trash([viewing.path])} class="ml-auto">{$localizedText.attachments.moveToTrash(1)}</Button>
        {/if}
      </div>
    </div>
  </ModalShell>
{/if}
