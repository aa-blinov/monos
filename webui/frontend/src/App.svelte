<script>
  import { onMount } from 'svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Editor from './components/Editor.svelte';
  import Header from './components/Header.svelte';

  let currentFile = null;
  let isDarkMode = false;
  let sidebarOpen = true;
  let isMobile = false;
  let sidebarComponent;

  function updateMobileState() {
    isMobile = window.innerWidth < 1024; // Use 1024 for tablet/mobile
    if (isMobile) {
      sidebarOpen = false;
    } else {
      sidebarOpen = true;
    }
  }

  onMount(() => {
    updateMobileState();
    window.addEventListener('resize', updateMobileState);
    
    isDarkMode = localStorage.getItem('darkMode') === 'true' ||
      (localStorage.getItem('darkMode') === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    applyDarkMode(isDarkMode);

    return () => window.removeEventListener('resize', updateMobileState);
  });

  function applyDarkMode(dark) {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', dark);
  }

  function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    applyDarkMode(isDarkMode);
  }

  function selectFile(event) {
    currentFile = event.detail;
    // Only close sidebar on mobile if a file (not a folder) is selected
    if (isMobile && !event.detail.isDir) {
      sidebarOpen = false;
    }
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  function handleSyncComplete() {
    if (sidebarComponent) {
      sidebarComponent.loadTree();
    }
  }
</script>

<div class="h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans antialiased overflow-hidden">
  <Header 
    on:toggleDarkMode={toggleDarkMode} 
    on:toggleSidebar={toggleSidebar} 
    on:syncComplete={handleSyncComplete}
    {isDarkMode} 
  />

  <div class="flex flex-1 overflow-hidden relative">
    <!-- Sidebar Overlay for Mobile -->
    {#if isMobile && sidebarOpen}
      <button 
        class="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
        on:click={toggleSidebar}
        aria-label="Close sidebar"
      ></button>
    {/if}

    <div 
      class="{isMobile ? 'fixed inset-y-0 left-0 z-50 bg-[var(--bg-primary)] shadow-2xl w-80' : 'w-72 border-r border-[var(--border-subtle)]'} 
             {sidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
             transition-transform duration-300 ease-in-out
             overflow-y-auto"
    >
      <Sidebar bind:this={sidebarComponent} on:selectFile={selectFile} />
    </div>

    <main class="flex-1 overflow-hidden relative">
      {#if currentFile && !currentFile.isDir}
        <Editor {currentFile} />
      {:else}
        <div class="h-full flex items-center justify-center px-8">
          <div class="text-center max-w-2xl">
            <h1 class="text-5xl lg:text-7xl font-serif mb-8 tracking-tighter">Monos</h1>
            <p class="text-lg lg:text-xl text-[var(--text-secondary)] leading-relaxed font-serif italic">
              Выберите файл в боковой панели слева, чтобы начать работу с вашими мыслями.
            </p>
          </div>
        </div>
      {/if}
    </main>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
  }

  :global(html.dark) {
    color-scheme: dark;
  }
</style>
