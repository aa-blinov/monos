<script>
  export let isDarkMode = false;

  let isFormatting = false;

  async function handleFormat() {
    isFormatting = true;
    try {
      const r = await fetch('/api/format', { method: 'POST' });
      alert((await r.json()).message);
    } catch (e) { alert('Error: ' + e.message); }
    finally { isFormatting = false; }
  }

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  function toggleDarkMode() { dispatch('toggleDarkMode'); }
  function toggleSidebar() { dispatch('toggleSidebar'); }
</script>

<header class="bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] px-4 lg:px-8 py-4 flex items-center justify-between">
  <div class="flex items-center gap-4 lg:gap-6">
    <button on:click={toggleSidebar} class="hover:opacity-60 transition-opacity p-1" title="Toggle Sidebar">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <h1 class="text-xl lg:text-2xl font-serif font-medium tracking-tight whitespace-nowrap">Monos</h1>
  </div>

  <div class="flex items-center gap-3 lg:gap-6">
    <button on:click={handleFormat} disabled={isFormatting} class="text-sm font-medium hover:opacity-60 disabled:opacity-30 flex items-center gap-2" title="Format all notes">
      {#if isFormatting}<span class="w-2 h-2 bg-[var(--text-primary)] rounded-full animate-pulse"></span>{/if}
      <span class="hidden sm:inline">Format</span>
    </button>





    <button on:click={toggleDarkMode} class="p-1 hover:opacity-60 transition-opacity" title="Toggle Theme">
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

<style>
  button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
  }
</style>
