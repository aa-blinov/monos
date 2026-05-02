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
      class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition flex-shrink-0 text-gray-700 dark:text-gray-300"
      title="Переключить тему"
    >
      {#if isDarkMode}
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5" stroke-width="2" />
          <line x1="12" y1="1" x2="12" y2="3" stroke-width="2" stroke-linecap="round" />
          <line x1="12" y1="21" x2="12" y2="23" stroke-width="2" stroke-linecap="round" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke-width="2" stroke-linecap="round" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke-width="2" stroke-linecap="round" />
          <line x1="1" y1="12" x2="3" y2="12" stroke-width="2" stroke-linecap="round" />
          <line x1="21" y1="12" x2="23" y2="12" stroke-width="2" stroke-linecap="round" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke-width="2" stroke-linecap="round" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke-width="2" stroke-linecap="round" />
        </svg>
      {:else}
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
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
