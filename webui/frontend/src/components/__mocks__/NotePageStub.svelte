<script>
  import { createEventDispatcher } from 'svelte';

  export let path = '';

  const dispatch = createEventDispatcher();
</script>

<div data-testid="note-page-stub">
  note:{path}
  <!-- A note brings its own back button; the app bar is not drawn over a note. -->
  <button on:click={() => dispatch('goHome')}>go home</button>
  <button on:click={() => dispatch('revealInTree', { path: `notes/${path}` })}>reveal in tree</button>
  <button on:click={() => dispatch('fileSaved', { path: `notes/${path}`, modified: '2026-06-14T17:08:00.000Z', savedAt: Date.now() })}>save current note</button>
  <button on:click={() => dispatch('fileDeleted')}>delete current note</button>
</div>
