<script>
  import { createEventDispatcher } from 'svelte';
  import { displayFolderName, localizedText } from '../lib/strings.js';
  import { Icon } from '../lib/tree-icons.js';
  import { conflictedNotes } from '../lib/git-conflicts.js';
  import { agentTouched } from '../lib/agent-review.js';
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

  let isExpanded = expanded;
  let _manualToggle = false;
  let isDragging = false;
  let isDragOver = false;

  $: if (!_manualToggle && isExpanded !== expanded) isExpanded = expanded;
  $: if (selectedPath) _manualToggle = false;
  $: fileName = node.is_dir && /^(notes\/)?[^/]+$/.test(node.path) ? displayFolderName(node.name, $localizedText) : formatFileName(node.name);
  $: noteSelected = !node.is_dir && selectedPaths.has(node.path);
  $: active = noteSelected || (selectedPaths.size === 0 && selectedPath === node.path);
  $: hasColor = !!(node.color && typeof node.color === 'string');
  $: accentStyle = hasColor ? `--tree-color: ${node.color};` : '';
  // When the row is the active selection, paint its background with the note
  // color (mirrors the dashboard NoteCard tint). When no color is set we fall
  // back to the generic subtle background so selected rows stay visible.
  $: activeBgStyle = active && hasColor
    ? `background: color-mix(in srgb, ${node.color} 18%, transparent); ${accentStyle}`
    : accentStyle;

  function formatFileName(name = '') {
    return name.replace(/\.md$/i, '');
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

  // A button already turns Enter and Space into a click, so the row needs no keydown of
  // its own for them (a second handler toggled a folder twice and looked dead). The
  // context menu had only a mouse route; the Menu key and Shift+F10 open it here.
  function onKeyboardMenu(e) {
    if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    dispatch('rightClick', {
      x: rect.left + 24,
      y: rect.bottom,
      path: node.path,
      name: node.name,
      isDir: node.is_dir,
      byKeyboard: true,
    });
  }

  function handleDragStart(e) {
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
    class="flex min-h-11 w-full cursor-pointer items-center gap-2 border-l-2 border-l-transparent px-2.5 py-2 text-left transition-[background-color,border-color,opacity] lg:min-h-7 lg:px-3 lg:py-1.5 hover:bg-[color-mix(in_srgb,var(--bg-secondary)_50%,transparent)] {isDragging ? 'opacity-40' : ''} {isDragOver ? 'bg-[var(--border-subtle)]' : ''}"
    class:border-[var(--text-primary)]={node.is_dir && isDragOver}
    class:bg-[var(--border-subtle)]={node.is_dir && isDragOver}
    class:font-semibold={active}
    aria-current={active ? 'true' : undefined}
    aria-expanded={node.is_dir ? String(isExpanded) : undefined}
    style={activeBgStyle}
    on:click={handleSelect}
    on:contextmenu={onRightClick}
    on:keydown={onKeyboardMenu}
    data-tooltip={fileName}
    data-tooltip-position="right"
    data-tooltip-overflow
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
        <Icon.ChevronRight class="w-3 h-3 transition-transform duration-200 {isExpanded ? 'rotate-90' : ''}" strokeWidth="1.7" aria-hidden="true" />
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
        <Icon.FileText class="w-3 h-3 opacity-30 shrink-0" strokeWidth="1.7" aria-hidden="true" />
      {/if}
    {/if}

    <span
      class="truncate flex-1 {node.is_dir ? 'font-medium' : 'opacity-80'}"
    >
      {fileName}
    </span>
    {#if !node.is_dir && $agentTouched.has(node.path) && !$conflictedNotes.has(node.path)}
      <span class="mr-1 h-2 w-2 shrink-0 rounded-full bg-[var(--blue)]" title={$localizedText.agentReview.badgeHint} data-testid="tree-agent"></span>
      <span class="sr-only">{$localizedText.agentReview.badge}</span>
    {/if}
    {#if !node.is_dir && $conflictedNotes.has(node.path)}
      <span class="mr-1 h-2 w-2 shrink-0 rounded-full bg-[var(--red)]" title={$localizedText.app.board.conflictHint} data-testid="tree-conflict"></span>
      <span class="sr-only">{$localizedText.app.board.conflict}</span>
    {/if}
  </button>

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

<style>
  /* Selected note with a color: the inline style already sets a tinted
     background. Nothing extra to do here. */
</style>

