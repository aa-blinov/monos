<script>
  import { createEventDispatcher } from 'svelte';
  import { Bars3Icon, SparklesIcon, ArrowPathIcon, MoonIcon, SunIcon } from 'heroicons-svelte/solid';

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
      <Bars3Icon class="w-5 h-5" />
    </button>
    <h1 class="text-2xl font-bold text-blue-600 dark:text-blue-400">Zed Notes</h1>
  </div>

  <div class="flex items-center gap-2">
    <button
      on:click={handleFormat}
      disabled={isFormatting}
      class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition flex items-center gap-2"
      title="Форматировать все заметки"
    >
      {#if isFormatting}
        <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      {:else}
        <SparklesIcon class="w-5 h-5" />
      {/if}
      Форматировать
    </button>

    <button
      on:click={handleSync}
      disabled={isSyncing}
      class="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition flex items-center gap-2"
      title="Синхронизировать с Git"
    >
      {#if isSyncing}
        <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      {:else}
        <ArrowPathIcon class="w-5 h-5" />
      {/if}
      Синхронизировать
    </button>

    <button
      on:click={toggleDarkMode}
      class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
      title="Переключить тему"
    >
      {#if isDarkMode}
        <SunIcon class="w-5 h-5" />
      {:else}
        <MoonIcon class="w-5 h-5" />
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
