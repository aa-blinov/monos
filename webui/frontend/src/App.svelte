<script>
  import { shortcutLabel } from './lib/shortcut-label.js';
  import { onDestroy, onMount, tick } from 'svelte';
import { get } from 'svelte/store';
  import { Router, Route, navigate } from 'svelte-routing';
  import Sidebar from './components/Sidebar.svelte';
  import Header from './components/Header.svelte';
  import NotePage from './components/NotePage.svelte';
  import NoteBoard from './components/NoteBoard.svelte';
  import Settings from './components/Settings.svelte';
  import SavedSearchesPanel from './components/SavedSearchesPanel.svelte';
  import TagPanel from './components/TagPanel.svelte';
  import TrashView from './components/TrashView.svelte';
  import SearchResults from './components/SearchResults.svelte';
  import CommandPalette from './components/CommandPalette.svelte';
  import ModalShell from './components/ModalShell.svelte';
  import CreateNoteModal from './components/CreateNoteModal.svelte';
  import ContinueWorkModal from './components/ContinueWorkModal.svelte';
  import InfoModal from './components/InfoModal.svelte';
  import QuickNoteSavedModal from './components/QuickNoteSavedModal.svelte';
  import TooltipIconButton from './components/TooltipIconButton.svelte';
  import { themes } from './lib/themes.js';
  import { fontOptions, fontSizeOptions, lineHeightOptions, contentWidthOptions, editorFontSizeOptions } from './lib/fonts.js';
  import { applyTheme, applyTypographyVars, detectDarkMode, normalizeNotePath } from './lib/app-shell.js';
  import { localizedText } from './lib/strings.js';
  import { activeTheme, themeMode, fontFamily, fontSize, lineHeight, contentWidth, editorFontSize, noteView, searchQuery, searchResults, isSearching, editorState, noteSaveSignal } from './stores.js';
  import { homeRecentNotes, homeRecentHasMore, homeRecentLoading, homeRecentError, loadHomeRecentNotes } from './lib/dashboard.js';
