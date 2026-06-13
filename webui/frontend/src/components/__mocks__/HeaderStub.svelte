<script>
  import { createEventDispatcher } from 'svelte';

  export let noteOpen = false;
  export let showBack = false;
  export let showSearch = true;

  const dispatch = createEventDispatcher();
</script>

<div data-testid="header-stub">
  <button on:click={() => dispatch('goHome')}>go home</button>
  <button on:click={() => dispatch('toggleSidebar')}>toggle sidebar</button>
  {#if showBack}
    <span>back visible</span>
  {/if}
  {#if showSearch}
    <span>search visible</span>
  {/if}
  {#if !noteOpen && showSearch}
    <button on:click={() => dispatch('createQuickNote')}>quick note</button>
  {/if}
</div>
