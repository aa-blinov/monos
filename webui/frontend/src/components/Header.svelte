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

  <div class="flex items-center gap-2">
    <button
      on:click={handleFormat}
      disabled={isFormatting}
      class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition"
      title="Форматировать все заметки"
    >
      {#if isFormatting}
        <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      {:else}
        🎨
      {/if}
      Форматировать
    </button>

    <button
      on:click={handleSync}
      disabled={isSyncing}
      class="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition"
      title="Синхронизировать с Git"
    >
      {#if isSyncing}
        <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      {:else}
        🔄
      {/if}
      Синхронизировать
    </button>

    <button
      on:click={toggleDarkMode}
      class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
      title="Переключить тему"
    >
      {#if isDarkMode}
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l-2.12-2.12a1 1 0 00-1.414 0l-.707.707a1 1 0 000 1.414l2.121 2.121a1 1 0 101.414-1.414l.707-.707a1 1 0 001.414 0zm2.12-10.607a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM9 4a1 1 0 100-2 1 1 0 000 2zm0 16a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
        </svg>
      {:else}
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
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
