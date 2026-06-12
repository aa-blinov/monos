<script>
  import { createEventDispatcher } from 'svelte';

  export let isDarkMode = false;

  const dispatch = createEventDispatcher();
</script>

<div data-testid="header-stub">
  <span>{isDarkMode ? 'dark' : 'light'}</span>
  <button on:click={() => dispatch('goHome')}>go home</button>
  <button on:click={() => dispatch('toggleDarkMode')}>toggle dark</button>
  <button on:click={() => dispatch('toggleSidebar')}>toggle sidebar</button>
</div>
