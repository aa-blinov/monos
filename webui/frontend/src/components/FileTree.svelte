<script>
  import { createEventDispatcher } from 'svelte';
  import * as Icon from 'lucide-svelte';

  const dispatch = createEventDispatcher();

  const iconMap = {
    "folder": Icon.Folder, "folder-open": Icon.FolderOpen, "graduation-cap": Icon.GraduationCap,
    "archive": Icon.Archive, "beaker": Icon.Beaker, "book-open": Icon.BookOpen,
    "briefcase": Icon.Briefcase, "building": Icon.Building, "calendar": Icon.Calendar,
    "chart-bar": Icon.BarChart, "clipboard": Icon.Clipboard, "code": Icon.Code,
    "file-text": Icon.FileText, "globe": Icon.Globe, "heart": Icon.Heart,
    "home": Icon.Home, "inbox": Icon.Inbox, "lightbulb": Icon.Lightbulb,
    "map": Icon.Map, "puzzle": Icon.Puzzle, "rocket": Icon.Rocket, "tag": Icon.Tag, "star": Icon.Star
  };

  export let node;
  export let expanded = false;
  export let expandedPaths = new Set();
  export let searchMode = false;
  export let selectedPath = null;

  let isExpanded = expanded;
  let _manualToggle = false;
  let isDragging = false;
  let isDragOver = false;

  $: if (!_manualToggle && isExpanded !== expanded) isExpanded = expanded;
  $: if (selectedPath) _manualToggle = false;

  function toggle() {
    _manualToggle = true;
    isExpanded = !isExpanded;
  }

  function handleSelect() {
    if (node.is_dir) {
      toggle();
      return;
    }
    dispatch('navigate', { path: node.path, name: node.name, isDir: node.is_dir });
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
    class:border-[var(--text-primary)]={selectedPath === node.path || (node.is_dir && isDragOver)}
    class:border-transparent={selectedPath !== node.path && !(node.is_dir && isDragOver)}
    class:bg-[var(--border-subtle)]={selectedPath === node.path || (node.is_dir && isDragOver)}
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
      <span class="w-4 h-4 flex items-center justify-center shrink-0" style="color: {node.color || ''}">
        <svg 
          class="w-3.5 h-3.5 transition-transform duration-200 {isExpanded ? 'rotate-90' : ''}" 
          fill="none" 
          stroke="currentColor" 
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </span>
      {#if node.icon && iconMap[node.icon]}
        <span class="w-4 h-4 flex items-center justify-center shrink-0" style="color: {node.color || ''}">
          <svelte:component this={iconMap[node.icon]} size="14" />
        </span>
      {/if}
    {:else}
      {#if node.icon && iconMap[node.icon]}
        <span class="w-4 h-4 flex items-center justify-center shrink-0" style="color: {node.color || ''}">
          <svelte:component this={iconMap[node.icon]} size="14" />
        </span>
      {:else}
        <svg class="w-3.5 h-3.5 opacity-30 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      {/if}
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
          {expandedPaths}
          {searchMode}
          expanded={searchMode || expandedPaths.has(child.path)}
          on:navigate={(e) => dispatch('navigate', e.detail)}
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
