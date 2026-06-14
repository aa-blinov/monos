<script>
  import { createEventDispatcher } from 'svelte';
  import * as Icon from 'lucide-svelte';
  import { NOTE_LINK_DRAG_TYPE, noteLinkPayload } from '../lib/drag-data.js';

  const dispatch = createEventDispatcher();
  const TREE_NOTE_PATHS_DRAG_TYPE = 'application/x-monos-note-paths';

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
  export let selectedPaths = new Set();

  const TOOLTIP_OFFSET = 12;
  const TOOLTIP_MARGIN = 16;

  let isExpanded = expanded;
  let _manualToggle = false;
  let isDragging = false;
  let isDragOver = false;
  let tooltipVisible = false;
  let tooltipX = 0;
  let tooltipY = 0;

  $: if (!_manualToggle && isExpanded !== expanded) isExpanded = expanded;
  $: if (selectedPath) _manualToggle = false;
  $: fileName = formatFileName(node.name);
  $: noteSelected = !node.is_dir && selectedPaths.has(node.path);
  $: active = noteSelected || (selectedPaths.size === 0 && selectedPath === node.path);

  function formatFileName(name = '') {
    return name.replace(/\.md$/i, '');
  }

  function canShowFileTooltip() {
    if (node.is_dir || typeof window === 'undefined' || window.innerWidth < 1024) return false;
    return true;
  }

  function showFileTooltip(event) {
    if (!canShowFileTooltip()) return;
    const rect = event.currentTarget.getBoundingClientRect();
    tooltipX = Math.min(window.innerWidth - TOOLTIP_MARGIN, rect.right + TOOLTIP_OFFSET);
    tooltipY = Math.min(window.innerHeight - TOOLTIP_MARGIN, Math.max(TOOLTIP_MARGIN, rect.top + rect.height / 2));
    tooltipVisible = true;
  }

  function hideFileTooltip() {
    tooltipVisible = false;
  }

  function toggle() {
    _manualToggle = true;
    isExpanded = !isExpanded;
    dispatch('toggleExpand', { path: node.path, expanded: isExpanded });
  }

  function handleSelect(event) {
    if (node.is_dir) {
      toggle();
      return;
    }
    if (event?.metaKey || event?.ctrlKey) {
      dispatch('toggleSelect', { path: node.path, name: node.name, isDir: false });
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
    hideFileTooltip();
    isDragging = true;
    const dragPaths = !node.is_dir && selectedPaths.has(node.path)
      ? [...selectedPaths]
      : [node.path];
    e.dataTransfer.setData('text/plain', dragPaths[0]);
    if (!node.is_dir) {
      e.dataTransfer.setData(TREE_NOTE_PATHS_DRAG_TYPE, JSON.stringify(dragPaths));
    }
    if (!node.is_dir) {
      e.dataTransfer.setData(NOTE_LINK_DRAG_TYPE, JSON.stringify(noteLinkPayload(node)));
    }
    e.dataTransfer.effectAllowed = node.is_dir ? 'move' : 'copyMove';
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
      const sourcePaths = parseDraggedNotePaths(e.dataTransfer, sourcePath);
      if (sourcePath !== node.path) {
        dispatch('moveFile', { sourcePath, sourcePaths, targetPath: node.path });
      }
    }
  }

  function parseDraggedNotePaths(dataTransfer, fallbackPath) {
    try {
      const raw = dataTransfer.getData(TREE_NOTE_PATHS_DRAG_TYPE);
      const parsed = JSON.parse(raw || '[]');
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      // Fall back to the plain text path for older drag payloads.
    }
    return fallbackPath ? [fallbackPath] : [];
  }
</script>

<div class="group text-sm lg:text-xs">
  <button
    class="flex min-h-11 w-full cursor-pointer items-center gap-2 border-l-2 px-2.5 py-2 text-left transition-all lg:min-h-7 lg:px-3 lg:py-1.5 {isDragging ? 'opacity-40' : ''} {isDragOver ? 'bg-[var(--border-subtle)]' : ''}"
    class:border-[var(--text-primary)]={active || (node.is_dir && isDragOver)}
    class:border-transparent={!active && !(node.is_dir && isDragOver)}
    class:bg-[var(--border-subtle)]={active || (node.is_dir && isDragOver)}
    on:click={handleSelect}
    on:contextmenu={onRightClick}
    on:keydown={(e) => e.key === 'Enter' && handleSelect(e)}
    on:mouseenter={showFileTooltip}
    on:mouseleave={hideFileTooltip}
    on:focus={showFileTooltip}
    on:blur={hideFileTooltip}
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
        <Icon.ChevronRight class="w-3.5 h-3.5 transition-transform duration-200 {isExpanded ? 'rotate-90' : ''}" strokeWidth="2" aria-hidden="true" />
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
        <Icon.FileText class="w-3.5 h-3.5 opacity-30 shrink-0" strokeWidth="2" aria-hidden="true" />
      {/if}
    {/if}

    <span class="truncate flex-1 {node.is_dir ? 'font-medium' : 'opacity-80'}">
      {fileName}
    </span>
  </button>

  {#if tooltipVisible}
    <div
      role="tooltip"
      class="fixed z-[90] pointer-events-none max-w-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-left shadow-lg shadow-black/10"
      style="left: {tooltipX}px; top: {tooltipY}px; transform: translateY(-50%);"
    >
      <span class="absolute left-[-5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-b border-l border-[var(--border-subtle)] bg-[var(--bg-primary)]"></span>
      <div class="font-serif text-sm leading-snug text-[var(--text-primary)] break-words">
        {fileName}
      </div>
    </div>
  {/if}

  {#if node.is_dir && isExpanded && node.children}
    <div class="ml-2.5 border-l border-[var(--border-subtle)] pl-1.5 lg:ml-3 lg:pl-2">
      {#each node.children as child (child.path)}
        <svelte:self
          node={child}
          {selectedPath}
          {selectedPaths}
          {expandedPaths}
          {searchMode}
          expanded={searchMode || expandedPaths.has(child.path)}
          on:navigate={(e) => dispatch('navigate', e.detail)}
          on:toggleSelect
          on:toggleExpand
          on:rightClick
          on:moveFile
        />
      {/each}
    </div>
  {/if}
</div>

