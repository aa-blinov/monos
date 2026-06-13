<script context="module">
  export function getFileFromCleanPath(cleanPath) {
    if (!cleanPath) return null;

    const decodedPath = decodeURIComponent(cleanPath);
    const fullPath = `notes/${decodedPath}`;
    const name = decodedPath.split('/').pop();

    return { path: fullPath, name, isDir: false };
  }
</script>

<script>
  import { createEventDispatcher } from 'svelte';
  import Editor from './Editor.svelte';
  
  const dispatch = createEventDispatcher();

  export let path = "";
  let currentFile = null;

  $: currentFile = getFileFromCleanPath(path);
</script>

{#if currentFile}
  <div class="h-full">
    <Editor
      {currentFile}
      on:navigate={(e) => dispatch('navigate', e.detail)}
      on:fileDeleted={() => dispatch('fileDeleted')}
      on:fileOpened={(e) => dispatch('fileOpened', e.detail)}
      on:formatComplete={() => dispatch('formatComplete')}
      on:noteColorChanged={(e) => dispatch('noteColorChanged', e.detail)}
      on:revealInTree={(e) => dispatch('revealInTree', e.detail)}
    />
  </div>
{/if}
