<script context="module">
  // How the page was left (search, use filter, folder, how far it was scrolled): kept while the app runs, so a
  // trip into a note and back does not start the list over.
  const session = { query: '', filter: 'all', folder: '', scroll: 0, limit: 60 };
</script>

<script>
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import { Check, FileText } from 'lucide-svelte';
  import { localizedText, locale } from '../lib/strings.js';
  import {
    attachmentEmbed, attachmentFolders, deleteAttachmentsRequest, fetchAllAttachments, filterAttachments,
    formatAttachmentSize, restoreAttachmentsRequest, sortAttachments,
  } from '../lib/attachments.js';
  import { attachmentsKind, attachmentsSort } from '../stores.js';
  import { localeDate } from '../lib/date-format.js';
  import SearchField from './SearchField.svelte';
  import ModalShell from './ModalShell.svelte';

  // Every picture and PDF of the notes in one grid, as large as the vault: sorted, narrowed by type, folder and
  // use, drawn in pages of 60. A click on a picture shows it large with its notes; unused files can be moved to a
  // local trash (30 days, with an undo) in one go.
  const dispatch = createEventDispatcher();
  const PAGE = 60;
  const filterSelectClass = 'h-8 max-w-[14rem] cursor-pointer rounded-ui border border-[var(--border-subtle)] bg-transparent px-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]';

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

  $: folders = attachmentFolders(items);
  $: filtered = sortAttachments(filterAttachments(items, { query, filter, lockedNotes, kind: $attachmentsKind, folder }), $attachmentsSort);
  $: shown = filtered.slice(0, limit);
  $: unusedItems = lockedNotes > 0 ? [] : items.filter((item) => item.usedBy.length === 0);
  $: unusedSize = unusedItems.reduce((sum, item) => sum + item.size, 0);
  $: selectedItems = items.filter((item) => selected.has(item.path));
  $: selectedSize = selectedItems.reduce((sum, item) => sum + item.size, 0);

  const rawUrl = (item) => `/api/attachments/raw?path=${encodeURIComponent(item.path)}`;
  const isUnused = (item) => lockedNotes === 0 && item.usedBy.length === 0;

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
    confirming = false;
    try {
      const result = await deleteAttachmentsRequest(paths);
      const gone = new Set(paths);
      if (result.deleted > 0) items = items.filter((item) => !gone.has(item.path) || item.usedBy.length > 0);
      selected = new Set();
      viewing = null;
      if (selecting && filtered.length === 0) selecting = false;
      showNotice(`${$localizedText.attachments.trashed(result.deleted, formatAttachmentSize(result.bytes))}${result.skipped?.used ? ` ${$localizedText.attachments.usedSkipped}` : ''}`, result.batch);
    } catch (error) {
      console.error('Failed to move attachments to the trash:', error);
      showNotice($localizedText.attachments.trashFailed);
    }
  }

  async function undo() {
    const batch = notice?.batch;
    if (!batch) return;
    try {
      await restoreAttachmentsRequest(batch);
      await load();
      showNotice($localizedText.attachments.restored);
    } catch (error) {
      console.error('Failed to restore attachments:', error);
      showNotice($localizedText.attachments.trashFailed);
    }
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
      <p role="alert" class="text-xs text-[var(--red)]">{$localizedText.attachments.loadFailed}</p>
    {:else if items.length === 0}
      <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.empty}</p>
    {:else}
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label={$localizedText.attachments.title}>
        <button
          type="button" aria-pressed={filter === 'all'} data-testid="attachments-filter-all"
          on:click={() => { filter = 'all'; narrowed(); }}
          class="rounded-ui border px-2 py-1 text-xs {filter === 'all' ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'}"
        >{$localizedText.attachments.filterAll} ({items.length})</button>
        <button
          type="button" aria-pressed={filter === 'unused'} data-testid="attachments-filter-unused"
          on:click={() => { filter = 'unused'; narrowed(); }}
          class="rounded-ui border px-2 py-1 text-xs {filter === 'unused' ? 'border-[var(--text-primary)] text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'}"
        >{$localizedText.attachments.filterUnused} ({unusedItems.length})</button>

        <select aria-label={$localizedText.attachments.kindLabel} data-testid="attachments-kind" bind:value={$attachmentsKind} on:change={narrowed} class={filterSelectClass}>
          <option value="all">{$localizedText.attachments.kindAll}</option>
          <option value="image">{$localizedText.attachments.kindImage}</option>
          <option value="pdf">{$localizedText.attachments.kindPdf}</option>
        </select>
        <select aria-label={$localizedText.attachments.folderLabel} data-testid="attachments-folder" bind:value={folder} on:change={narrowed} class={filterSelectClass}>
          <option value="">{$localizedText.attachments.folderAll}</option>
          {#each folders as entry (entry.folder)}
            <option value={entry.folder}>{entry.folder || '/'} ({entry.count})</option>
          {/each}
        </select>
        <select aria-label={$localizedText.attachments.sortLabel} data-testid="attachments-sort" bind:value={$attachmentsSort} on:change={narrowed} class={filterSelectClass}>
          <option value="new">{$localizedText.attachments.sortNew}</option>
          <option value="size">{$localizedText.attachments.sortSize}</option>
          <option value="name">{$localizedText.attachments.sortName}</option>
          <option value="notes">{$localizedText.attachments.sortNotes}</option>
        </select>

        <span class="ml-auto text-xs text-[var(--text-tertiary)]" data-testid="attachments-count">{$localizedText.attachments.count(filtered.length, items.length)}</span>
      </div>

      {#if lockedNotes > 0}
        <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.lockedHint}</p>
      {:else if unusedItems.length > 0}
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--text-tertiary)]">
          <span data-testid="attachments-unused-summary">{$localizedText.attachments.unusedSummary(unusedItems.length, formatAttachmentSize(unusedSize))}</span>
          {#if !selecting}
            <button type="button" data-testid="attachments-select" on:click={() => { selecting = true; }} class="min-h-6 border-0 bg-transparent p-0 font-bold uppercase tracking-widest text-[var(--text-primary)] transition hover:opacity-60">{$localizedText.attachments.select}</button>
          {/if}
        </div>
      {/if}

      {#if selecting}
        <div class="rounded-ui sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs" data-testid="attachments-selection-bar">
          {#if confirming}
            <span class="min-w-0 flex-1">{$localizedText.attachments.confirmTrash(selectedItems.length, formatAttachmentSize(selectedSize))}</span>
            <button type="button" data-testid="attachments-confirm" on:click={() => trash(selectedItems.map((item) => item.path))} class="min-h-8 border-0 bg-transparent p-0 font-bold uppercase tracking-widest text-[var(--red)] transition hover:opacity-60">{$localizedText.attachments.confirmYes}</button>
            <button type="button" on:click={() => { confirming = false; }} class="min-h-8 border-0 bg-transparent p-0 uppercase tracking-widest text-[var(--text-secondary)] transition hover:opacity-60">{$localizedText.attachments.confirmNo}</button>
          {:else}
            <span class="text-[var(--text-secondary)]" data-testid="attachments-selected">{$localizedText.attachments.selected(selectedItems.length, formatAttachmentSize(selectedSize))}</span>
            <button type="button" data-testid="attachments-select-unused" on:click={() => { selected = new Set(unusedItems.map((item) => item.path)); }} class="min-h-8 border-0 bg-transparent p-0 uppercase tracking-widest text-[var(--text-primary)] transition hover:opacity-60">{$localizedText.attachments.selectUnused(unusedItems.length)}</button>
            {#if selectedItems.length > 0}
              <button type="button" on:click={() => { selected = new Set(); }} class="min-h-8 border-0 bg-transparent p-0 uppercase tracking-widest text-[var(--text-secondary)] transition hover:opacity-60">{$localizedText.attachments.clearSelection}</button>
              <button type="button" data-testid="attachments-trash" on:click={() => { confirming = true; }} class="min-h-8 border-0 bg-transparent p-0 font-bold uppercase tracking-widest text-[var(--red)] transition hover:opacity-60">{$localizedText.attachments.moveToTrash(selectedItems.length)}</button>
            {/if}
            <button type="button" on:click={stopSelecting} class="ml-auto min-h-8 border-0 bg-transparent p-0 font-bold uppercase tracking-widest text-[var(--text-primary)] transition hover:opacity-60">{$localizedText.attachments.selectDone}</button>
          {/if}
        </div>
      {/if}

      {#if notice}
        <div role="status" class="rounded-ui flex flex-wrap items-center gap-3 border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)]" data-testid="attachments-notice">
          <span class="min-w-0 flex-1">{notice.text}</span>
          {#if notice.batch}
            <button type="button" data-testid="attachments-undo" on:click={undo} class="min-h-8 border-0 bg-transparent p-0 font-bold uppercase tracking-widest text-[var(--text-primary)] transition hover:opacity-60">{$localizedText.attachments.undo}</button>
          {/if}
        </div>
      {/if}

      {#if filtered.length === 0}
        <p class="text-xs text-[var(--text-tertiary)]">{$localizedText.attachments.noMatches}</p>
      {:else}
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="attachments-grid">
          {#each shown as item (item.path)}
            <li class="rounded-ui relative flex min-w-0 flex-col overflow-hidden border {selected.has(item.path) ? 'border-[var(--text-primary)]' : 'border-[var(--border-subtle)]'}" data-testid="attachment-card">
              <button
                type="button"
                data-testid="attachment-open"
                aria-label={selecting ? item.name : `${$localizedText.attachments.preview}: ${item.name}`}
                aria-pressed={selecting ? selected.has(item.path) : undefined}
                title={selecting && !isUnused(item) ? $localizedText.attachments.cannotSelectUsed : undefined}
                on:click={() => pick(item)}
                class="flex aspect-[4/3] w-full items-center justify-center overflow-hidden border-0 bg-[var(--bg-secondary)] p-0 {selecting && !isUnused(item) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}"
              >
                {#if item.kind === 'image'}
                  <img src={rawUrl(item)} alt="" loading="lazy" class="h-full w-full object-cover" />
                {:else}
                  <span class="flex flex-col items-center gap-2 text-[var(--text-secondary)]">
                    <FileText size="24" strokeWidth="1.7" aria-hidden="true" />
                    <span class="text-xs">{$localizedText.attachments.pdf}</span>
                  </span>
                {/if}
              </button>
              {#if selecting && isUnused(item)}
                <span class="pointer-events-none absolute left-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-ui border {selected.has(item.path) ? 'border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]' : 'border-[var(--text-primary)] bg-[var(--bg-primary)]'}" aria-hidden="true">
                  {#if selected.has(item.path)}<Check size="14" strokeWidth="1.7" />{/if}
                </span>
              {/if}
              <div class="min-w-0 space-y-1 p-3">
                <p class="truncate text-xs font-bold text-[var(--text-primary)]" title={item.name}>{item.name}</p>
                <p class="truncate text-[length:var(--text-whisper)] uppercase tracking-[0.1em] text-[var(--text-tertiary)]" title={item.folder}>{item.folder || '/'}</p>
                <p class="text-[length:var(--text-whisper)] uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                  {formatAttachmentSize(item.size)}, {localeDate(new Date(item.modified), $locale)}
                </p>
                {#if item.usedBy.length === 0}
                  <p class="text-xs text-[var(--text-tertiary)]" data-testid="attachment-unused">{lockedNotes > 0 ? '' : $localizedText.attachments.unused}</p>
                {:else}
                  <div class="space-y-0.5" data-testid="attachment-notes">
                    {#each (expanded.has(item.path) ? item.usedBy : item.usedBy.slice(0, 2)) as note (note.path)}
                      <button type="button" class="block min-h-6 w-full truncate border-0 bg-transparent p-0 text-left text-xs text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]" title={note.path} on:click={() => openNote(note)}>{note.title}</button>
                    {/each}
                    {#if item.usedBy.length > 2}
                      <button type="button" data-testid="attachment-more-notes" aria-expanded={expanded.has(item.path)} class="block min-h-6 border-0 bg-transparent p-0 text-left text-[length:var(--text-whisper)] uppercase tracking-[0.1em] text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]" on:click={() => toggleExpanded(item.path)}>{expanded.has(item.path) ? $localizedText.attachments.showLess : $localizedText.attachments.showAll(item.usedBy.length)}</button>
                    {/if}
                  </div>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
        {#if shown.length < filtered.length}
          <div bind:this={sentinel} class="py-4 text-center">
            <button type="button" data-testid="attachments-more" on:click={() => { limit += PAGE; }} class="min-h-9 border-0 bg-transparent p-0 text-xs uppercase tracking-widest text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]">{$localizedText.attachments.loadMore(shown.length, filtered.length)}</button>
          </div>
        {/if}
      {/if}
    {/if}
  </div>
</section>

{#if viewing}
  <ModalShell title={viewing.name} widthClass="w-[min(94vw,56rem)]" on:close={() => { viewing = null; }}>
    <div class="space-y-4" data-testid="attachment-viewer">
      <div class="flex max-h-[55vh] items-center justify-center overflow-hidden bg-[var(--bg-secondary)]">
        {#if viewing.kind === 'image'}
          <img src={rawUrl(viewing)} alt={viewing.name} class="max-h-[55vh] max-w-full object-contain" />
        {:else}
          <embed src={rawUrl(viewing)} type="application/pdf" class="h-[55vh] w-full" />
        {/if}
      </div>
      <p class="text-[length:var(--text-whisper)] uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
        {viewing.folder || '/'}, {formatAttachmentSize(viewing.size)}, {localeDate(new Date(viewing.modified), $locale)}
      </p>
      <div>
        <h3 class="mb-1 text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">{$localizedText.attachments.notesTitle}</h3>
        {#if viewing.usedBy.length === 0}
          <p class="text-xs text-[var(--text-tertiary)]">{lockedNotes > 0 ? $localizedText.attachments.lockedHint : $localizedText.attachments.unused}</p>
        {:else}
          <ul class="max-h-40 overflow-y-auto" data-testid="attachment-viewer-notes">
            {#each viewing.usedBy as note (note.path)}
              <li>
                <button type="button" class="block min-h-8 w-full truncate border-0 bg-transparent p-0 text-left text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]" on:click={() => { const target = note; viewing = null; openNote(target); }}>{note.title}</button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs uppercase tracking-widest">
        <a href={rawUrl(viewing)} target="_blank" rel="noopener" class="inline-flex min-h-9 items-center font-bold text-[var(--text-primary)] transition hover:opacity-60">{$localizedText.attachments.open}</a>
        <button type="button" data-testid="attachment-copy" on:click={() => copyEmbed(viewing)} class="min-h-9 border-0 bg-transparent p-0 font-bold uppercase tracking-widest text-[var(--text-primary)] transition hover:opacity-60">{copied ? $localizedText.attachments.copied : $localizedText.attachments.copyEmbed}</button>
        {#if isUnused(viewing)}
          <button type="button" data-testid="attachment-trash" on:click={() => trash([viewing.path])} class="ml-auto min-h-9 border-0 bg-transparent p-0 font-bold uppercase tracking-widest text-[var(--red)] transition hover:opacity-60">{$localizedText.attachments.moveToTrash(1)}</button>
        {/if}
      </div>
    </div>
  </ModalShell>
{/if}