import { pickAndImport } from './lib/backup.js';
import { focusNoteBody } from './stores.js';
import { DEFAULT_SYNC_MINUTES, normalizeSyncMinutes, setAutoSyncPolicy, setBusyCheck, startAutoSync, stopAutoSync } from './lib/git-sync.js';
  import { sidebarOpen, sidebarWidth, isResizingSidebar, toggleSidebar, setSidebarOpen, setSidebarWidth, saveSidebarWidth, defaultSidebarWidth, SIDEBAR_CONSTANTS } from './lib/sidebar.js';
  import { commandPaletteOpen, commandPaletteMode, openCommandPalette, closeCommandPalette } from './lib/command-palette.js';
  import { urlSearchQuery, searchUrlReady, restoredInitialUrlSearch, searchParamFromUrl, syncSearchUrl } from './lib/search-query.js';
  import { loadShellSettings } from './lib/shell-settings.js';
  import { runSearch } from './lib/search-results.js';
  import { createNoteRequest, renameItemRequest } from './lib/sidebar-api.js';
  import { announceNoteLinksUpdated, flushOpenNote, NOTE_LINKS_UPDATED_EVENT } from './lib/note-refresh.js';
  import { loadTemplateSettings } from './lib/template-library.js';

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

  let tagPanelOpen = false;
  let isDarkMode = false;
  let isMobile = typeof window !== 'undefined' ? window.innerWidth < 1024 : false;
  let headerComponent;
  let sidebarComponent;
  let linksNotice = '';
  let linksNoticeTimer;

  function showLinksNotice(event) {
    const { updatedLinks, failedPaths = [] } = event.detail;
    const parts = [];
    if (updatedLinks) parts.push($localizedText.app.linksUpdated(updatedLinks));
    if (failedPaths.length) parts.push($localizedText.app.linksNotUpdated(failedPaths.length));
    if (!parts.length) return;
    linksNotice = parts.join(', ');
    clearTimeout(linksNoticeTimer);
    linksNoticeTimer = setTimeout(() => { linksNotice = ''; }, 4000);
  }

  onMount(() => window.addEventListener(NOTE_LINKS_UPDATED_EVENT, showLinksNotice));
  onDestroy(() => window.removeEventListener(NOTE_LINKS_UPDATED_EVENT, showLinksNotice));
  let systemThemeSignal = 0;
  let routePath = initialRoutePath;
  let lastKnownAppRoute = initialRoutePath;
  $: isDashboardRoute = routePath === '/';
  $: isNoteOpen = routePath.startsWith('/notes/');
  $: showHeaderBack = !isDashboardRoute;

  let boardScrollContainer = null;
  let boardScrollTop = 0;
  let pendingBoardScrollTop = null;
  let dashboardNeedsRefresh = false;
  let lastSeenNoteSaveAt = 0;
  let continueWorkOpen = false;
  let autoPullState = { conflicts: false, received: 0 };
  let importStatus = '';
  let importError = '';

  let showCreateNoteModal = false;
  let createNoteInitialCategory = '';
  let savedQuickNote = null;
  let quickNoteIssue = '';
  let syncError = '';
  let gitConfigured = false;
  if (!$urlSearchQuery) urlSearchQuery.set(searchParamFromUrl().trim());
  if ($urlSearchQuery) $searchQuery = $urlSearchQuery;

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
  // An emptied search field ends the search. The query from the URL only seeds the
  // field on first load (below); falling back to it here kept old results on screen.
  $: activeSearchQuery = isDashboardRoute ? $searchQuery.trim() : '';
  $: if (!$searchUrlReady && isDashboardRoute && $urlSearchQuery && !$restoredInitialUrlSearch) {
    restoredInitialUrlSearch.set(true);
    $searchQuery = $urlSearchQuery;
    void runRestoredSearch($urlSearchQuery);
  }
  $: if (boardScrollContainer && isDashboardRoute && pendingBoardScrollTop !== null) {
    restoreBoardScrollPosition();
  }
  $: if ($noteSaveSignal?.savedAt && $noteSaveSignal.savedAt !== lastSeenNoteSaveAt) {
    handleNoteSaved($noteSaveSignal);
  }

  function isKnownAppRoute(pathname) {
    return pathname === '/'
      || pathname === '/settings'
      || pathname === '/trash'
      || pathname === '/templates'
      || pathname === '/properties'
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

  function updateMobileState() {
    const wasMobile = isMobile;
    isMobile = window.innerWidth < 1024;
    if (isMobile && $sidebarOpen) setSidebarOpen(false);
    if (wasMobile && !isMobile) setSidebarOpen(false);
    if (!isMobile) setSidebarWidth($sidebarWidth);
  }

  function handleKeydown(e) {
    // Escape closes the narrow-window menu, unless the palette or a dialog already used it.
    if (e.key === 'Escape' && isMobile && $sidebarOpen && !e.defaultPrevented) {
      setSidebarOpen(false);
      return;
    }
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

  /**
   * A background pull must never steal focus or interrupt typing, so it only
   * refreshes the board and raises a badge. Conflicts are surfaced where the
   * user already goes to resolve them, not as a modal out of nowhere.
   */
  onDestroy(() => stopAutoSync());

  /**
   * The automatic sync runs from launch with the choices the person made in Settings. A round while Git is not
   * connected is answered 400 and skipped, so nothing has to be checked first.
   */
  async function startAutoSyncWithSavedChoices() {
    try {
      const response = await fetch('/api/settings');
      const saved = response.ok ? await response.json() : {};
      setAutoSyncPolicy({
        minutes: normalizeSyncMinutes(saved.git_auto_sync_minutes ?? DEFAULT_SYNC_MINUTES),
        upload: saved.git_auto_upload !== false,
      });
    } catch {
      // offline: the defaults apply
    }
    startAutoSync({ onResult: handleAutoPullResult });
  }

  function handleAutoPullResult(result) {
    if (!result) return;
    autoPullState = { conflicts: Boolean(result.conflicts), received: result.received || 0 };
    if (result.received > 0) void loadHomeRecentNotes();
  }

  onMount(() => {
    setSidebarOpen(true);
    updateMobileState();
    setRoutePath(window.location.pathname);
    if (initialRouteWasUnknown) navigate(routePath, { replace: true });
    if (!isKnownAppRoute(routePath)) {
      replaceUnknownRouteWithLastKnown();
    }
    if (routePath === '/') $noteView = 'board';
    if ($noteView === 'board' && routePath.startsWith('/notes/')) {
      setRoutePath('/');
      navigate('/');
    }
    void loadHomeRecentNotes();
    void applyShellSettings();
    void loadTemplateSettings();
    // Pull on launch and every few minutes. Uploads stay manual; a stale device
    // is the main source of conflicts on a second machine.
    // Only when a remote is configured: without one, every launch would fire a
    // request that can only answer 400. The local `gitConfigured` flag is never
    // assigned here (the sidebar keeps its own), so ask the backend once.
    setBusyCheck(() => {
      const state = get(editorState);
      return Boolean(state?.saving || state?.dirty);
    });
    void startAutoSyncWithSavedChoices();
    restoreSearchFromUrl();
    searchUrlReady.set(true);
    const handlePopState = () => {
      setRoutePath(window.location.pathname);
      if (!isKnownAppRoute(routePath)) {
        replaceUnknownRouteWithLastKnown();
        if (routePath !== '/') clearSearch();
        if (routePath === '/') void loadHomeRecentNotes();
        return;
      }
      if (routePath === '/') {
        $noteView = 'board';
        enterDashboardFromNote();
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

  $: if ($searchUrlReady && isDashboardRoute) syncSearchUrl($searchQuery);

  async function applyShellSettings() {
    const settings = await loadShellSettings(themes);
    if (settings?.theme) $activeTheme = settings.theme;
    if (settings?.themeMode) $themeMode = settings.themeMode;
    applyTheme($activeTheme, isDarkMode, themes);
  }

  function clearSearch() {
    urlSearchQuery.set('');
    $searchQuery = '';
    $searchResults = [];
    $isSearching = false;
  }

  async function runRestoredSearch(query) {
    await runSearch(query);
  }

  function restoreSearchFromUrl() {
    if (!isDashboardRoute) return;
    if ($restoredInitialUrlSearch) return;
    const query = ($searchQuery || $urlSearchQuery || searchParamFromUrl()).trim();
    if (!query) return;
    urlSearchQuery.set(query);
    $searchQuery = query;
    void runRestoredSearch(query);
  }

  function openNewNoteFlow(event = null) {
    createNoteInitialCategory = event?.detail?.category || '';
    showCreateNoteModal = true;
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

  async function handleNoteCreated(data, title) {
    if (data?.path) focusNoteBody.set(data.path);
    if (isMobile) setSidebarOpen(false);
    if (sidebarComponent) await sidebarComponent.loadTree();
    await loadHomeRecentNotes();
    openCreatedNote(data, title);
  }

  async function handlePickTemplate() {
    if (isMobile) {
      setSidebarOpen(true);
      await tick();
    }
    sidebarComponent?.openTemplates();
  }

  function handleBoardScroll(event) {
    if (pendingBoardScrollTop !== null) return;
    const container = event.currentTarget;
    boardScrollTop = container.scrollTop || 0;
    if ($noteView !== 'board' || !$homeRecentHasMore || $homeRecentLoading) return;
    if (container.scrollHeight - container.scrollTop - container.clientHeight < 640) {
      void loadHomeRecentNotes({ append: true });
    }
  }

  function rememberBoardScrollPosition() {
    if (!boardScrollContainer) return;
    boardScrollTop = boardScrollContainer.scrollTop || 0;
  }

  function scheduleBoardScrollRestore() {
    pendingBoardScrollTop = boardScrollTop;
  }

  function restoreBoardScrollPosition() {
    if (pendingBoardScrollTop === null || !boardScrollContainer) return;
    const savedScrollTop = pendingBoardScrollTop;
    boardScrollContainer.scrollTop = savedScrollTop;
    boardScrollTop = savedScrollTop;
    pendingBoardScrollTop = null;
  }

  async function refreshDashboardAfterNoteSave() {
    rememberBoardScrollPosition();
    const savedScrollTop = boardScrollTop;
    dashboardNeedsRefresh = false;
    await loadHomeRecentNotes();
    pendingBoardScrollTop = savedScrollTop;
    await tick();
    restoreBoardScrollPosition();
  }

  function shouldRefreshDashboardOnReturn() {
    return dashboardNeedsRefresh || $editorState.dirty || $editorState.saving;
  }

  function enterDashboardFromNote() {
    if (shouldRefreshDashboardOnReturn()) {
      refreshDashboardAfterNoteSave();
      return;
    }
    scheduleBoardScrollRestore();
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
    homeRecentNotes.update((current) => {
      const hasNote = current.some((item) => item.path === note.path);
      return hasNote
        ? current.map((item) => item.path === note.path ? { ...item, ...note } : item)
        : [note, ...current];
    });
  }

  function openContinueWork() {
    if ($homeRecentNotes.length === 0) {
      openCommandPalette('notes');
      return;
    }
    continueWorkOpen = true;
  }

  function startArchiveImport() {
    importStatus = '';
    importError = '';
    pickAndImport({
      onDone: async (data) => {
        importStatus = $localizedText.settings.importComplete(data);
        await loadHomeRecentNotes();
      },
      onError: (detail) => {
        importError = $localizedText.settings.backupError(detail);
      },
    });
  }

  function openAllRecentNotes() {
    continueWorkOpen = false;
    openCommandPalette('notes');
  }


  function showDashboard({ refreshTree = false, replace = false, closeSidebar = true } = {}) {
    const shouldRestoreBoardScroll = isNoteOpen && !refreshTree;
    $noteView = 'board';
    // The tree stays where the user left it on a wide screen; only the narrow menu closes here.
    if (closeSidebar && isMobile) setSidebarOpen(false);
    setRoutePath('/');
    navigate('/', { replace });
    clearSearch();
    if (shouldRestoreBoardScroll) {
      enterDashboardFromNote();
    } else {
      void loadHomeRecentNotes();
    }
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

  function openPropertiesView() {
    setRoutePath('/properties');
    clearSearch();
    navigate('/properties');
  }

  function openTagPanel() {
    tagPanelOpen = true;
  }

  let savedSearchPanelOpen = false;
  /** Запрос, который панель предложит сохранить. */
  let pendingSearchQuery = '';

  function openSavedSearchPanel(event) {
    // Кнопка в строке поиска передаёт текущий запрос — панель сохранит именно его.
    pendingSearchQuery = typeof event?.detail === 'string' ? event.detail : $searchQuery.trim();
    savedSearchPanelOpen = true;
  }

  /** Запуск сохранённого поиска: кладём запрос в строку и уходим на доску. */
  function runSavedSearch(event) {
    const query = String(event?.detail?.query || '').trim();
    if (!query) return;
    savedSearchPanelOpen = false;
    showDashboard({ closeSidebar: true });
    searchQuery.set(query);
  }

  /** Клик по тегу в панели ведёт в поиск по нему — панель это вход, а не тупик. */
  function searchByTag(event) {
    tagPanelOpen = false;
    showDashboard({ closeSidebar: true });
    searchQuery.set(`#${event.detail.tag}`);
  }

  function createQuickNoteFromHeader() {
    sidebarComponent?.createQuickNoteFromClipboard?.();
  }

  function handleSidebarResize(event) {
    setSidebarWidth(event.clientX);
  }

  function stopSidebarResize() {
    if (!$isResizingSidebar) return;
    isResizingSidebar.set(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    saveSidebarWidth($sidebarWidth);
    window.removeEventListener('pointermove', handleSidebarResize);
    window.removeEventListener('pointerup', stopSidebarResize);
    window.removeEventListener('mousemove', handleSidebarResize);
    window.removeEventListener('mouseup', stopSidebarResize);
  }

  function startSidebarResize(event) {
    if (isMobile || !$sidebarOpen || $isResizingSidebar) return;
    event.preventDefault();
    isResizingSidebar.set(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handleSidebarResize);
    window.addEventListener('pointerup', stopSidebarResize);
    window.addEventListener('mousemove', handleSidebarResize);
    window.addEventListener('mouseup', stopSidebarResize);
  }

  function applySidebarWidth(width) {
    setSidebarWidth(width);
    saveSidebarWidth($sidebarWidth);
  }

  function resetSidebarWidth() {
    setSidebarWidth(defaultSidebarWidth());
  }

  function handleSidebarResizeKeydown(event) {
    if (isMobile || !$sidebarOpen) return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setSidebarWidth($sidebarWidth - 16);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setSidebarWidth($sidebarWidth + 16);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setSidebarWidth(SIDEBAR_CONSTANTS.MIN_WIDTH);
    } else if (event.key === 'End') {
      event.preventDefault();
      setSidebarWidth(SIDEBAR_CONSTANTS.MAX_WIDTH);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      resetSidebarWidth();
    }
  }

  function handleNavigate(event) {
    if (isDashboardRoute) rememberBoardScrollPosition();
    $noteView = 'list';
    const nextPath = `/notes/${normalizeNotePath(event.detail.path)}`;
    setRoutePath(nextPath);
    navigate(nextPath);
    if (event.detail.path && sidebarComponent) sidebarComponent.setSelected(event.detail.path);
    if (isMobile && !event.detail.isDir) setSidebarOpen(false);
    clearSearch();
  }

  async function handleOpenQuickNote(event) {
    const { note, renameTo } = event.detail;
    savedQuickNote = null;
    let nextPath = note.path;
    if (renameTo && renameTo !== note.name) {
      try {
        await flushOpenNote();
        const result = await renameItemRequest(note.path, renameTo);
        announceNoteLinksUpdated(result);
        if (result?.path) {
          nextPath = result.path;
        } else {
          // бэкенд не вернул новый путь — собираем вручную из dir + filename
          const dir = note.path.split('/').slice(0, -1).join('/');
          nextPath = dir ? `${dir}/${renameTo}` : renameTo;
        }
        if (sidebarComponent) await sidebarComponent.loadTree();
      } catch (err) {
        console.error('Failed to rename quick note:', err);
        // открываем со старым именем
      }
    }
    handleNavigate({ detail: { path: nextPath, name: renameTo || note.name, isDir: false } });
  }

  async function revealInTree(event) {
    const path = event.detail?.path;
    if (!path) return;
    if (!$sidebarOpen) {
      setSidebarOpen(true);
      await tick();
    }
    sidebarComponent?.setSelected(path);
  }

  function handleNoteColorChanged(event) {
    const { path, color } = event.detail || {};
    if (!path) return;
    homeRecentNotes.update((current) =>
      current.map((note) => note.path === path ? { ...note, color } : note));
    if (sidebarComponent) sidebarComponent.loadTree();
  }

  function handleNoteSaved(eventOrDetail) {
    const detail = eventOrDetail?.detail || eventOrDetail || {};
    if (detail.savedAt && detail.savedAt === lastSeenNoteSaveAt) return;
    if (detail.savedAt) lastSeenNoteSaveAt = detail.savedAt;
    dashboardNeedsRefresh = true;
    if (isDashboardRoute) refreshDashboardAfterNoteSave();
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
    closeCommandPalette();
    if (event.detail === 'continueWork') openContinueWork();
    if (event.detail === 'openSettings') openSettings();
    if (event.detail === 'toggleSidebar') toggleSidebar();
    if (event.detail === 'newNote') openNewNoteFlow();
    if (event.detail === 'openTemplates') openTemplatesManager();
    if (event.detail === 'openTags') openTagPanel();
    if (event.detail === 'openTrash') openTrash();
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
      sidebarOpen={$sidebarOpen}
      on:saveSearch={openSavedSearchPanel}
    />

    <CommandPalette
      open={$commandPaletteOpen}
      mode={$commandPaletteMode}
      on:close={closeCommandPalette}
      on:command={handlePaletteCommand}
      on:openNote={(e) => handleNavigate({ detail: e.detail })}
    />

    {#if continueWorkOpen}
      <ContinueWorkModal
        open={continueWorkOpen}
        notes={$homeRecentNotes}
        onClose={() => continueWorkOpen = false}
        onOpenNote={openRecentNote}
        onOpenAll={openAllRecentNotes}
      />
    {/if}

    <div class="flex flex-1 overflow-hidden relative">
      {#if isMobile && $sidebarOpen}
        <button
          class="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
          on:click={toggleSidebar}
          aria-label={$localizedText.app.closeMenu}
        ></button>
      {/if}

      <div
        class="{isMobile ? 'fixed inset-y-0 left-0 z-50 w-full flex flex-col' : 'relative shrink-0 flex flex-col'}
               {!$sidebarOpen ? (isMobile ? '-translate-x-full' : 'w-0') : ''}
               overflow-hidden"
        data-testid="sidebar-shell"
        inert={!$sidebarOpen}
        style={!isMobile && $sidebarOpen ? `width: ${$sidebarWidth}px;` : ''}
      >
        <Sidebar
          bind:this={sidebarComponent}
          on:navigate={handleNavigate}
          on:fileDeleted={() => showDashboard({ replace: true, closeSidebar: false })}
          on:openSettings={openSettings}
          on:openTrash={openTrash}
          on:openTags={openTagPanel}
          on:openProperties={openPropertiesView}
          on:openSavedSearches={openSavedSearchPanel}
          on:openTemplatesManager={openTemplatesManager}
          on:openQuickSwitcher={() => openCommandPalette('notes')}
          on:toggleSidebar={toggleSidebar}
          on:openCreateNote={openNewNoteFlow}
          on:quickNoteSaved={(e) => { savedQuickNote = e.detail; promoteRecentNote(e.detail); if (isMobile) setSidebarOpen(false); }}
          on:quickNoteIssue={(e) => { quickNoteIssue = e.detail; if (isMobile) setSidebarOpen(false); }}
          on:syncError={(e) => { syncError = e.detail; if (isMobile) setSidebarOpen(false); }}
          mobile={isMobile}
          autoPullState={autoPullState}
          {gitConfigured}
        />
        {#if !isMobile && $sidebarOpen}
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
            on:clear={clearSearch}
          />
        {:else}
        <Route path="/notes/*" let:params>
          <NotePage path={params['*']} on:navigate={handleNavigate} on:fileDeleted={() => showDashboard({ refreshTree: true, replace: true, closeSidebar: false })} on:fileOpened={(e) => { if (sidebarComponent) sidebarComponent.setSelected(e.detail); }} on:fileSaved={handleNoteSaved} on:noteColorChanged={handleNoteColorChanged} on:revealInTree={revealInTree} />
        </Route>
        <Route path="/settings">
          <Settings on:archivePickerOpened={rememberSettingsRoute} on:navigate={handleNavigate} on:notesImported={handleNotesImported} />
        </Route>
        <Route path="/trash">
          <TrashView on:restored={handleTrashRestored} on:deleted={refreshAfterTrashChange} />
        </Route>
        <Route path="/templates">
          <!-- Редкий экран: его код грузится, только когда пользователь туда пришёл. -->
          {#await import('./components/TemplateManager.svelte') then templateManager}
            <svelte:component this={templateManager.default} />
          {/await}
        </Route>
        <Route path="/properties">
          {#await import('./components/PropertiesView.svelte') then propertiesView}
            <svelte:component this={propertiesView.default} on:navigate={handleNavigate} />
          {/await}
        </Route>
        <Route path="/">
          <div bind:this={boardScrollContainer} class="h-full overflow-y-auto px-4 py-4 sm:py-6 lg:px-12 lg:py-8" data-board-scroll on:scroll={handleBoardScroll}>
            <div class="mx-auto max-w-6xl">
              {#if $homeRecentNotes.length === 0}
                {#if $homeRecentError}
                  <div class="flex min-h-[60vh] flex-col items-center justify-center text-center">
                    <h1 class="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                      {$localizedText.app.board.loadFailed}
                    </h1>
                    <p class="mt-3 max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
                      {$localizedText.app.board.loadFailedHint}
                    </p>
                    <button
                      type="button"
                      class="mt-8 text-sm font-bold uppercase tracking-widest text-[var(--text-primary)] transition hover:opacity-70"
                      on:click={() => loadHomeRecentNotes()}
                    >
                      {$localizedText.app.board.retry}
                    </button>
                  </div>
                {:else if $homeRecentLoading}
                  <div class="py-16 text-center text-xs uppercase tracking-widest text-[var(--text-secondary)]">
                    {$localizedText.searchResults.searching}
                  </div>
                {:else}
                  <div class="flex min-h-[60vh] flex-col items-center justify-center text-center">
                    <h1 class="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                      {$localizedText.app.board.title}
                    </h1>
                    <p class="mt-3 max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
                      {isMobile ? $localizedText.app.emptyMobile : $localizedText.app.emptyDesktop}
                    </p>
                    <div class="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
                      <button
                        type="button"
                        class="text-sm font-bold uppercase tracking-widest text-[var(--text-primary)] transition hover:opacity-70"
                        on:click={openNewNoteFlow}
                      >
                        {$localizedText.app.homeActions.newNote}
                      </button>
                      <button
                        type="button"
                        class="text-sm uppercase tracking-widest text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                        on:click={startArchiveImport}
                      >
                        {$localizedText.app.homeActions.importNotes}
                      </button>
                    </div>
                    <ul class="mt-10 max-w-sm space-y-2 text-left text-sm leading-relaxed text-[var(--text-secondary)]" data-testid="first-run-tips">
                      {#if !isMobile}<li><span class="text-[var(--text-primary)]">{shortcutLabel('Ctrl+K')}</span> · {$localizedText.app.tips.search}</li>{/if}
                      <li>{$localizedText.app.tips.links}</li>
                      <li>{$localizedText.app.tips.commands}</li>
                    </ul>
                    {#if importStatus}
                      <p class="mt-6 text-xs text-[var(--text-tertiary)]">{importStatus}</p>
                    {/if}
                    {#if importError}
                      <p class="mt-6 max-w-sm text-xs text-[var(--red)]">{importError}</p>
                    {/if}
                  </div>
                {/if}
              {:else}
                <NoteBoard
                  notes={$homeRecentNotes}
                  mobile={isMobile}
                  showCreateCard={true}
                  on:createNote={openNewNoteFlow}
                  on:openFull={(e) => openRecentNote(e.detail)}
                  on:reveal={revealInTree}
                  on:noteTouched={(e) => promoteRecentNote(e.detail)}
                />
                {#if $homeRecentLoading}
                  <div class="py-8 text-center text-xs uppercase tracking-widest text-[var(--text-secondary)]">
                    {$localizedText.searchResults.searching}
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        </Route>
        <Route path="*">
          {#if lastKnownAppRoute === '/settings'}
            <Settings on:archivePickerOpened={rememberSettingsRoute} on:navigate={handleNavigate} on:notesImported={handleNotesImported} />
          {/if}
        </Route>
        {/if}
      </main>
    </div>
  </div>

  {#if showCreateNoteModal}
    <CreateNoteModal
      open={showCreateNoteModal}
      category={createNoteInitialCategory}
      onClose={() => showCreateNoteModal = false}
      onCreated={handleNoteCreated}
      onPickTemplate={handlePickTemplate}
    />
  {/if}

  {#if savedQuickNote}
    <QuickNoteSavedModal
      note={savedQuickNote}
      on:close={() => savedQuickNote = null}
      on:open={handleOpenQuickNote}
    />
  {/if}

  {#if quickNoteIssue}
    <InfoModal
      title={$localizedText.sidebar.modals.quickNoteNotCreated}
      message={quickNoteIssue}
      primaryLabel={$localizedText.sidebar.modals.understood}
      on:close={() => quickNoteIssue = ''}
      on:primary={() => quickNoteIssue = ''}
    />
  {/if}

  {#if syncError}
    <InfoModal
      title={$localizedText.sidebar.errors.syncFailed}
      message={syncError}
      primaryLabel={$localizedText.sidebar.modals.understood}
      on:close={() => syncError = ''}
      on:primary={() => syncError = ''}
    />
  {/if}

  <SavedSearchesPanel
    open={savedSearchPanelOpen}
    currentQuery={pendingSearchQuery}
    on:run={runSavedSearch}
    on:saved={() => { pendingSearchQuery = ''; }}
  />

  <TagPanel
    open={tagPanelOpen}
    on:select={searchByTag}
    on:changed={() => { if (headerComponent?.loadTags) headerComponent.loadTags(); if (sidebarComponent?.loadTree) sidebarComponent.loadTree(); }}
  />
  {#if linksNotice}
    <div class="fixed bottom-6 left-6 z-[200] animate-toast-in" role="status">
      <div class="border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-5 py-3 max-w-xs text-sm shadow-2xl">{linksNotice}</div>
    </div>
  {/if}
</Router>
