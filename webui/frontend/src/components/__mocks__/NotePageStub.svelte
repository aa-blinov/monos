<script>
  import { createEventDispatcher } from 'svelte';

  export let path = '';

  const dispatch = createEventDispatcher();
</script>

<div data-testid="note-page-stub">
  note:{path}
  <button on:click={() => dispatch('revealInTree', { path: `notes/${path}` })}>reveal in tree</button>
  <button on:click={() => dispatch('fileDeleted')}>delete current note</button>
</div>
