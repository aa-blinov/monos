<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import FileTree from './FileTree.svelte';
  import { iconOptions } from '../lib/icons.js';
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

  /** @type {Object} */
  let tree = null;
  /** @type {string} */
  let searchQuery = '';
  /** @type {string} */
  let selectedPath = null;
  /** @type {boolean} */
  let isLoading = true;
  /** @type {string} */
  let error = '';

  /** @type {boolean} */
  let showCreateModal = false;
  /** @type {boolean} */
  let showCreateFolderModal = false;

  /** @type {string} */
  let newNoteTitle = '';
  /** @type {string} */
  let newNoteCategory = '';
  /** @type {string} */
  let newFolderName = '';
  /** @type {string} */
  let newFolderNameInput = '';

  /** @type {boolean} */
  let isCreating = false;

  /** @type {boolean} */
  let searchContent = false;
  /** @type {Array} */
  let searchResults = [];
  /** @type {boolean} */
  let isSearching = false;
  let searchTimeout;

  /** @type {Array<string>} */
  let directoryList = [""];

  /** @type {boolean} */
  let showRenameModal = false;
  /** @type {string} */
  let renameNewName = '';
  /** @type {string} */
  let renameOldName = '';

  /** @type {Array} */
  let recentNotes = [];
  /** @type {boolean} */
  let showRecent = true;

  /** @type {boolean} */
  let showIconModal = false;
  /** @type {string} */
  let iconPickerTarget = null;
  /** @type {string} */
  let selectedColor = '#a89984';

  const colorOptions = [
    '#a89984', '#928374', '#fb4934', '#fe8019', '#fabd2f',
    '#b8bb26', '#8ec07c', '#83a598', '#458588', '#d3869b'
  ];

  // Context Menu State
  let contextMenu = { show: false, x: 0, y: 0, targetPath: null, targetName: '', isDir: false };
  let isDragOverRoot = false;
  let isSyncing = false;

  // Reactive filtering
  $: filteredTree = (() => {
    if (!tree) return null;
    if (!searchQuery.trim() || searchContent) return tree;
    const filtered = filterNode(tree, searchQuery);
    return filtered || { ...tree, children: [] };
  })();

  function countNotes(node) {
    if (!node) return 0;
    let count = node.is_dir ? 0 : 1;
    if (node.children) {
      for (const child of node.children) {
        count += countNotes(child);
      }
    }
    return count;
  }

  $: totalNotes = tree ? countNotes(tree) : 0;

  async function loadRecentNotes() {
    try {
      const response = await fetch('/api/notes/recent?limit=5');
      if (response.ok) {
        recentNotes = await response.json();
      }
    } catch (err) {
      console.error('Failed to load recent notes:', err);
    }
  }

  let pendingSelectedPath = null;
  let treeKey = 0;

  export async function loadTree() {
    try {
      if (!tree) isLoading = true;
      error = '';
      const response = await fetch('/api/tree');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      tree = await response.json();
      await loadRecentNotes();
      if (pendingSelectedPath) {
        treeKey++;
        selectedPath = pendingSelectedPath;
        expandToPath(tree, pendingSelectedPath);
        pendingSelectedPath = null;
      }
    } catch (err) {
      error = `Failed to load tree: ${err.message}`;
    } finally {
      isLoading = false;
    }
  }

  function expandToPath(node, targetPath) {
    expandedPaths = new Set();
    if (!node) return;
    _find(node, targetPath);
    expandedPaths = new Set(expandedPaths);
  }

  function _find(node, targetPath) {
    if (node.path === targetPath) return true;
    if (node.children) {
      for (const child of node.children) {
        if (_find(child, targetPath)) {
          expandedPaths.add(child.path);
          return true;
        }
      }
    }
    return false;
  }

  let expandedPaths = new Set();

  export function setSelected(path) {
    if (path === selectedPath) return;
    expandToPath(tree, path);
    selectedPath = path;
    treeKey++;
  }

  async function loadDirectories() {
    try {
      const response = await fetch('/api/directories');
      if (response.ok) {
        directoryList = await response.json();
      }
    } catch (err) {
      console.error('Failed to load directories:', err);
    }
  }

  async function setFolderIcon(icon) {
    if (!iconPickerTarget) return;
    try {
      const body = { icon: icon || null };
      if (icon) body.color = selectedColor;
      const response = await fetch(`/api/directory/icon?path=${encodeURIComponent(iconPickerTarget)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (response.ok) {
        showIconModal = false;
        await loadTree();
      }
    } catch (err) {
      console.error('Failed to set icon:', err);
    }
  }

  async function performSearch() {
    if (!searchQuery.trim() || !searchContent) {
      searchResults = [];
      return;
    }

    try {
      isSearching = true;
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          search_content: true
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      searchResults = await response.json();
    } catch (err) {
      error = `Search failed: ${err.message}`;
    } finally {
      isSearching = false;
    }
  }

  function handleSearchInput() {
    if (searchContent) {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(performSearch, 500);
    }
  }

  function toggleSearchMode() {
    searchContent = !searchContent;
    if (searchContent && searchQuery.trim()) {
      performSearch();
    } else {
      searchResults = [];
    }
  }

  async function createFolder() {
    if (!newFolderNameInput.trim()) return;
    const fullPath = newFolderName ? `${newFolderName}/${newFolderNameInput}` : newFolderNameInput;
    try {
      isCreating = true;
      const response = await fetch(`/api/directory/create?path=${encodeURIComponent(fullPath)}`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      showCreateFolderModal = false;
      newFolderNameInput = '';
      await loadTree();
      await loadDirectories();
    } catch (err) {
      error = `Failed to create folder: ${err.message}`;
    } finally {
      isCreating = false;
    }
  }

  async function createNewNote() {
    if (!newNoteTitle.trim()) return;
    try {
      isCreating = true;
      const response = await fetch('/api/notes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newNoteTitle,
          category: newNoteCategory,
          tags: [],
          content: ''
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      showCreateModal = false;
      newNoteTitle = '';
      await loadTree();
      dispatch('navigate', { path: data.path, name: newNoteTitle, isDir: false });
    } catch (err) {
      error = `Failed to create note: ${err.message}`;
    } finally {
      isCreating = false;
    }
  }

  function filterNode(node, query) {
    if (!query.trim()) return node;
    const lowerQuery = query.toLowerCase();
    const nameMatches = node.name.toLowerCase().includes(lowerQuery);
    if (node.is_dir) {
      if (!node.children) return nameMatches ? { ...node, children: [] } : null;
      const filteredChildren = node.children
        .map(child => filterNode(child, query))
        .filter(child => child !== null);
      if (nameMatches || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }
      return null;
    }
    return nameMatches ? node : null;
  }

  function handleSelectFile(event) {
    const detail = event.detail;
    setSelected(detail.path);
    dispatch('navigate', detail);
  }

  function handleRightClick(event) {
    const { x, y, path, name, isDir } = event.detail;
    contextMenu = { show: true, x, y, targetPath: path, targetName: name, isDir };
  }

  function handleBackgroundRightClick(e) {
    e.preventDefault();
    contextMenu = { show: true, x: e.clientX, y: e.clientY, targetPath: 'notes', targetName: 'notes', isDir: true };
  }

  function closeContextMenu() {
    contextMenu.show = false;
  }

  function handleContextAction(action) {
    const path = contextMenu.targetPath;
    const name = contextMenu.targetName;
    let categoryPath = "";
    if (path !== "notes") {
      categoryPath = path.startsWith('notes/') ? path.slice(6) : path;
    }
    
    if (action === 'newNote') {
      newNoteCategory = categoryPath;
      showCreateModal = true;
    } else if (action === 'newFolder') {
      newFolderName = categoryPath;
      showCreateFolderModal = true;
    } else if (action === 'setIcon') {
      iconPickerTarget = path;
      showIconModal = true;
    } else if (action === 'rename') {
      renameOldName = name;
      renameNewName = name.replace(/\.md$/, '');
      showRenameModal = true;
    } else if (action === 'delete') {
      if (confirm(`Are you sure you want to delete ${name}?`)) {
        deleteItem(path);
      }
    }
    closeContextMenu();
  }

  async function renameItem() {
    if (!renameNewName.trim() || renameNewName === renameOldName) {
      showRenameModal = false;
      return;
    }

    try {
      isCreating = true;
      const response = await fetch(`/api/file/rename?path=${encodeURIComponent(contextMenu.targetPath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_name: renameNewName
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      showRenameModal = false;
      
      const wasSelected = selectedPath === contextMenu.targetPath;
      
      await loadTree();
      await loadDirectories();
      
      if (wasSelected) {
        handleSelectFile({ detail: { path: data.path, name: renameNewName, isDir: contextMenu.isDir } });
      }
    } catch (err) {
      error = `Failed to rename: ${err.message}`;
    } finally {
      isCreating = false;
    }
  }

  async function deleteItem(path) {
    try {
      const response = await fetch(`/api/file?path=${encodeURIComponent(path)}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await loadTree();
      await loadDirectories();
    } catch (err) {
      error = `Failed to delete: ${err.message}`;
    }
  }

  async function handleMoveFile(event) {
    const { sourcePath, targetPath } = event.detail;
    try {
      const response = await fetch(`/api/file/move?source=${encodeURIComponent(sourcePath)}&target=${encodeURIComponent(targetPath)}`, {
        method: 'POST'
      });
      if (response.ok) {
        await loadTree();
        await loadDirectories();
      }
    } catch (err) {
      console.error('Failed to move file:', err);
    }
  }

  function handleRootDragOver(e) {
    if (e.target.closest('[draggable]')) return;
    e.preventDefault();
    isDragOverRoot = true;
  }

  function handleRootDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      isDragOverRoot = false;
    }
  }

  async function handleRootDrop(e) {
    if (e.defaultPrevented) return;
    e.preventDefault();
    isDragOverRoot = false;
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (sourcePath) {
      await handleMoveFile({ detail: { sourcePath, targetPath: 'notes' } });
    }
  }

  async function handleSync() {
    if (isSyncing) return;
    isSyncing = true;
    try {
      const r = await fetch('/api/git/sync', { method: 'POST' });
      const data = await r.json();
      await loadTree();
      await loadDirectories();
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      isSyncing = false;
    }
  }

  function clearSearch() {
    searchQuery = '';
    searchResults = [];
  }

  function resetDragOver() { isDragOverRoot = false; }

  onMount(() => {
    loadTree();
    loadDirectories();
    window.addEventListener('click', closeContextMenu);
    window.addEventListener('dragend', resetDragOver);
    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('dragend', resetDragOver);
    };
  });
</script>

  <div
    class="h-full flex flex-col bg-[var(--bg-primary)] relative"
    on:contextmenu|self={handleBackgroundRightClick}
  >
    <!-- Close button (mobile) -->
    <div class="lg:hidden flex justify-start px-4 pt-3 pb-1">
      <button on:click={() => dispatch('toggleSidebar')} class="p-1 hover:opacity-60" title="Close sidebar">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Search Section -->
  <div class="px-4 py-5 space-y-4">
    <div class="space-y-2">
      <div class="relative group">
        <input
          type="text"
          placeholder={searchContent ? "Search in notes..." : "Search files..."}
          bind:value={searchQuery}
          on:input={handleSearchInput}
          class="w-full bg-transparent border-b border-[var(--border-subtle)] focus:border-[var(--text-primary)] py-2 text-sm outline-none transition-all placeholder-[var(--text-secondary)]"
        />
        {#if searchQuery}
          <button
            on:click={clearSearch}
            class="absolute right-0 top-1/2 -translate-y-1/2 p-1 hover:opacity-60 transition"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        {/if}
      </div>
      
      <button 
        on:click={toggleSearchMode}
        class="text-[10px] uppercase tracking-widest font-bold {searchContent ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] opacity-50'} hover:opacity-100 transition-opacity"
      >
        {searchContent ? "● Global Search" : "○ Global Search"}
      </button>
    </div>
  </div>

  <!-- Recent Files Section -->
  {#if !searchQuery.trim() && !searchContent && recentNotes.length > 0}
    <div class="px-4 mb-4">
      <button 
        on:click={() => showRecent = !showRecent}
         class="flex items-center justify-between w-full text-[11px] uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)] opacity-60 hover:opacity-100 transition-opacity mb-4"
      >
        <span>Recent Thoughts</span>
        <span class="transform transition-transform {showRecent ? 'rotate-90' : ''}">›</span>
      </button>
      
      {#if showRecent}
        <div class="space-y-3">
          {#each recentNotes as note}
            <button 
              on:click={() => handleSelectFile({ detail: { path: note.path, name: note.name, isDir: false } })}
              class="w-full text-left group block"
            >
              <div class="text-xs font-medium truncate group-hover:text-[var(--text-primary)] transition-colors tracking-tight">{note.name}</div>
              <div class="text-[10px] uppercase tracking-[0.1em] text-[var(--text-secondary)] opacity-40 truncate mt-0.5">{note.path?.startsWith('notes/') ? note.path.slice(6) : note.path}</div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Visual Separator -->
  <div class="px-4 mb-4">
    <div class="h-[1px] bg-[var(--border-subtle)] w-full opacity-50"></div>
  </div>

  <!-- Tree View Header -->
  {#if !searchQuery.trim() && !searchContent}
    <div class="px-4 mb-4 flex items-center justify-between">
      <h3 class="text-[11px] uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)] opacity-60">Knowledge Tree</h3>
      <button
        on:click={() => { newNoteCategory = ''; showCreateModal = true; }}
        class="text-[11px] uppercase tracking-widest font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >+ New</button>
    </div>
  {/if}

  <!-- Tree View or Search Results -->
  <div 
    class="flex-1 overflow-y-auto px-4 pb-6"
    class:bg-[var(--border-subtle)]={isDragOverRoot}
    on:contextmenu|self={handleBackgroundRightClick}
    on:dragover={handleRootDragOver}
    on:dragleave={handleRootDragLeave}
    on:drop={handleRootDrop}
  >
    {#if isSearching}
      <div class="flex items-center justify-center h-32">
        <span class="text-xs uppercase tracking-widest animate-pulse">Searching</span>
      </div>
    {:else if searchContent && searchQuery.trim()}
      <div class="space-y-8 px-2">
        {#each searchResults as result}
          <button 
            on:click={() => handleSelectFile({ detail: { path: result.path, name: result.name, isDir: false } })}
            class="w-full text-left group block"
          >
            <div class="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] mb-1 truncate">{result.path.startsWith('notes/') ? result.path.slice(6) : result.path}</div>
            <div class="text-sm font-serif font-medium group-hover:underline mb-2">{result.name}</div>
            {#if result.excerpt}
              <p class="text-xs text-[var(--text-secondary)] leading-relaxed italic line-clamp-3">
                {@html result.excerpt.replace(new RegExp(searchQuery, 'gi'), match => `<mark class="bg-[var(--text-primary)] text-[var(--bg-primary)] px-0.5">${match}</mark>`)}
              </p>
            {/if}
          </button>
        {:else}
          <div class="flex items-center justify-center h-32">
            <span class="text-xs uppercase tracking-widest opacity-40">No matches found</span>
          </div>
        {/each}
      </div>
    {:else if isLoading}
      <div class="flex items-center justify-center h-32">
        <span class="text-xs uppercase tracking-widest animate-pulse">Loading</span>
      </div>
    {:else if tree}
      <div class="space-y-1">
        {#if isDragOverRoot}
          <div
            class="mx-2 py-3 border-2 border-dashed border-[var(--text-secondary)]/30 rounded text-center"
            on:dragover|preventDefault
            on:drop={handleRootDrop}
          >
            <span class="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]/50">Drop to root</span>
          </div>
        {/if}
        <!-- Render children directly to hide 'notes' root node -->
        {#key treeKey}
        {#each filteredTree.children || [] as node (node.path)}
          <FileTree 
            {node} 
            {selectedPath} 
            {expandedPaths}
            searchMode={!!searchQuery.trim()}
            expanded={!!searchQuery.trim() || expandedPaths.has(node.path)}
            on:navigate={handleSelectFile} 
            on:rightClick={handleRightClick}
            on:moveFile={handleMoveFile}
          />
        {/each}
        {/key}
      </div>
    {:else}
      <div class="flex items-center justify-center h-32">
        <span class="text-xs uppercase tracking-widest opacity-40">Empty</span>
      </div>
    {/if}
  </div>

  <!-- Stats Footer -->
  {#if !searchContent}
    <div class="px-4 py-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] uppercase tracking-widest">
      <span class="text-[var(--text-secondary)]">{tree ? totalNotes : 0} Notes</span>
      <div class="flex items-center gap-3">
        <button
          on:click={handleSync}
          disabled={isSyncing}
          class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-30"
          title="Sync with Git"
        >
          {#if isSyncing}
            <span class="block w-3 h-3 rounded-full border border-[var(--text-secondary)] border-t-transparent animate-spin"></span>
          {:else}
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          {/if}
        </button>
        <button
          on:click={() => dispatch('openSettings')}
          class="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          title="Settings"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>
  {/if}

  <!-- Context Menu -->
  {#if contextMenu.show}
    <div 
      class="fixed bg-[var(--bg-primary)] border border-[var(--border-subtle)] shadow-2xl py-2 z-[100] w-48"
      style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
    >
      {#if contextMenu.isDir}
        <button on:click={() => handleContextAction('newNote')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest hover:bg-[var(--border-subtle)] transition">New Note</button>
        <button on:click={() => handleContextAction('newFolder')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest hover:bg-[var(--border-subtle)] transition">New Folder</button>
        <div class="h-[1px] bg-[var(--border-subtle)] my-1"></div>
      {/if}
      <button on:click={() => handleContextAction('setIcon')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest hover:bg-[var(--border-subtle)] transition">Edit Icon</button>
      <button on:click={() => handleContextAction('rename')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest hover:bg-[var(--border-subtle)] transition">Rename</button>
      <button on:click={() => handleContextAction('delete')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest hover:bg-red-500/10 text-red-500 transition">Delete</button>
    </div>
  {/if}
</div>

<!-- Rename Modal -->
{#if showRenameModal}
  <div class="fixed inset-0 bg-black/20 dark:bg-[var(--bg-tertiary)]/50 backdrop-blur-sm flex items-center justify-center z-50">
    <div class="bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-8 w-96 shadow-2xl">
      <h2 class="text-2xl font-serif mb-8 tracking-tight">Rename {contextMenu.isDir ? 'Section' : 'Note'}</h2>
      <div class="space-y-8">
        <div>
          <label for="rename-input" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">New Name</label>
          <input 
            id="rename-input" 
            type="text" 
            bind:value={renameNewName} 
            placeholder="Enter new name..." 
            class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none"
            on:keydown={(e) => e.key === 'Enter' && renameItem()}
          />
        </div>
      </div>
      <div class="flex gap-6 mt-12">
        <button on:click={() => showRenameModal = false} class="flex-1 text-sm font-medium uppercase tracking-widest hover:opacity-60 transition">Cancel</button>
        <button on:click={renameItem} disabled={isCreating || !renameNewName.trim() || renameNewName === renameOldName} class="flex-1 text-sm font-bold uppercase tracking-widest hover:opacity-60 transition disabled:opacity-30">
          {isCreating ? 'Renaming...' : 'Rename'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Icon Picker Modal -->
{#if showIconModal}
  <div class="fixed inset-0 bg-black/20 dark:bg-[var(--bg-tertiary)]/50 backdrop-blur-sm flex items-center justify-center z-50">
    <div class="bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-8 w-[28rem] shadow-2xl">
      <h2 class="text-2xl font-serif mb-6 tracking-tight">Icon & Color</h2>
      <div class="mb-6">
        <label class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">Color</label>
        <div class="flex gap-2 flex-wrap">
          {#each colorOptions as c}
            <button
              on:click={() => selectedColor = c}
              class="w-7 h-7 rounded-full border-2 transition-all {selectedColor === c ? 'border-[var(--text-primary)] scale-110' : 'border-transparent hover:scale-105'}"
              style="background: {c}"
              title={c}
            ></button>
          {/each}
        </div>
      </div>
      <div class="grid grid-cols-6 gap-3">
        <button on:click={() => setFolderIcon(null)} class="aspect-square flex items-center justify-center border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] transition text-[9px] uppercase tracking-tighter opacity-50">None</button>
        {#each iconOptions as icon}
          <button 
            on:click={() => setFolderIcon(icon)}
            class="aspect-square flex items-center justify-center hover:bg-[var(--border-subtle)] transition rounded border border-transparent hover:border-[var(--border-subtle)]"
          >
            {#if iconMap[icon]}
              <svelte:component this={iconMap[icon]} size="20" />
            {/if}
          </button>
        {/each}
      </div>
      <div class="mt-8">
        <button on:click={() => showIconModal = false} class="w-full text-sm font-medium uppercase tracking-widest hover:opacity-60 transition">Cancel</button>
      </div>
    </div>
  </div>
{/if}

<!-- Create Folder Modal -->
{#if showCreateFolderModal}
  <div class="fixed inset-0 bg-black/20 dark:bg-[var(--bg-tertiary)]/50 backdrop-blur-sm flex items-center justify-center z-50" on:keydown={(e) => e.key === 'Escape' && (showCreateFolderModal = false)}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-8 w-96 shadow-2xl" on:click|stopPropagation>
      <h2 class="text-2xl font-serif mb-8 tracking-tight">New Section</h2>
      <div class="space-y-8">
        <div>
          <label for="parent-folder" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">Parent Folder</label>
          <select id="parent-folder" bind:value={newFolderName} class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 text-sm outline-none appearance-none cursor-pointer">
            {#each directoryList as dir}
              <option value={dir}>{dir || 'Root'}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="folder-name" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">Folder Name</label>
          <input id="folder-name" type="text" bind:value={newFolderNameInput} placeholder="e.g. AI" class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none" on:keydown={(e) => { if (e.key === 'Enter' && newFolderNameInput.trim()) createFolder(); if (e.key === 'Escape') showCreateFolderModal = false; }} />
        </div>
      </div>
      <div class="flex gap-6 mt-12">
        <button on:click={() => showCreateFolderModal = false} class="flex-1 text-sm font-medium uppercase tracking-widest hover:opacity-60 transition">Cancel</button>
        <button on:click={createFolder} disabled={isCreating || !newFolderNameInput.trim()} class="flex-1 text-sm font-bold uppercase tracking-widest hover:opacity-60 transition disabled:opacity-30">
          {isCreating ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Create Note Modal -->
{#if showCreateModal}
  <div class="fixed inset-0 bg-black/20 dark:bg-[var(--bg-tertiary)]/50 backdrop-blur-sm flex items-center justify-center z-50" on:keydown={(e) => e.key === 'Escape' && (showCreateModal = false)}>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-8 w-96 shadow-2xl" on:click|stopPropagation>
      <h2 class="text-2xl font-serif mb-8 tracking-tight">New Note</h2>
      <div class="space-y-8">
        <div>
          <label for="note-title" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">Title</label>
          <input id="note-title" type="text" bind:value={newNoteTitle} placeholder="Name your thought..." class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none" on:keydown={(e) => { if (e.key === 'Enter' && newNoteTitle.trim()) createNewNote(); if (e.key === 'Escape') showCreateModal = false; }} />
        </div>
      </div>
      <div class="flex gap-6 mt-12">
        <button on:click={() => showCreateModal = false} class="flex-1 text-sm font-medium hover:opacity-60 transition">Cancel</button>
        <button on:click={createNewNote} disabled={isCreating || !newNoteTitle.trim()} class="flex-1 text-sm font-bold uppercase tracking-widest hover:opacity-60 transition disabled:opacity-30">
          {isCreating ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.sidebar button) {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }
</style>
