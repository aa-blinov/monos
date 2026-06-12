<script>
  import { onMount, tick } from 'svelte';
  import { Router, Route, navigate } from 'svelte-routing';
  import Sidebar from './components/Sidebar.svelte';
  import Header from './components/Header.svelte';
  import NotePage from './components/NotePage.svelte';
  import NoteBoard from './components/NoteBoard.svelte';
  import Settings from './components/Settings.svelte';
  import SearchResults from './components/SearchResults.svelte';
  import CommandPalette from './components/CommandPalette.svelte';
  import ModalShell from './components/ModalShell.svelte';
  import TooltipIconButton from './components/TooltipIconButton.svelte';
  import { themes } from './lib/themes.js';
  import { fontOptions, fontSizeOptions, lineHeightOptions, contentWidthOptions, editorFontSizeOptions } from './lib/fonts.js';
  import { applyTheme, applyTypographyVars, detectDarkMode, normalizeNotePath } from './lib/app-shell.js';
  import { localizedText } from './lib/strings.js';
  import { activeTheme, fontFamily, fontSize, lineHeight, contentWidth, editorFontSize, editMode, noteView, searchQuery, searchResults, isSearching } from './stores.js';

  const SIDEBAR_WIDTH_KEY = 'sidebarWidth';
  const SIDEBAR_DEFAULT_WIDTH = 336;
  const SIDEBAR_LAPTOP_WIDTH = 280;
  const SIDEBAR_COMPACT_WIDTH = 304;
  const SIDEBAR_MIN_WIDTH = 256;
  const SIDEBAR_MAX_WIDTH = 420;
  const BOARD_NOTES_PAGE_SIZE = 36;

  let isDarkMode = false;
  let sidebarOpen = true;
  let isMobile = false;
  let headerComponent;
  let sidebarComponent;
  let commandPaletteOpen = false;
  let commandPaletteMode = 'commands';
  let sidebarWidth = getInitialSidebarWidth();
  let isResizingSidebar = false;
  let homeRecentNotes = [];
  let homeRecentHasMore = true;
  let homeRecentLoading = false;
  let continueWorkOpen = false;
  let searchUrlReady = false;
  let urlSearchQuery = searchParamFromUrl().trim();
  let restoredInitialUrlSearch = false;
  if (urlSearchQuery) $searchQuery = urlSearchQuery;

  $: applyTheme($activeTheme, isDarkMode, themes);
  $: applyTypographyVars({
    lineHeight: $lineHeight,
    contentWidth: $contentWidth,
    editorFontSize: $editorFontSize,
    fontSize: $fontSize,
    fontFamily: $fontFamily,
    lineHeightOptions,
    contentWidthOptions,
    editorFontSizeOptions,
    fontSizeOptions,
    fontOptions,
  });
  $: activeSearchQuery = $searchQuery.trim() || urlSearchQuery;
  $: if (!searchUrlReady && urlSearchQuery && !restoredInitialUrlSearch) {
    restoredInitialUrlSearch = true;
    $searchQuery = urlSearchQuery;
    void runRestoredSearch(urlSearchQuery);
  }

  function defaultSidebarWidth() {
    if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH;
    if (window.innerWidth < 1200) return SIDEBAR_LAPTOP_WIDTH;
    if (window.innerWidth < 1400) return SIDEBAR_COMPACT_WIDTH;
    return SIDEBAR_DEFAULT_WIDTH;
  }

  function viewportMaxSidebarWidth() {
    if (typeof window === 'undefined') return SIDEBAR_MAX_WIDTH;
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(window.innerWidth * 0.36)));
  }

  function clampSidebarWidth(value) {
    const numericValue = Number(value) || defaultSidebarWidth();
    return Math.min(viewportMaxSidebarWidth(), Math.max(SIDEBAR_MIN_WIDTH, numericValue));
  }

  function getInitialSidebarWidth() {
    if (typeof localStorage === 'undefined') return defaultSidebarWidth();
    return clampSidebarWidth(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  }

  function saveSidebarWidth(width) {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(width)));
  }

  function updateMobileState() {
    isMobile = window.innerWidth < 1024;
    if (isMobile && sidebarOpen) sidebarOpen = false;
    if (!isMobile) sidebarWidth = clampSidebarWidth(sidebarWidth);
  }

  function handleKeydown(e) {
    const key = e.key.toLowerCase();
    const target = e.target;
    const isTypingTarget = target
      && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

    if ((e.metaKey || e.ctrlKey) && key === 'k') {
      e.preventDefault();
      openCommandPalette('commands');
      return;
    }
    if ((e.metaKey || e.ctrlKey) && key === 'o') {
      e.preventDefault();
      openCommandPalette('notes');
      return;
    }
    if ((e.metaKey || e.ctrlKey) && key === 'b') {
      e.preventDefault();
      toggleSidebar();
      return;
    }
    if (((e.metaKey || e.ctrlKey) && e.shiftKey && key === 'f') || (!isTypingTarget && key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey)) {
      e.preventDefault();
      headerComponent?.openSearch?.();
    }
  }

  onMount(() => {
    updateMobileState();
    isDarkMode = detectDarkMode();
    document.documentElement.classList.toggle('dark', isDarkMode);
    if ($noteView === 'board' && !isMobile) sidebarOpen = false;
    if ($noteView === 'board' && window.location.pathname.startsWith('/notes/')) navigate('/');
    void loadHomeRecentNotes();
    void loadShellSettings();
    restoreSearchFromUrl();
    searchUrlReady = true;
    applyTheme($activeTheme, isDarkMode, themes);
  });

  $: if (searchUrlReady) syncSearchUrl($searchQuery);

  async function loadShellSettings() {
    // Load theme from server
    try {
      const r = await fetch('/api/settings');
      if (r.ok) {
        const s = await r.json();
        if (s.theme && themes[s.theme]) $activeTheme = s.theme;
        if (s.editMode) $editMode = s.editMode;
      }
    } catch {}

    applyTheme($activeTheme, isDarkMode, themes);
  }

  function clearSearch() {
    urlSearchQuery = '';
    $searchQuery = '';
    $searchResults = [];
    $isSearching = false;
  }

  function searchParamFromUrl() {
    if (typeof window === 'undefined') return '';
    return new URL(window.location.href).searchParams.get('q') || '';
  }

  function syncSearchUrl(query) {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const cleanQuery = String(query || '').trim();
    urlSearchQuery = cleanQuery;
    if (cleanQuery) url.searchParams.set('q', cleanQuery);
    else url.searchParams.delete('q');

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) window.history.replaceState(window.history.state, '', nextUrl);
  }

  async function runRestoredSearch(query) {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return;

    $isSearching = true;
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanQuery, search_content: true }),
      });
      const results = response.ok ? await response.json() : [];
      if ($searchQuery === cleanQuery) $searchResults = Array.isArray(results) ? results : [];
    } catch {
      if ($searchQuery === cleanQuery) $searchResults = [];
    } finally {
      if ($searchQuery === cleanQuery) $isSearching = false;
    }
  }

  function restoreSearchFromUrl() {
    if (restoredInitialUrlSearch) return;
    const query = ($searchQuery || urlSearchQuery || searchParamFromUrl()).trim();
    if (!query) return;
    urlSearchQuery = query;
    $searchQuery = query;
    void runRestoredSearch(query);
  }

  async function ensureSidebarReady() {
    if (!sidebarOpen) {
      sidebarOpen = true;
      await tick();
    }
  }

  async function openNewNoteFlow() {
    await ensureSidebarReady();
    sidebarComponent?.openCreateNote();
  }

  async function createTodayFromHome() {
    await ensureSidebarReady();
    await sidebarComponent?.createTodayNote();
  }

  async function loadHomeRecentNotes({ append = false } = {}) {
    if (homeRecentLoading) return;
    homeRecentLoading = true;
    try {
      const offset = append ? homeRecentNotes.length : 0;
      const response = await fetch(`/api/notes/recent?limit=${BOARD_NOTES_PAGE_SIZE}&offset=${offset}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const recent = await response.json();
      const nextNotes = Array.isArray(recent) ? recent : [];
      if (append) {
        const seen = new Set(homeRecentNotes.map((note) => note.path));
        homeRecentNotes = [
          ...homeRecentNotes,
          ...nextNotes.filter((note) => note?.path && !seen.has(note.path)),
        ];
      } else {
        homeRecentNotes = nextNotes;
      }
      homeRecentHasMore = nextNotes.length === BOARD_NOTES_PAGE_SIZE;
    } catch (error) {
      console.error('Failed to load recent notes:', error);
    } finally {
      homeRecentLoading = false;
      void maybeFillBoardViewport();
    }
  }

  function handleBoardScroll(event) {
    if ($noteView !== 'board' || !homeRecentHasMore || homeRecentLoading) return;
    const container = event.currentTarget;
    if (container.scrollHeight - container.scrollTop - container.clientHeight < 640) {
      void loadHomeRecentNotes({ append: true });
    }
  }

  async function maybeFillBoardViewport() {
    if ($noteView !== 'board' || !homeRecentHasMore || homeRecentLoading) return;
    await tick();
    const container = document.querySelector('[data-board-scroll]');
    if (container && container.scrollHeight - container.clientHeight < 640) {
      void loadHomeRecentNotes({ append: true });
    }
  }

  function openRecentNote(note) {
    if (!note?.path) return;
    continueWorkOpen = false;
    $noteView = 'list';
    if (!isMobile) sidebarOpen = true;
    handleNavigate({
      detail: {
        path: note.path,
        name: note.name || note.path.split('/').pop(),
        isDir: false,
      },
    });
  }

  function promoteRecentNote(note) {
    if (!note?.path) return;
    const hasNote = homeRecentNotes.some((item) => item.path === note.path);
    homeRecentNotes = hasNote
      ? homeRecentNotes.map((item) => item.path === note.path ? { ...item, ...note } : item)
      : [note, ...homeRecentNotes];
  }

  function displayNoteName(note) {
    return String(note?.name || note?.path?.split('/').pop() || '').replace(/\.md$/i, '');
  }

  function recentPathLabel(note) {
    const rawPath = String(note?.path || '');
    return rawPath
      .replace(/^notes\/?/, '')
      .replace(/\/?[^/]*\.md$/i, '')
      .replace(/\/$/, '') || $localizedText.sidebar?.modals?.root || '';
  }

  function openContinueWork() {
    if (homeRecentNotes.length === 0) {
      openCommandPalette('notes');
      return;
    }
    continueWorkOpen = true;
  }

  function openAllRecentNotes() {
    continueWorkOpen = false;
    openCommandPalette('notes');
  }

  function toggleDarkMode() { isDarkMode = !isDarkMode; localStorage.setItem('darkMode', isDarkMode); document.documentElement.classList.toggle('dark', isDarkMode); applyTheme($activeTheme, isDarkMode, themes); }
  function toggleSidebar() { sidebarOpen = !sidebarOpen; }
  function openCommandPalette(mode = 'commands') { commandPaletteMode = mode; commandPaletteOpen = true; }
  function closeCommandPalette() { commandPaletteOpen = false; }
  function goHome() { navigate('/'); clearSearch(); }

  function handleSidebarResize(event) {
    sidebarWidth = clampSidebarWidth(event.clientX);
  }

  function stopSidebarResize() {
    if (!isResizingSidebar) return;
    isResizingSidebar = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    saveSidebarWidth(sidebarWidth);
    window.removeEventListener('pointermove', handleSidebarResize);
    window.removeEventListener('pointerup', stopSidebarResize);
    window.removeEventListener('mousemove', handleSidebarResize);
    window.removeEventListener('mouseup', stopSidebarResize);
  }

  function startSidebarResize(event) {
    if (isMobile || !sidebarOpen || isResizingSidebar) return;
    event.preventDefault();
    isResizingSidebar = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handleSidebarResize);
    window.addEventListener('pointerup', stopSidebarResize);
    window.addEventListener('mousemove', handleSidebarResize);
    window.addEventListener('mouseup', stopSidebarResize);
  }

  function setSidebarWidth(width) {
    sidebarWidth = clampSidebarWidth(width);
    saveSidebarWidth(sidebarWidth);
  }

  function resetSidebarWidth() {
    setSidebarWidth(defaultSidebarWidth());
  }

  function handleSidebarResizeKeydown(event) {
    if (isMobile || !sidebarOpen) return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setSidebarWidth(sidebarWidth - 16);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setSidebarWidth(sidebarWidth + 16);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setSidebarWidth(SIDEBAR_MIN_WIDTH);
    } else if (event.key === 'End') {
      event.preventDefault();
      setSidebarWidth(viewportMaxSidebarWidth());
    } else if (event.key === 'Enter') {
      event.preventDefault();
      resetSidebarWidth();
    }
  }

  function handleNavigate(event) {
    $noteView = 'list';
    navigate(`/notes/${normalizeNotePath(event.detail.path)}`);
    if (isMobile && !event.detail.isDir) sidebarOpen = false;
    else if (!isMobile && !event.detail.isDir) sidebarOpen = true;
    clearSearch();
  }

  async function revealInTree(event) {
    const path = event.detail?.path;
    if (!path) return;
    if (!sidebarOpen) {
      sidebarOpen = true;
      await tick();
    }
    sidebarComponent?.setSelected(path);
  }

  function handlePaletteCommand(event) {
    if (event.detail?.id === 'openTemplate') {
      sidebarComponent?.openTemplates(event.detail.templateId);
      return;
    }
    if (event.detail === 'quickOpen') {
      openCommandPalette('notes');
      return;
    }
    commandPaletteOpen = false;
    if (event.detail === 'openSettings') navigate('/settings');
    if (event.detail === 'toggleSidebar') toggleSidebar();
    if (event.detail === 'toggleTheme') toggleDarkMode();
  }

  async function handleNoteViewChange(event) {
    if (event.detail?.view === 'board') {
      if (!isMobile) sidebarOpen = false;
      if (window.location.pathname.startsWith('/notes/') || window.location.pathname === '/settings') navigate('/');
      await tick();
      void maybeFillBoardViewport();
      return;
    }

    if (!isMobile) sidebarOpen = true;
  }

</script>

<svelte:window on:resize={updateMobileState} on:keydown={handleKeydown} />

<Router>
  <div class="h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans antialiased overflow-hidden">
    <Header
      bind:this={headerComponent}
      on:toggleDarkMode={toggleDarkMode}
      on:toggleSidebar={toggleSidebar}
      on:goHome={goHome}
      on:noteViewChange={handleNoteViewChange}
      {isDarkMode}
    />

    <CommandPalette
      open={commandPaletteOpen}
      mode={commandPaletteMode}
      on:close={closeCommandPalette}
      on:command={handlePaletteCommand}
      on:openNote={(e) => handleNavigate({ detail: e.detail })}
    />

    {#if continueWorkOpen}
      <ModalShell
        title={$localizedText.app.continueWork.modalTitle}
        widthClass="w-[min(92vw,36rem)]"
        closeOnEscape={true}
        on:close={() => continueWorkOpen = false}
      >
        <div class="space-y-2">
          {#each homeRecentNotes.slice(0, 6) as note (note.path)}
            <button
              type="button"
              class="w-full rounded-2xl border border-transparent px-3 py-3 text-left transition hover:border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)]/45"
              on:click={() => openRecentNote(note)}
            >
              <span class="block truncate text-sm font-semibold tracking-tight">{displayNoteName(note)}</span>
              <span class="mt-1 block truncate text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]/60">{recentPathLabel(note)}</span>
            </button>
          {/each}
        </div>
        <div class="mt-8 flex gap-4">
          <button
            type="button"
            class="flex-1 text-sm font-medium transition hover:opacity-60"
            on:click={() => continueWorkOpen = false}
          >
            {$localizedText.sidebar.modals.cancel}
          </button>
          <button
            type="button"
            class="flex-1 text-sm font-bold uppercase tracking-widest transition hover:opacity-60"
            on:click={openAllRecentNotes}
          >
            {$localizedText.app.continueWork.all}
          </button>
        </div>
      </ModalShell>
    {/if}

    <div class="flex flex-1 overflow-hidden relative">
      {#if isMobile && sidebarOpen}
        <button
          class="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
          on:click={toggleSidebar}
          aria-label={$localizedText.app.closeSidebar}
        ></button>
      {/if}

      <div
        class="{isMobile ? 'fixed inset-y-0 left-0 z-50 w-full' : 'relative shrink-0'}
               {!sidebarOpen ? (isMobile ? '-translate-x-full' : 'w-0 border-r-0') : (isMobile ? '' : 'border-r border-[var(--border-subtle)]')}
               {isResizingSidebar ? '' : 'transition-all duration-300 ease-in-out'}
               overflow-hidden"
        data-testid="sidebar-shell"
        style={!isMobile && sidebarOpen ? `width: ${sidebarWidth}px;` : ''}
      >
        <Sidebar
          bind:this={sidebarComponent}
          on:navigate={handleNavigate}
          on:fileDeleted={() => navigate('/')}
          on:openSettings={() => navigate('/settings')}
          on:openQuickSwitcher={() => openCommandPalette('notes')}
          on:toggleSidebar={toggleSidebar}
        />
        {#if !isMobile && sidebarOpen}
          <TooltipIconButton
            type="button"
            label={$localizedText.app.resizeSidebar}
            tooltip={$localizedText.app.resizeSidebar}
            class="absolute inset-y-0 right-0 z-20 w-3 cursor-col-resize touch-none border-0 bg-transparent p-0 outline-none group"
            on:pointerdown={startSidebarResize}
            on:mousedown={startSidebarResize}
            on:dblclick={resetSidebarWidth}
            on:keydown={handleSidebarResizeKeydown}
          >
            <span class="absolute inset-y-0 right-0 w-px bg-transparent transition group-hover:bg-[var(--text-secondary)]/30 group-focus:bg-[var(--text-secondary)]/40"></span>
          </TooltipIconButton>
        {/if}
      </div>

      <main class="flex-1 overflow-hidden relative">
        {#if activeSearchQuery}
          <SearchResults
            query={activeSearchQuery}
            results={$searchResults}
            isSearching={$isSearching}
            mobile={isMobile}
            on:openResult={(e) => handleNavigate({ detail: { path: e.detail.path, name: e.detail.name, isDir: false } })}
            on:reveal={revealInTree}
          />
        {:else}
        <Route path="/notes/*" let:params>
          <NotePage path={params['*']} on:navigate={handleNavigate} on:fileDeleted={() => { navigate('/'); if (sidebarComponent) sidebarComponent.loadTree(); }} on:fileOpened={(e) => { if (sidebarComponent) sidebarComponent.setSelected(e.detail); }} on:formatComplete={() => { if (sidebarComponent) sidebarComponent.loadTree(); }} on:revealInTree={revealInTree} />
        </Route>
        <Route path="/settings">
          <Settings />
        </Route>
        <Route path="/">
          {#if $noteView === 'board'}
            <div class="h-full overflow-y-auto px-4 py-4 sm:py-6 lg:px-12 lg:py-8" data-board-scroll on:scroll={handleBoardScroll}>
              <div class="mx-auto max-w-6xl">
                <div class="mb-5 sm:mb-7">
                  <h1 class="truncate font-serif text-2xl tracking-tight sm:text-3xl">{$localizedText.app.board.title}</h1>
                  <p class="mt-2 hidden max-w-xl truncate whitespace-nowrap text-sm leading-relaxed text-[var(--text-secondary)] sm:block">{$localizedText.app.board.hint}</p>
                </div>
                <NoteBoard
                  notes={homeRecentNotes}
                  mobile={isMobile}
                  showCreateCard={true}
                  on:createNote={openNewNoteFlow}
                  on:openFull={(e) => openRecentNote(e.detail)}
                  on:reveal={revealInTree}
                  on:noteTouched={(e) => promoteRecentNote(e.detail)}
                  on:notesReordered={(e) => homeRecentNotes = e.detail.notes}
                />
                {#if homeRecentLoading && homeRecentNotes.length > 0}
                  <div class="py-8 text-center text-xs uppercase tracking-widest text-[var(--text-secondary)]">
                    {$localizedText.searchResults.searching}
                  </div>
                {:else if !homeRecentLoading && homeRecentNotes.length === 0}
                  <div class="rounded-3xl border border-dashed border-[var(--border-subtle)] px-5 py-10 text-center">
                    <p class="font-serif text-lg italic text-[var(--text-secondary)]">{isMobile ? $localizedText.app.emptyMobile : $localizedText.app.emptyDesktop}</p>
                  </div>
                {/if}
              </div>
            </div>
          {:else}
          <div class="h-full flex items-center justify-center px-8">
            <div class="text-center max-w-2xl">
              <p class="select-none text-lg lg:text-xl text-[var(--text-secondary)] leading-relaxed font-serif italic">
                {isMobile
                  ? $localizedText.app.emptyMobile
                  : $localizedText.app.emptyDesktop}
              </p>
              {#if !isMobile}
                <div class="mt-10 grid grid-cols-2 gap-3 max-w-xl mx-auto text-left">
                  <button
                    on:click={openNewNoteFlow}
                    class="group min-h-20 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/40 px-5 py-4 transition hover:-translate-y-0.5 hover:border-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                  >
                    <span class="block text-sm font-semibold tracking-tight">{$localizedText.app.homeActions.newNote}</span>
                    <span class="mt-1 block text-xs text-[var(--text-secondary)]">{$localizedText.app.homeActions.newNoteHint}</span>
                  </button>
                  <button
                    on:click={createTodayFromHome}
                    class="group min-h-20 rounded-2xl border border-[var(--border-subtle)] bg-transparent px-5 py-4 transition hover:-translate-y-0.5 hover:border-[var(--text-primary)] hover:bg-[var(--bg-secondary)]/50"
                  >
                    <span class="block text-sm font-semibold tracking-tight">{$localizedText.app.homeActions.today}</span>
                    <span class="mt-1 block text-xs text-[var(--text-secondary)]">{$localizedText.app.homeActions.todayHint}</span>
                  </button>
                  <button
                    on:click={() => openCommandPalette('commands')}
                    class="group min-h-20 rounded-2xl border border-[var(--border-subtle)] bg-transparent px-5 py-4 transition hover:-translate-y-0.5 hover:border-[var(--text-primary)] hover:bg-[var(--bg-secondary)]/50"
                  >
                    <span class="block text-sm font-semibold tracking-tight">{$localizedText.app.homeActions.commandPalette}</span>
                    <span class="mt-1 block text-xs text-[var(--text-secondary)]">{$localizedText.app.homeActions.commandPaletteHint}</span>
                  </button>
                  {#if homeRecentNotes.length > 0}
                    <button
                      on:click={openContinueWork}
                      class="group min-h-20 rounded-2xl border border-[var(--border-subtle)] bg-transparent px-5 py-4 transition hover:-translate-y-0.5 hover:border-[var(--text-primary)] hover:bg-[var(--bg-secondary)]/50"
                    >
                      <span class="block text-sm font-semibold tracking-tight">{$localizedText.app.homeActions.continueWork}</span>
                      <span class="mt-1 block text-xs text-[var(--text-secondary)]">{$localizedText.app.homeActions.continueWorkHint}</span>
                    </button>
                  {/if}
                </div>
              {/if}
              {#if isMobile}
                <button
                  on:click={toggleSidebar}
                  class="mt-8 h-11 px-5 rounded-full border border-[var(--border-subtle)] text-sm font-medium hover:border-[var(--text-primary)] transition"
                >
                  {$localizedText.app.openMenu}
                </button>
              {/if}
            </div>
          </div>
          {/if}
        </Route>
        {/if}
      </main>
    </div>
  </div>
</Router>
