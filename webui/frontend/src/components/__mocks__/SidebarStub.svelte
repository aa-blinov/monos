<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();
  export let mobile = false;
  export let gitConfigured = true;
  let createFlowOpen = false;
  let selectedPath = '';
  $: void mobile;
  $: void gitConfigured;

  export function loadTree() {}
  export function setSelected(path) {
    selectedPath = path;
  }
  export function openCreateNote() {
    createFlowOpen = true;
  }
  export function createTodayNote() {
    dispatch('navigate', { path: 'notes/Daily/02-06-26-12-30-00.md', name: '02-06-26-12-30-00', isDir: false });
  }
  export function createQuickNoteFromClipboard() {
    dispatch('quickNoteSaved', { path: 'notes/Quick Notes/Quick.md', name: 'Quick', isDir: false });
  }
</script>

<div data-testid="sidebar-stub">
  {#if createFlowOpen}
    <div>create note flow opened</div>
  {/if}
  {#if selectedPath}
    <div>selected:{selectedPath}</div>
  {/if}
  <button on:click={() => dispatch('navigate', { path: 'notes/FromSidebar.md', name: 'FromSidebar.md', isDir: false })}>
    sidebar navigate
  </button>
  <button on:click={() => dispatch('openCreateNote', { category: 'Work/Nested' })}>create in nested folder</button>
  <button on:click={() => dispatch('openSettings')}>open settings</button>
  <button on:click={() => dispatch('openTrash')}>open trash</button>
  <button on:click={() => dispatch('toggleSidebar')}>close sidebar</button>
</div>
