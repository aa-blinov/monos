<script>
  import { onMount } from 'svelte';
  import { Router, Route, navigate } from 'svelte-routing';
  import Sidebar from './components/Sidebar.svelte';
  import Header from './components/Header.svelte';
  import NotePage from './components/NotePage.svelte';
  import Settings from './components/Settings.svelte';
  import { themes } from './lib/themes.js';
  import { fontOptions, fontSizeOptions, lineHeightOptions, contentWidthOptions, editorFontSizeOptions } from './lib/fonts.js';
  import { activeTheme, fontFamily, fontSize, lineHeight, contentWidth, editorFontSize, editMode, searchQuery, searchResults, isSearching } from './stores.js';

  let isDarkMode = false;
  let sidebarOpen = true;
  let isMobile = false;
  let sidebarComponent;
  let searchTimer;

  async function doSearch() {
    if (!$searchQuery.trim()) {
      $searchResults = [];
      return;
    }
    $isSearching = true;
    try {
      const r = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: $searchQuery, search_content: true })
      });
      if (r.ok) $searchResults = await r.json();
    } catch {} finally { $isSearching = false; }
  }

  function handleSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(doSearch, 300);
  }

  function applyTheme() {
    const t = themes[$activeTheme];
    if (!t) return;
    const vars = isDarkMode ? t.dark : t.light;
    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }

  $: applyTheme($activeTheme, isDarkMode);
  $: document.documentElement.style.setProperty('--line-height', (lineHeightOptions.find(l => l.value === $lineHeight)?.value_css || '1.625'));
  $: document.documentElement.style.setProperty('--content-width', (contentWidthOptions.find(c => c.value === $contentWidth)?.value_css || '56rem'));
  $: document.documentElement.style.setProperty('--editor-font-size', (editorFontSizeOptions.find(s => s.value === $editorFontSize)?.base || '16px'));
  $: document.documentElement.style.setProperty('--font-size-base', (fontSizeOptions.find(s => s.value === $fontSize)?.base || '14px'));
  $: document.documentElement.style.setProperty('--font-family', (fontOptions.find(f => f.family.includes($fontFamily) || f.name === $fontFamily)?.family || $fontFamily));

  function updateMobileState() {
    isMobile = window.innerWidth < 1024;
    if (isMobile && sidebarOpen) sidebarOpen = false;
  }

  function handleKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      toggleSidebar();
    }
  }

  onMount(async () => {
    updateMobileState();
    window.addEventListener('resize', updateMobileState);
    window.addEventListener('keydown', handleKeydown);
    isDarkMode = localStorage.getItem('darkMode') === 'true' ||
      (localStorage.getItem('darkMode') === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDarkMode);

    // Load theme from server
    try {
      const r = await fetch('/api/settings');
      if (r.ok) {
        const s = await r.json();
        if (s.theme && themes[s.theme]) $activeTheme = s.theme;
        if (s.editMode) $editMode = s.editMode;
      }
    } catch {}

    applyTheme();
    return () => {
      window.removeEventListener('resize', updateMobileState);
      window.removeEventListener('keydown', handleKeydown);
    };
  });

  function toggleDarkMode() { isDarkMode = !isDarkMode; localStorage.setItem('darkMode', isDarkMode); document.documentElement.classList.toggle('dark', isDarkMode); applyTheme(); }
  function toggleSidebar() { sidebarOpen = !sidebarOpen; }

  function handleNavigate(event) {
    let rawPath = event.detail.path.replace(/\\/g, '/');
    if (rawPath.startsWith('/')) rawPath = rawPath.substring(1);
    const cleanPath = rawPath.startsWith('notes/') ? rawPath.substring(6) : rawPath;
    navigate(`/notes/${cleanPath}`);
    if (isMobile && !event.detail.isDir) sidebarOpen = false;
    $searchQuery = '';
    $searchResults = [];
  }

</script>

<Router>
  <div class="h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans antialiased overflow-hidden">
    <Header
      on:toggleDarkMode={toggleDarkMode}
      on:toggleSidebar={toggleSidebar}
      {isDarkMode}
    />

    <div class="flex flex-1 overflow-hidden relative">
      {#if isMobile && sidebarOpen}
        <button
          class="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
          on:click={toggleSidebar}
          aria-label="Close sidebar"
        ></button>
      {/if}

      <div
        class="{isMobile ? 'fixed inset-y-0 left-0 z-50 w-full' : 'shrink-0'}
               {!sidebarOpen ? (isMobile ? '-translate-x-full' : 'w-0 border-r-0') : (isMobile ? '' : 'w-72 border-r border-[var(--border-subtle)]')}
               transition-all duration-300 ease-in-out
               overflow-y-auto"
      >
        <Sidebar
          bind:this={sidebarComponent}
          on:navigate={handleNavigate}
          on:openSettings={() => navigate('/settings')}
          on:toggleSidebar={toggleSidebar}
        />
      </div>

      <main class="flex-1 overflow-hidden relative">
        {#if $searchQuery.trim()}
          <div class="h-full overflow-y-auto px-4 lg:px-12 py-8">
            {#if $isSearching}
              <div class="flex items-center justify-center h-32">
                <span class="text-xs uppercase tracking-widest animate-pulse">Searching</span>
              </div>
            {:else if $searchResults.length > 0}
              <div class="max-w-2xl mx-auto space-y-8">
                {#each $searchResults as result}
                  <button
                    on:click={() => { handleNavigate({ detail: { path: result.path, name: result.name, isDir: false } }); $searchQuery = ''; $searchResults = []; }}
                    class="w-full text-left group block"
                  >
                    <div class="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] mb-1 truncate">{result.path.startsWith('notes/') ? result.path.slice(6) : result.path}</div>
                    <div class="text-lg font-serif font-medium group-hover:underline mb-2">{result.name}</div>
                    {#if result.excerpt}
                      <p class="text-xs text-[var(--text-secondary)] leading-relaxed italic line-clamp-3">
                        {@html result.excerpt.replace(new RegExp($searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), match => `<mark class="bg-[var(--text-primary)] text-[var(--bg-primary)] px-0.5">${match}</mark>`)}
                      </p>
                    {/if}
                  </button>
                {/each}
              </div>
            {:else}
              <div class="flex items-center justify-center h-32">
                <span class="text-xs uppercase tracking-widest opacity-40">No results</span>
              </div>
            {/if}
          </div>
        {:else}
        <Route path="/notes/*" let:params>
          <NotePage path={params['*']} on:navigate={handleNavigate} on:fileDeleted={() => { navigate('/'); if (sidebarComponent) sidebarComponent.loadTree(); }} on:fileOpened={(e) => { if (sidebarComponent) sidebarComponent.setSelected(e.detail); }} on:formatComplete={() => { if (sidebarComponent) sidebarComponent.loadTree(); }} />
        </Route>
        <Route path="/settings">
          <Settings />
        </Route>
        <Route path="/">
          <div class="h-full flex items-center justify-center px-8">
            <div class="text-center max-w-2xl">
              <h1 class="text-5xl lg:text-7xl font-serif mb-8 tracking-tighter">Monos</h1>
              <p class="text-lg lg:text-xl text-[var(--text-secondary)] leading-relaxed font-serif italic">
                Выберите файл в боковой панели слева, чтобы начать работу с вашими мыслями.
              </p>
            </div>
          </div>
        </Route>
        {/if}
      </main>
    </div>
  </div>
</Router>
