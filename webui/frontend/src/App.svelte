<script>
  import { onMount, tick } from 'svelte';
  import { Router, Route, navigate } from 'svelte-routing';
  import Sidebar from './components/Sidebar.svelte';
  import Header from './components/Header.svelte';
  import NotePage from './components/NotePage.svelte';
  import NoteBoard from './components/NoteBoard.svelte';
  import Settings from './components/Settings.svelte';
  import TrashView from './components/TrashView.svelte';
  import TemplateManager from './components/TemplateManager.svelte';
  import SearchResults from './components/SearchResults.svelte';
  import CommandPalette from './components/CommandPalette.svelte';
  import ModalShell from './components/ModalShell.svelte';
  import TooltipIconButton from './components/TooltipIconButton.svelte';
  import { themes } from './lib/themes.js';
  import { fontOptions, fontSizeOptions, lineHeightOptions, contentWidthOptions, editorFontSizeOptions } from './lib/fonts.js';
  import { applyTheme, applyTypographyVars, detectDarkMode, normalizeNotePath } from './lib/app-shell.js';
  import { localizedText } from './lib/strings.js';
  import { activeTheme, themeMode, fontFamily, fontSize, lineHeight, contentWidth, editorFontSize, noteView, searchQuery, searchResults, isSearching } from './stores.js';
  import { createNoteRequest } from './lib/sidebar-api.js';
  import { loadTemplateSettings } from './lib/template-library.js';

  const SIDEBAR_WIDTH_KEY = 'sidebarWidth';
  const SIDEBAR_DEFAULT_WIDTH = 336;
  const SIDEBAR_LAPTOP_WIDTH = 280;
  const SIDEBAR_COMPACT_WIDTH = 304;
  const SIDEBAR_MIN_WIDTH = 256;
  const SIDEBAR_MAX_WIDTH = 420;
  const BOARD_NOTES_PAGE_SIZE = 36;
  const LAST_APP_ROUTE_KEY = 'lastAppRoute';

  function storedLastKnownRoute() {
    if (typeof sessionStorage === 'undefined') return '/';
    const storedRoute = sessionStorage.getItem(LAST_APP_ROUTE_KEY) || '/';
    return isKnownAppRoute(storedRoute) ? storedRoute : '/';
  }

  const initialRouteWasUnknown = typeof window !== 'undefined' && !isKnownAppRoute(window.location.pathname);
  const initialRoutePath = typeof window !== 'undefined' && isKnownAppRoute(window.location.pathname)
    ? window.location.pathname
    : storedLastKnownRoute();
  if (initialRouteWasUnknown) {
    window.history.replaceState({}, '', initialRoutePath);
  }

  let isDarkMode = false;
  let sidebarOpen = true;
  let isMobile = typeof window !== 'undefined' ? window.innerWidth < 1024 : false;
  let headerComponent;
  let sidebarComponent;
  let commandPaletteOpen = false;
  let commandPaletteMode = 'commands';
  let sidebarWidth = getInitialSidebarWidth();
  let isResizingSidebar = false;
  let systemThemeSignal = 0;
  let routePath = initialRoutePath;
  let lastKnownAppRoute = initialRoutePath;
  $: isDashboardRoute = routePath === '/';
  $: isNoteOpen = routePath.startsWith('/notes/');
  $: showHeaderBack = !isDashboardRoute;
  let homeRecentNotes = [];
  let homeRecentHasMore = true;
  let homeRecentLoading = false;
  let continueWorkOpen = false;
  let searchUrlReady = false;
  let urlSearchQuery = searchParamFromUrl().trim();
  let restoredInitialUrlSearch = false;
  let showCreateNoteModal = false;
  let newNoteTitle = '';
  let newNoteCategory = '';
  let isCreating = false;
  let savedQuickNote = null;
  let quickNoteIssue = '';
  let syncError = '';
  let gitConfigured = false;
  if (urlSearchQuery) $searchQuery = urlSearchQuery;

  $: isDarkMode = typeof window !== 'undefined' ? (systemThemeSignal, detectDarkMode($themeMode)) : false;
  $: if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', isDarkMode);
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
  $: activeSearchQuery = isDashboardRoute ? ($searchQuery.trim() || urlSearchQuery) : '';
  $: if (!searchUrlReady && isDashboardRoute && urlSearchQuery && !restoredInitialUrlSearch) {
    restoredInitialUrlSearch = true;
    $searchQuery = urlSearchQuery;
    void runRestoredSearch(urlSearchQuery);
  }

  function isKnownAppRoute(pathname) {
    return pathname === '/'
      || pathname === '/settings'
      || pathname === '/trash'
      || pathname === '/templates'
      || pathname.startsWith('/notes/');
  }

  function setRoutePath(pathname) {
    routePath = pathname;
    if (isKnownAppRoute(pathname)) {
      lastKnownAppRoute = pathname;
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(LAST_APP_ROUTE_KEY, pathname);
    }
  }

  function replaceUnknownRouteWithLastKnown() {
    const fallbackRoute = isKnownAppRoute(lastKnownAppRoute) ? lastKnownAppRoute : '/';
    routePath = fallbackRoute;
    if (fallbackRoute === '/') $noteView = 'board';
    if (fallbackRoute.startsWith('/notes/')) $noteView = 'list';
    if (typeof window !== 'undefined' && window.location.pathname !== fallbackRoute) {
      window.history.replaceState({}, '', fallbackRoute);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else {
      navigate(fallbackRoute, { replace: true });
    }
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
    const wasMobile = isMobile;
    isMobile = window.innerWidth < 1024;
    if (isMobile && sidebarOpen) sidebarOpen = false;
    if (wasMobile && !isMobile) sidebarOpen = false;
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
    if (isDashboardRoute && (((e.metaKey || e.ctrlKey) && e.shiftKey && key === 'f') || (!isTypingTarget && key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey))) {
      e.preventDefault();
      headerComponent?.openSearch?.();
    }
  }

  onMount(() => {
    updateMobileState();
    setRoutePath(window.location.pathname);
    if (initialRouteWasUnknown) navigate(routePath, { replace: true });
    if (!isKnownAppRoute(routePath)) {
      replaceUnknownRouteWithLastKnown();
    }
    if (routePath === '/') $noteView = 'board';
    if (routePath === '/' && $noteView === 'board' && !isMobile) sidebarOpen = false;
    if ($noteView === 'board' && routePath.startsWith('/notes/')) {
      setRoutePath('/');
      navigate('/');
    }
    void loadHomeRecentNotes();
    void loadShellSettings();
    void loadTemplateSettings();
    restoreSearchFromUrl();
    searchUrlReady = true;
    const handlePopState = () => {
      setRoutePath(window.location.pathname);
      if (!isKnownAppRoute(routePath)) {
        replaceUnknownRouteWithLastKnown();
        if (routePath !== '/') clearSearch();
        if (routePath === '/') void loadHomeRecentNotes();
        return;
      }
      if (routePath !== '/') clearSearch();
    };
    window.addEventListener('popstate', handlePopState);
    const systemThemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => { systemThemeSignal += 1; };
    systemThemeQuery?.addEventListener?.('change', handleSystemThemeChange);
    systemThemeQuery?.addListener?.(handleSystemThemeChange);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      systemThemeQuery?.removeEventListener?.('change', handleSystemThemeChange);
      systemThemeQuery?.removeListener?.(handleSystemThemeChange);
    };
  });

  $: if (searchUrlReady && isDashboardRoute) syncSearchUrl($searchQuery);

  async function loadShellSettings() {
    // Load theme from server
    try {
      const r = await fetch('/api/settings');
      if (r.ok) {
        const s = await r.json();
        if (s.theme && themes[s.theme]) $activeTheme = s.theme;
        if (['system', 'light', 'dark'].includes(s.themeMode)) $themeMode = s.themeMode;
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
    if (!isDashboardRoute) return;
    if (restoredInitialUrlSearch) return;
    const query = ($searchQuery || urlSearchQuery || searchParamFromUrl()).trim();
    if (!query) return;
    urlSearchQuery = query;
    $searchQuery = query;
    void runRestoredSearch(query);
  }

  async function openNewNoteFlow(event = null) {
    newNoteTitle = '';
    newNoteCategory = event?.detail?.category || '';
    showCreateNoteModal = true;
  }

  function padDatePart(n) { return String(n).padStart(2, '0'); }
  function formatTodayNoteTitle(date = new Date()) {
    return [padDatePart(date.getDate()), padDatePart(date.getMonth() + 1), padDatePart(date.getFullYear() % 100), padDatePart(date.getHours()), padDatePart(date.getMinutes()), padDatePart(date.getSeconds())].join('-');
  }

  function openCreatedNote(data, fallbackTitle) {
    if (!data?.path) return;
    handleNavigate({
      detail: {
        path: data.path,
        name: data.name || fallbackTitle,
        isDir: false,
      },
    });
  }

  async function createTodayFromHome() {
    try {
      isCreating = true;
      const title = formatTodayNoteTitle();
      const data = await createNoteRequest({ title, category: 'Daily', tags: [], content: '' });
      showCreateNoteModal = false;
      if (isMobile) sidebarOpen = false;
      if (sidebarComponent) await sidebarComponent.loadTree();
      await loadHomeRecentNotes();
      openCreatedNote(data, title);
    } catch (err) {
      console.error('Failed to create today note:', err);
    } finally {
      isCreating = false;
    }
  }

  async function submitCreateNote() {
    if (!newNoteTitle.trim()) return;
    try {
      isCreating = true;
      const title = newNoteTitle.trim();
      const data = await createNoteRequest({ title, category: newNoteCategory, tags: [], content: '' });
      showCreateNoteModal = false;
      newNoteTitle = '';
      newNoteCategory = '';
      if (isMobile) sidebarOpen = false;
      if (sidebarComponent) await sidebarComponent.loadTree();
      await loadHomeRecentNotes();
      openCreatedNote(data, title);
    } catch (err) {
      console.error('Failed to create note:', err);
    } finally {
      isCreating = false;
    }
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

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }
  function openCommandPalette(mode = 'commands') { commandPaletteMode = mode; commandPaletteOpen = true; }
  function closeCommandPalette() { commandPaletteOpen = false; }
  function showDashboard({ refreshTree = false, replace = false, closeSidebar = true } = {}) {
    $noteView = 'board';
    if (closeSidebar) sidebarOpen = false;
    setRoutePath('/');
    navigate('/', { replace });
    clearSearch();
    void loadHomeRecentNotes();
    if (refreshTree && sidebarComponent) sidebarComponent.loadTree();
  }
  function goHome() { showDashboard({ closeSidebar: false }); }
  function openSettings() {
    setRoutePath('/settings');
    clearSearch();
    navigate('/settings');
  }
  function openTrash() {
    setRoutePath('/trash');
    clearSearch();
    navigate('/trash');
  }
  function openTemplatesManager() {
    setRoutePath('/templates');
    clearSearch();
    navigate('/templates');
  }

  function createQuickNoteFromHeader() {
    sidebarComponent?.createQuickNoteFromClipboard?.();
  }

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
    const nextPath = `/notes/${normalizeNotePath(event.detail.path)}`;
    setRoutePath(nextPath);
    navigate(nextPath);
    if (event.detail.path && sidebarComponent) sidebarComponent.setSelected(event.detail.path);
    if (isMobile && !event.detail.isDir) sidebarOpen = false;
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

  function handleNoteColorChanged(event) {
    const { path, color } = event.detail || {};
    if (!path) return;
    homeRecentNotes = homeRecentNotes.map((note) => note.path === path ? { ...note, color } : note);
    if (sidebarComponent) sidebarComponent.loadTree();
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
    if (event.detail === 'openSettings') openSettings();
    if (event.detail === 'toggleSidebar') toggleSidebar();
  }

  function refreshAfterTrashChange() {
    void loadHomeRecentNotes();
    sidebarComponent?.loadTree?.();
  }

  function handleNotesImported() {
    sidebarComponent?.loadTree?.();
    void loadHomeRecentNotes();
  }

  function rememberSettingsRoute() {
    setRoutePath('/settings');
  }

  async function handleTrashRestored(event) {
    const note = event.detail;
    if (!note?.path) {
      refreshAfterTrashChange();
      return;
    }

    handleNavigate({
      detail: {
        path: note.path,
        name: note.name || note.path.split('/').pop(),
        isDir: false,
      },
    });
    void loadHomeRecentNotes();
    if (sidebarComponent) {
      await sidebarComponent.loadTree();
      sidebarComponent.setSelected(note.path);
    }
  }

</script>

<svelte:window on:resize={updateMobileState} on:keydown={handleKeydown} />

<Router>
  <div class="h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans antialiased overflow-hidden">
    <Header
      bind:this={headerComponent}
      on:toggleSidebar={toggleSidebar}
      on:goHome={goHome}
      on:createQuickNote={createQuickNoteFromHeader}
      noteOpen={isNoteOpen}
      showBack={showHeaderBack}
      showSearch={isDashboardRoute}
      {sidebarOpen}
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
               {!sidebarOpen ? (isMobile ? '-translate-x-full' : 'w-0') : ''}
               overflow-hidden"
        data-testid="sidebar-shell"
        style={!isMobile && sidebarOpen ? `width: ${sidebarWidth}px;` : ''}
      >
        <Sidebar
          bind:this={sidebarComponent}
          on:navigate={handleNavigate}
          on:fileDeleted={() => showDashboard({ replace: true, closeSidebar: false })}
          on:openSettings={openSettings}
          on:openTrash={openTrash}
          on:openTemplatesManager={openTemplatesManager}
          on:openQuickSwitcher={() => openCommandPalette('notes')}
          on:toggleSidebar={toggleSidebar}
          on:openCreateNote={openNewNoteFlow}
          on:quickNoteSaved={(e) => { savedQuickNote = e.detail; if (isMobile) sidebarOpen = false; }}
          on:quickNoteIssue={(e) => { quickNoteIssue = e.detail; if (isMobile) sidebarOpen = false; }}
          on:syncError={(e) => { syncError = e.detail; if (isMobile) sidebarOpen = false; }}
          mobile={isMobile}
          {gitConfigured}
        />
        {#if !isMobile && sidebarOpen}
          <span class="pointer-events-none absolute inset-y-0 right-0 z-10 w-px bg-[var(--border-subtle)]"></span>
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
          <NotePage path={params['*']} on:navigate={handleNavigate} on:fileDeleted={() => showDashboard({ refreshTree: true, replace: true, closeSidebar: false })} on:fileOpened={(e) => { if (sidebarComponent) sidebarComponent.setSelected(e.detail); }} on:noteColorChanged={handleNoteColorChanged} on:revealInTree={revealInTree} />
        </Route>
        <Route path="/settings">
          <Settings on:archivePickerOpened={rememberSettingsRoute} on:notesImported={handleNotesImported} />
        </Route>
        <Route path="/trash">
          <TrashView on:restored={handleTrashRestored} on:deleted={refreshAfterTrashChange} />
        </Route>
        <Route path="/templates">
          <TemplateManager />
        </Route>
        <Route path="/">
          <div class="h-full overflow-y-auto px-4 py-4 sm:py-6 lg:px-12 lg:py-8" data-board-scroll on:scroll={handleBoardScroll}>
            <div class="mx-auto max-w-6xl">
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
              {/if}
            </div>
          </div>
        </Route>
        <Route path="*">
          {#if lastKnownAppRoute === '/settings'}
            <Settings on:archivePickerOpened={rememberSettingsRoute} on:notesImported={handleNotesImported} />
          {/if}
        </Route>
        {/if}
      </main>
    </div>
  </div>

  {#if showCreateNoteModal}
    <ModalShell title={$localizedText.sidebar.modals.newNote} widthClass="w-[min(92vw,40rem)]" closeOnEscape={true} on:close={() => showCreateNoteModal = false}>
      <div class="space-y-7">
        <section>
          <div class="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)]/70">
            {$localizedText.sidebar.modals.createStart}
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              class="min-h-24 rounded-2xl border border-[var(--border-subtle)] p-4 text-left transition hover:border-[var(--text-secondary)]/50 hover:bg-[var(--bg-secondary)]/45 disabled:opacity-40"
              on:click={createTodayFromHome}
              disabled={isCreating}
            >
              <span class="block text-sm font-semibold">{$localizedText.sidebar.modals.todayNote}</span>
              <span class="mt-2 block text-[10px] uppercase tracking-[0.14em] leading-relaxed text-[var(--text-secondary)]/60">{$localizedText.sidebar.modals.todayNoteHint}</span>
            </button>
            <button
              type="button"
              class="min-h-24 rounded-2xl border border-[var(--border-subtle)] p-4 text-left transition hover:border-[var(--text-secondary)]/50 hover:bg-[var(--bg-secondary)]/45"
              on:click={async () => {
                showCreateNoteModal = false;
                if (isMobile) {
                  sidebarOpen = true;
                  await tick();
                }
                sidebarComponent?.openTemplates();
              }}
            >
              <span class="block text-sm font-semibold">{$localizedText.sidebar.modals.fromTemplate}</span>
              <span class="mt-2 block text-[10px] uppercase tracking-[0.14em] leading-relaxed text-[var(--text-secondary)]/60">{$localizedText.sidebar.modals.fromTemplateHint}</span>
            </button>
          </div>
        </section>

        <div>
          <label for="app-note-title" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">{$localizedText.sidebar.modals.title}</label>
          <input id="app-note-title" type="text" bind:value={newNoteTitle} placeholder={$localizedText.sidebar.modals.noteTitlePlaceholder} class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none" on:keydown={(e) => { if (e.key === 'Enter' && newNoteTitle.trim()) submitCreateNote(); if (e.key === 'Escape') showCreateNoteModal = false; }} autofocus />
          <p class="mt-3 max-w-lg text-xs leading-relaxed text-[var(--text-secondary)]/65">{$localizedText.sidebar.modals.titleHint}</p>
        </div>
      </div>
      <div class="flex gap-6 mt-10">
        <button on:click={() => showCreateNoteModal = false} class="flex-1 text-sm font-medium hover:opacity-60 transition">{$localizedText.sidebar.modals.cancel}</button>
        <button on:click={submitCreateNote} disabled={isCreating || !newNoteTitle.trim()} class="flex-1 text-sm font-bold uppercase tracking-widest hover:opacity-60 transition disabled:opacity-30">
          {isCreating ? $localizedText.sidebar.modals.creating : $localizedText.sidebar.modals.create}
        </button>
      </div>
    </ModalShell>
  {/if}

  {#if savedQuickNote}
    <ModalShell title={$localizedText.sidebar.modals.quickNoteSaved} widthClass="w-[min(92vw,28rem)]" closeOnEscape={true} on:close={() => savedQuickNote = null}>
      <div class="space-y-4">
        <p class="text-sm leading-relaxed text-[var(--text-secondary)]">
          {$localizedText.sidebar.modals.quickNoteSavedHint}
        </p>
        <div class="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/35 px-4 py-3">
          <div class="truncate text-sm font-semibold">{savedQuickNote.name}</div>
          <div class="mt-1 truncate text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]/60">{savedQuickNote.path.replace(/^notes\//, '')}</div>
        </div>
      </div>
      <div class="mt-8 flex gap-4">
        <button type="button" on:click={() => savedQuickNote = null} class="flex-1 text-sm font-medium transition hover:opacity-60">
          {$localizedText.sidebar.modals.stayHere}
        </button>
        <button type="button" on:click={() => { const note = savedQuickNote; savedQuickNote = null; handleNavigate({ detail: note }); }} class="flex-1 text-sm font-bold uppercase tracking-widest transition hover:opacity-60">
          {$localizedText.sidebar.modals.openNote}
        </button>
      </div>
    </ModalShell>
  {/if}

  {#if quickNoteIssue}
    <ModalShell title={$localizedText.sidebar.modals.quickNoteNotCreated} widthClass="w-[min(92vw,28rem)]" closeOnEscape={true} on:close={() => quickNoteIssue = ''}>
      <p class="text-sm leading-relaxed text-[var(--text-secondary)]">
        {quickNoteIssue}
      </p>
      <div class="mt-8 flex justify-center">
        <button type="button" on:click={() => quickNoteIssue = ''} class="text-sm font-bold uppercase tracking-widest transition hover:opacity-60">
          {$localizedText.sidebar.modals.understood}
        </button>
      </div>
    </ModalShell>
  {/if}

  {#if syncError}
    <ModalShell title={$localizedText.sidebar.errors.syncFailed} widthClass="w-[min(92vw,28rem)]" closeOnEscape={true} on:close={() => syncError = ''}>
      <p class="text-sm leading-relaxed text-[var(--text-secondary)]">
        {syncError}
      </p>
      <div class="mt-8 flex justify-center">
        <button type="button" on:click={() => syncError = ''} class="text-sm font-bold uppercase tracking-widest transition hover:opacity-60">
          {$localizedText.sidebar.modals.understood}
        </button>
      </div>
    </ModalShell>
  {/if}
</Router>
