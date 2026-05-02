<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let isDarkMode = false;

  let isFormatting = false;
  let isSyncing = false;

  async function handleFormat() {
    isFormatting = true;
    try {
      const response = await fetch('/api/format', { method: 'POST' });
      const data = await response.json();
      alert(data.message);
    } catch (error) {
      alert('Ошибка форматирования: ' + error.message);
    } finally {
      isFormatting = false;
    }
  }

  async function handleSync() {
    isSyncing = true;
    try {
      const response = await fetch('/api/git/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Auto-sync from WebUI' })
      });
      const data = await response.json();
      alert(data.message);
    } catch (error) {
      alert('Ошибка синхронизации: ' + error.message);
    } finally {
      isSyncing = false;
    }
  }

  function toggleDarkMode() {
    dispatch('toggleDarkMode');
  }

  function toggleSidebar() {
    dispatch('toggleSidebar');
  }
</script>

<header class="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
  <div class="flex items-center gap-4">
    <button
      on:click={toggleSidebar}
      class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
      title="Переключить боковую панель"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <h1 class="text-2xl font-bold text-blue-600 dark:text-blue-400">Zed Notes</h1>
  </div>

  <div class="flex items-center gap-3">
    <button
      on:click={handleFormat}
      disabled={isFormatting}
      class="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition inline-flex items-center gap-2 whitespace-nowrap"
      title="Форматировать все заметки"
    >
      {#if isFormatting}
        <svg class="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      {:else}
        <svg class="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      {/if}
      <span>Форматировать</span>
    </button>

    <button
      on:click={handleSync}
      disabled={isSyncing}
      class="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition inline-flex items-center gap-2 whitespace-nowrap"
      title="Синхронизировать с Git"
    >
      {#if isSyncing}
        <svg class="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      {:else}
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      {/if}
      <span>Синхронизировать</span>
    </button>

    <button
      on:click={toggleDarkMode}
      class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition flex-shrink-0"
      title="Переключить тему"
    >
      {#if isDarkMode}
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.591a.75.75 0 101.06 1.06l1.591-1.591zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.591-1.591a.75.75 0 10-1.06 1.06l1.591 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061 1.06l1.591 1.591a.75.75 0 101.06-1.06l-1.59-1.591zM6 12a.75.75 0 01-.75-.75V8.25a.75.75 0 011.5 0V11.25A.75.75 0 016 12zM6.166 6.166a.75.75 0 010-1.06L7.757 3.515a.75.75 0 011.06 1.06l-1.591 1.591z" />
        </svg>
      {:else}
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
        </svg>
      {/if}
    </button>
  </div>
</header>

<style>
  button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
  }
</style>
