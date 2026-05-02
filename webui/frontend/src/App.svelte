<script>
  import { onMount } from 'svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Editor from './components/Editor.svelte';
  import Browser from './components/Browser.svelte';
  import Header from './components/Header.svelte';

  let currentFile = null;
  let isDarkMode = false;
  let sidebarOpen = true;

  onMount(() => {
    // Check for dark mode preference
    isDarkMode = localStorage.getItem('darkMode') === 'true' ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyDarkMode(isDarkMode);
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
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }
</script>

<div class="h-screen flex flex-col bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100">
  <Header on:toggleDarkMode={toggleDarkMode} on:toggleSidebar={toggleSidebar} {isDarkMode} />

  <div class="flex flex-1 overflow-hidden">
    {#if sidebarOpen}
      <div class="w-80 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
        <Sidebar on:selectFile={selectFile} />
      </div>
    {/if}

    <div class="flex-1 overflow-hidden">
      {#if currentFile}
        <Editor {currentFile} />
      {:else}
        <div class="h-full flex items-center justify-center">
          <div class="text-center">
            <h1 class="text-3xl font-bold mb-4">Zed Notes</h1>
            <p class="text-gray-500 dark:text-gray-400 mb-8">Выберите файл для начала</p>
            <Browser on:selectFile={selectFile} />
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  }

  :global(html.dark) {
    color-scheme: dark;
  }
</style>
