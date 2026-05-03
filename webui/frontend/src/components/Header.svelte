<script>
  import { createEventDispatcher, onMount } from 'svelte';

  const dispatch = createEventDispatcher();

  export let isDarkMode = false;

  let isFormatting = false;
  let isSyncing = false;
  let showSettings = false;

  let settings = {
    auto_sync_interval: 0,
    auto_format_on_save: false,
    git_commit_message: 'Auto-sync from WebUI'
  };

  async function loadSettings() {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        settings = await response.json();
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  async function saveSettings() {
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (response.ok) {
        showSettings = false;
        alert('Настройки сохранены');
      }
    } catch (error) {
      alert('Ошибка при сохранении: ' + error.message);
    }
  }

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
        body: JSON.stringify({ message: settings.git_commit_message })
      });
      const data = await response.json();
      alert(data.message);
      
      if (data.success) {
        dispatch('syncComplete');
      }
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

  onMount(loadSettings);
</script>

<header class="bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] px-4 lg:px-8 py-4 flex items-center justify-between">
  <div class="flex items-center gap-4 lg:gap-6">
    <button
      on:click={toggleSidebar}
      class="hover:opacity-60 transition-opacity p-1"
      title="Toggle Sidebar"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <h1 class="text-xl lg:text-2xl font-serif font-medium tracking-tight whitespace-nowrap">Monos</h1>
  </div>

  <div class="flex items-center gap-3 lg:gap-6">
    <button
      on:click={handleFormat}
      disabled={isFormatting}
      class="text-sm font-medium hover:opacity-60 disabled:opacity-30 flex items-center gap-2"
      title="Format all notes"
    >
      {#if isFormatting}
        <span class="w-2 h-2 bg-[var(--text-primary)] rounded-full animate-pulse"></span>
      {/if}
      <span class="hidden sm:inline">Format</span>
      <svg class="w-5 h-5 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16m-7 6h7" />
      </svg>
    </button>

    <button
      on:click={handleSync}
      disabled={isSyncing}
      class="text-sm font-medium hover:opacity-60 disabled:opacity-30 flex items-center gap-2"
      title="Sync with Git"
    >
      {#if isSyncing}
        <span class="w-2 h-2 bg-[var(--text-primary)] rounded-full animate-pulse"></span>
      {/if}
      <span class="hidden sm:inline">Sync</span>
      <svg class="w-5 h-5 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>

    <button
      on:click={() => showSettings = true}
      class="p-1 hover:opacity-60 transition-opacity"
      title="Settings"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </button>

    <button
      on:click={toggleDarkMode}
      class="p-1 hover:opacity-60 transition-opacity"
      title="Toggle Theme"
    >
      {#if isDarkMode}
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="5" stroke-width="1.5" />
          <path stroke-linecap="round" stroke-width="1.5" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      {:else}
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      {/if}
    </button>
  </div>
</header>

{#if showSettings}
  <div class="fixed inset-0 bg-black/20 dark:bg-white/5 backdrop-blur-sm flex items-center justify-center z-50">
    <div class="bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-12 w-[32rem] shadow-2xl">
      <h3 class="text-3xl font-serif mb-8 tracking-tight">Settings</h3>

      <div class="space-y-8">
        <div>
          <label for="sync-interval" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">
            Auto-Sync Interval (minutes)
          </label>
          <input
            id="sync-interval"
            type="number"
            bind:value={settings.auto_sync_interval}
            min="0"
            class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none focus:border-[var(--text-primary)]"
          />
          <p class="text-[10px] text-[var(--text-secondary)] mt-2 italic">Set to 0 to disable automatic synchronization.</p>
        </div>

        <div>
          <label for="commit-msg" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">
            Default Commit Message
          </label>
          <input
            id="commit-msg"
            type="text"
            bind:value={settings.git_commit_message}
            class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none focus:border-[var(--text-primary)]"
          />
        </div>

        <div class="flex items-center justify-between">
          <label for="auto-format" class="text-xs uppercase tracking-widest text-[var(--text-secondary)]">
            Auto-format on save
          </label>
          <input
            id="auto-format"
            type="checkbox"
            bind:checked={settings.auto_format_on_save}
            class="w-4 h-4 accent-[var(--text-primary)]"
          />
        </div>
      </div>

      <div class="flex gap-8 mt-12">
        <button
          on:click={() => showSettings = false}
          class="flex-1 text-sm font-medium uppercase tracking-widest hover:opacity-60 transition"
        >
          Cancel
        </button>
        <button
          on:click={saveSettings}
          class="flex-1 text-sm font-bold uppercase tracking-widest hover:opacity-60 transition"
        >
          Save Settings
        </button>
      </div>
    </div>
  </div>
{/if}


<style>
  button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
  }
</style>
