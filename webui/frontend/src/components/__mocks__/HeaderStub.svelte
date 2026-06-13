<script>
  import { createEventDispatcher } from 'svelte';

  export let noteOpen = false;

  const dispatch = createEventDispatcher();
</script>

<div data-testid="header-stub">
  <button on:click={() => dispatch('goHome')}>go home</button>
  <button on:click={() => dispatch('toggleSidebar')}>toggle sidebar</button>
  {#if !noteOpen}
    <button on:click={() => dispatch('createQuickNote')}>quick note</button>
  {/if}
</div>
