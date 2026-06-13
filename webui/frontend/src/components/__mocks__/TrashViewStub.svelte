<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();
</script>

<div data-testid="trash-view-stub">
  trash view
  <button
    type="button"
    on:click={() => dispatch('restored', { path: 'notes/Restored.md', name: 'Restored' })}
  >
    restore note
  </button>
</div>
