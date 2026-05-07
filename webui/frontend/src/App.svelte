<script>
  import { onMount } from 'svelte';
  import { Router, Route, navigate } from 'svelte-routing';
  import Sidebar from './components/Sidebar.svelte';
  import Header from './components/Header.svelte';
  import NotePage from './components/NotePage.svelte';
  import Settings from './components/Settings.svelte';
  import { themes } from './lib/themes.js';
  import { fontOptions, fontSizeOptions } from './lib/fonts.js';
  import { activeTheme, fontFamily, fontSize } from './stores.js';

  let isDarkMode = false;
  let sidebarOpen = true;
  let isMobile = false;
  let sidebarComponent;

  function applyTheme() {
    const t = themes[$activeTheme];
    if (!t) return;
    const vars = isDarkMode ? t.dark : t.light;
    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }

  function applyFont() {
    const root = document.documentElement;
    const font = fontOptions.find(f => f.family.includes($fontFamily) || f.name === $fontFamily);
    root.style.setProperty('--font-family', font?.family || $fontFamily);
    const size = fontSizeOptions.find(s => s.value === $fontSize);
    root.style.setProperty('--font-size-base', size?.base || '14px');
  }

  $: applyTheme($activeTheme, isDarkMode);
  $: applyFont($fontFamily, $fontSize);

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
      }
    } catch {}

    applyTheme();
    applyFont();
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
      </main>
    </div>
  </div>
</Router>
