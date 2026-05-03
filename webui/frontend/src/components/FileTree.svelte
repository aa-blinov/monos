<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let node;
  export let expanded = false;
  export let selectedPath = null;

  let isExpanded = expanded;
  let isDragging = false;
  let isDragOver = false;

  const heroIcons = {
    "folder": `<path d="M2.25 6.75c0-1.242 1.008-2.25 2.25-2.25h3.375c.621 0 1.125.504 1.125 1.125v.75c0 .621.504 1.125 1.125 1.125h9.75c1.242 0 2.25 1.008 2.25 2.25v6.75c0 1.242-1.008 2.25-2.25 2.25H4.5c-1.242 0-2.25-1.008-2.25-2.25V6.75Z" />`,
    "folder-open": `<path d="M2.25 6.75c0-1.242 1.008-2.25 2.25-2.25h3.375c.621 0 1.125.504 1.125 1.125v.75c0 .621.504 1.125 1.125 1.125h9.75c1.242 0 2.25 1.008 2.25 2.25v6.75c0 1.242-1.008 2.25-2.25 2.25H4.5c-1.242 0-2.25-1.008-2.25-2.25V6.75Z" /><path d="M3.75 9.75a.75.75 0 0 1 .75-.75h15a.75.75 0 0 1 .75.75v.75a.75.75 0 0 1-.75.75h-15a.75.75 0 0 1-.75-.75v-.75Z" />`,
    "academic-cap": `<path d="M4.26 10.174L10.74 13.2a1.25 1.25 0 001.04 0l6.48-3.026a.5.5 0 01.627.733l-6.623 5.4a1.75 1.25 0 01-2.044 0l-6.623-5.4a.5.5 0 01.627-.733z" /><path d="M2.44 9.174l8.31-3.882a1.25 1.25 0 011.04 0l8.31 3.882a.5.5 0 010 .91l-8.31 3.882a1.25 1.25 0 01-1.04 0l-8.31-3.882a.5.5 0 010-.91z" />`,
    "archive-box": `<path d="M3.375 3C2.339 3 1.5 3.84 1.5 4.875v.75c0 1.036.84 1.875 1.875 1.875h17.25c1.035 0 1.875-.84 1.875-1.875v-.75C22.5 3.839 21.66 3 20.625 3H3.375Z" /><path fill-rule="evenodd" d="M3.087 9l.54 9.17c.1.1.24.83.623.83h15.5c.383 0 .524-.73.623-.83L20.913 9H3.087ZM12 12a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 12 12Z" clip-rule="evenodd" />`,
    "beaker": `<path d="M12.529 1.5a.75.75 0 0 0-1.058 0L9.932 3.039a.75.75 0 1 0 1.06 1.06l.758-.758v3.41c0 .2.08.391.22.53l5.28 5.28c.14.139.22.33.22.531v6.75a.75.75 0 0 1-.75.75h-9a.75.75 0 0 1-.75-.75V13.11a.75.75 0 0 0-.22-.53l-5.28-5.28a.75.75 0 0 0-1.06 1.061l5.28 5.28a2.25 2.25 0 0 1 .66 1.59v6.75a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-.66-1.59l-5.28-5.28a.75.75 0 0 1-.22-.53v-3.41l.758.758a.75.75 0 1 0 1.06-1.06L12.529 1.5Z" />`,
    "book-open": `<path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.992 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.237 8.237 0 0118 18.75c1.992 0 3.823.707 5.25 1.886a.75.75 0 001-.707V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />`,
    "briefcase": `<path fill-rule="evenodd" d="M7.5 6a4.5 4.5 0 119 0h.375A2.625 2.25 0 0119.5 8.25v9.75A2.625 2.625 0 0116.875 21H7.125A2.625 2.625 0 014.5 18V8.25A2.625 2.625 0 017.125 6H7.5zm.938 3a.75.75 0 100 1.5h7.124a.75.75 0 100-1.5H8.438zM12 3a3 3 0 00-3 3h6a3 3 0 00-3-3z" clip-rule="evenodd" />`,
    "building-office": `<path d="M3 21h18M6 21V6.75a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6.75V21M9 8.25h.008v.008H9V8.25zm.008 2.25H9v.008h.008V10.5zm-2.25 0h.008v.008H6.75V10.5zm0-2.25h.008v.008H6.75V8.25zM9 12.75h.008v.008H9v-.008zm.008 2.25H9v.008h.008V15zm-2.25 0h.008v.008H6.75V15zm0-2.25h.008v.008H6.75v-.008zm5.25-4.5h.008v.008H12V8.25zm.008 2.25H12v.008h.008V10.5zm-2.25 0h.008v.008H9.75V10.5zm0-2.25h.008v.008H9.75V8.25zm5.25 4.5h.008v.008H15v-.008zm.008 2.25H15v.008h.008V15zm-2.25 0h.008v.008H12.75V15zm0-2.25h.008v.008H12.75v-.008zm2.25-4.5h.008v.008H15V8.25zm.008 2.25H15v.008h.008V10.5zm1.5 4.5h.008v.008H17.25v-.008zm.008 2.25H17.25v.008h.008V15z" />`,
    "calendar": `<path d="M6.75 3V1.5M17.25 3V1.5M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />`,
    "chart-bar": `<path d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125Z" />`,
    "clipboard": `<path d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0A2.25 2.25 0 0113.5 5.25h-3a2.25 2.25 0 01-2.166-1.362m7.332 0c.555.23 1.058.58 1.47 1.012A2.25 2.25 0 0118 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-7.5a2.25 2.25 0 01-2.25-2.25V6.75a2.25 2.25 0 011.164-1.85 2.25 2.25 0 011.47-1.012" />`,
    "code-bracket": `<path d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />`,
    "document-text": `<path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9Z" />`,
    "globe-alt": `<path d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A11.953 11.953 0 0112 13.5c-2.998 0-5.74 1.1-7.843 2.918m7.843-2.918A8.959 8.959 0 013 12c0-.778.099-1.533.284-2.253" />`,
    "heart": `<path d="M11.645 20.91l-.007-.003c-.022-.012-.045-.025-.07-.041a20.844 20.844 0 01-1.428-1.002c-.46-.351-1.046-.844-1.635-1.427-1.131-1.123-2.39-2.656-2.39-4.836 0-2.348 1.503-4.148 3.511-4.148 1.161 0 2.215.539 3.012 1.398l.006.007c.026-.027.054-.054.084-.08a5.24 5.24 0 013.33-1.325c1.162 0 2.215.539 3.013 1.398 2.008 0 3.511 1.8 3.511 4.148 0 2.18-1.259 3.713-2.39 4.836-.589.583-1.175 1.076-1.635 1.427a20.852 20.852 0 01-1.428 1.002 12.09 12.09 0 01-.071.041l-.007.002a.75.75 0 01-.715 0z" />`,
    "home": `<path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" /><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875h-3.507a.75.75 0 01-.75-.75V15.75h-4.5v4.5a.75.75 0 01-.75.75H6.75A1.875 1.875 0 014.875 19.125v-6.198a.733.733 0 01.091-.086L12 5.432z" />`,
    "inbox": `<path d="M3.375 3.75A2.625 2.625 0 00.75 6.375v11.25A2.625 2.625 0 003.375 20.25h17.25a2.625 2.625 0 002.625-2.625V6.375A2.625 2.625 0 0020.625 3.75H3.375zM3.375 5.25h17.25c.621 0 1.125.504 1.125 1.125v3.447a12.012 12.012 0 01-6.115 1.428H8.365a12.012 12.012 0 01-6.115-1.428V6.375c0-.621.504-1.125 1.125-1.125zM2.25 11.834v5.791c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-5.791a13.513 13.513 0 01-6.115 1.416H8.365a13.513 13.513 0 01-6.115-1.416z" />`,
    "light-bulb": `<path d="M12 18a.75.75 0 01.75.75V19.5a.75.75 0 01-1.5 0v-.75A.75.75 0 0112 18zM12 2.25a.75.75 0 01.75.75v.75a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM6.124 11.374l1.1-.14a.75.75 0 11.19 1.488l-1.1.14a.75.75 0 11-.19-1.488zM16.586 11.374a.75.75 0 01.19 1.488l-1.1-.14a.75.75 0 11.19-1.488l1.1.14zM4.5 12a.75.75 0 01.75-.75h.75a.75.75 0 010 1.5h-.75A.75.75 0 014.5 12zM18 12a.75.75 0 01.75-.75h.75a.75.75 0 010 1.5h-.75A.75.75 0 0118 12zM6.75 20.25a.75.75 0 01.75-.75h9a.75.75 0 010 1.5h-9a.75.75 0 01-.75-.75z" /><path d="M12 6.75a5.25 5.25 0 100 10.5 5.25 5.25 0 000-10.5z" />`,
    "map": `<path d="M6.75 3.75L3.3 5.475a.75.75 0 00-.3 1.05l4.5 9a.75.75 0 001.35 0l3.15-6.3 3.15 6.3a.75.75 0 001.35 0l4.5-9a.75.75 0 00-.3-1.05l-3.45-1.725a.75.75 0 00-.6 0l-3.3 1.65-3.3-1.65a.75.75 0 00-.6 0z" />`,
    "puzzle-piece": `<path d="M11.644 1.59a.75.75 0 01.712 0l9.75 5.25a.75.75 0 010 1.32l-9.75 5.25a.75.75 0 01-.712 0l-9.75-5.25a.75.75 0 010-1.32l9.75-5.25z" /><path d="M3.276 12.294A.75.75 0 002.25 12.9v6.75c0 1.242 1.008 2.25 2.25 2.25h15c1.242 0 2.25-1.008 2.25-2.25V12.9a.75.75 0 00-1.026-.606l-8.724 4.698a.75.75 0 01-.712 0l-8.762-4.7z" />`,
    "rocket": `<path d="M10.125 11.25a1.875 1.875 0 113.75 0 1.875 1.875 0 01-3.75 0z" /><path fill-rule="evenodd" d="M12 2.25a.75.75 0 01.75.75v.75c4.142 0 7.5 3.358 7.5 7.5v3a7.5 7.5 0 01-7.5 7.5v.75a.75.75 0 01-1.5 0v-.75a7.5 7.5 0 01-7.5-7.5v-3c0-4.142 3.358-7.5 7.5-7.5V3a.75.75 0 01.75-.75zM10.5 12a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" clip-rule="evenodd" />`,
    "tag": `<path d="M5.25 12a.75.75 0 100 1.5.75.75 0 000-1.5z" /><path fill-rule="evenodd" d="M2.25 4.5a2.25 2.25 0 012.25-2.25h6.75a2.25 2.25 0 011.59.66l8.485 8.485a2.25 2.25 0 010 3.182l-6.75 6.75a2.25 2.25 0 01-3.182 0l-8.485-8.485A2.25 2.25 0 012.25 11.25V4.5zm2.25-1.5a.75.75 0 00-.75.75v6.75c0 .199.079.39.22.53l8.484 8.484a.75.75 0 001.061 0l6.75-6.75a.75.75 0 000-1.061l-8.484-8.484a.75.75 0 00-.53-.22H4.5z" clip-rule="evenodd" />`
  };

  function toggle() {
    isExpanded = !isExpanded;
  }

  function handleSelect() {
    if (node.is_dir) {
      toggle();
    }
    dispatch('selectFile', { path: node.path, name: node.name, isDir: node.is_dir });
  }

  function onRightClick(e) {
    e.preventDefault();
    dispatch('rightClick', {
      x: e.clientX,
      y: e.clientY,
      path: node.path,
      name: node.name,
      isDir: node.is_dir
    });
  }

  function handleDragStart(e) {
    isDragging = true;
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd() {
    isDragging = false;
  }

  function handleDragOver(e) {
    if (node.is_dir) {
      e.preventDefault();
      isDragOver = true;
      e.dataTransfer.dropEffect = 'move';
    }
  }

  function handleDragLeave() {
    isDragOver = false;
  }

  function handleDrop(e) {
    if (node.is_dir) {
      e.preventDefault();
      isDragOver = false;
      const sourcePath = e.dataTransfer.getData('text/plain');
      if (sourcePath !== node.path) {
        dispatch('moveFile', { sourcePath, targetPath: node.path });
      }
    }
  }
</script>

<div class="text-xs group">
  <button
    class="w-full flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all border-l-2 text-left {isDragging ? 'opacity-40' : ''} {isDragOver ? 'bg-[var(--border-subtle)]' : ''}"
    class:border-[var(--text-primary)]={selectedPath === node.path}
    class:border-transparent={selectedPath !== node.path}
    class:bg-[var(--border-subtle)]={selectedPath === node.path}
    on:click={handleSelect}
    on:contextmenu={onRightClick}
    on:keydown={(e) => e.key === 'Enter' && handleSelect()}
    draggable={node.path !== 'notes'}
    on:dragstart={handleDragStart}
    on:dragend={handleDragEnd}
    on:dragover={handleDragOver}
    on:dragleave={handleDragLeave}
    on:drop={handleDrop}
  >
    <!-- Icon -->
    {#if node.is_dir}
      <span class="w-4 h-4 flex items-center justify-center">
        <svg 
          class="w-3.5 h-3.5 transition-transform duration-200 {isExpanded && !node.icon ? 'rotate-90' : ''}" 
          fill="none" 
          stroke="currentColor" 
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          {#if node.icon && heroIcons[node.icon]}
            {@html heroIcons[node.icon]}
          {:else}
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
          {/if}
        </svg>
      </span>
    {:else}
      <svg class="w-3.5 h-3.5 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    {/if}

    <span class="truncate flex-1 {node.is_dir ? 'font-medium' : 'opacity-80'}">
      {node.name.replace('.md', '')}
    </span>
  </button>

  {#if node.is_dir && isExpanded && node.children}
    <div class="ml-3 pl-2 border-l border-[var(--border-subtle)]">
      {#each node.children as child (child.path)}
        <svelte:self
          node={child}
          {selectedPath}
          {expanded}
          on:selectFile
          on:rightClick
          on:moveFile
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  div :global(button) {
    padding: 0;
  }
</style>
