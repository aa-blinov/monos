<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import Editor from './Editor.svelte';
  
  const dispatch = createEventDispatcher();

  export let path = "";
  let currentFile = null;

  // The path from the router is "clean" (e.g., "Work/MyNote.md")
  // The backend API and the Editor component expect the full path ("notes/Work/MyNote.md")
  function getFileFromCleanPath(cleanPath) {
    if (!cleanPath) return null;
    
    const decodedPath = decodeURIComponent(cleanPath);
    const fullPath = `notes/${decodedPath}`;
    const name = decodedPath.split('/').pop();
    
    return { path: fullPath, name, isDir: false };
  }

  $: currentFile = getFileFromCleanPath(path);
</script>

{#if currentFile}
  <div class="h-full">
    {#key currentFile.path}
      <Editor
        {currentFile}
        on:navigate={(e) => dispatch('navigate', e.detail)}
        on:fileDeleted={() => dispatch('fileDeleted')}
        on:fileOpened={(e) => dispatch('fileOpened', e.detail)}
        on:formatComplete={() => dispatch('formatComplete')}
      />
    {/key}
  </div>
{/if}
