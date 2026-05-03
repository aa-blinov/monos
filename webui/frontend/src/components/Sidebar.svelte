<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import FileTree from './FileTree.svelte';

  const dispatch = createEventDispatcher();

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
  
  const iconOptions = [
    "folder", "folder-open", "academic-cap", "archive-box", "beaker", 
    "book-open", "briefcase", "building-office", "calendar", "chart-bar",
    "clipboard", "code-bracket", "document-text", "globe-alt", "heart",
    "home", "inbox", "light-bulb", "map", "puzzle-piece", "rocket", "tag"
  ];

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

  // Context Menu State
  let contextMenu = { show: false, x: 0, y: 0, targetPath: null, targetName: '', isDir: false };

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

  // Export loadTree to be callable from parent
  export async function loadTree() {
    try {
      isLoading = true;
      error = '';
      const response = await fetch('/api/tree');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      tree = await response.json();
      await loadRecentNotes();
    } catch (err) {
      error = `Failed to load tree: ${err.message}`;
    } finally {
      isLoading = false;
    }
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
      const response = await fetch(`/api/directory/icon?path=${encodeURIComponent(iconPickerTarget)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icon })
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
    selectedPath = detail.path;
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

  function clearSearch() {
    searchQuery = '';
    searchResults = [];
  }

  onMount(() => {
    loadTree();
    loadDirectories();
    window.addEventListener('click', closeContextMenu);
    return () => window.removeEventListener('click', closeContextMenu);
  });
</script>

<div 
  class="h-full flex flex-col bg-[var(--bg-primary)] relative"
  on:contextmenu|self={handleBackgroundRightClick}
>
  <!-- Search Section -->
  <div class="p-6 space-y-4">
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
        class="text-[9px] uppercase tracking-widest font-bold {searchContent ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] opacity-50'} hover:opacity-100 transition-opacity"
      >
        {searchContent ? "● Global Search" : "○ Global Search"}
      </button>
    </div>
  </div>

  <!-- Recent Files Section -->
  {#if !searchQuery.trim() && !searchContent && recentNotes.length > 0}
    <div class="px-6 mb-6">
      <button 
        on:click={() => showRecent = !showRecent}
        class="flex items-center justify-between w-full text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)] opacity-60 hover:opacity-100 transition-opacity mb-4"
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
              <div class="text-[11px] font-medium truncate group-hover:text-[var(--text-primary)] transition-colors tracking-tight">{note.name}</div>
              <div class="text-[8px] uppercase tracking-[0.1em] text-[var(--text-secondary)] opacity-40 truncate mt-0.5">{note.path}</div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Visual Separator -->
  <div class="px-6 mb-6">
    <div class="h-[1px] bg-[var(--border-subtle)] w-full opacity-50"></div>
  </div>

  <!-- Tree View Header -->
  {#if !searchQuery.trim() && !searchContent}
    <div class="px-6 mb-4">
      <h3 class="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)] opacity-60">Knowledge Tree</h3>
    </div>
  {/if}

  <!-- Tree View or Search Results -->
  <div 
    class="flex-1 overflow-y-auto px-4 pb-6"
    on:contextmenu|self={handleBackgroundRightClick}
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
            <div class="text-[9px] uppercase tracking-widest text-[var(--text-secondary)] mb-1 truncate">{result.path}</div>
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
        <!-- Render children directly to hide 'notes' root node -->
        {#each filteredTree.children || [] as node (node.path)}
          <FileTree 
            {node} 
            {selectedPath} 
            expanded={!!searchQuery.trim()}
            on:navigate={handleSelectFile} 
            on:rightClick={handleRightClick}
            on:moveFile={handleMoveFile}
          />
        {/each}
      </div>
    {:else}
      <div class="flex items-center justify-center h-32">
        <span class="text-xs uppercase tracking-widest opacity-40">Empty</span>
      </div>
    {/if}
  </div>

  <!-- Stats Footer -->
  {#if tree && !searchContent}
    <div class="px-6 py-4 border-t border-[var(--border-subtle)] text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">
      {totalNotes} Notes
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
        <button on:click={() => handleContextAction('setIcon')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest hover:bg-[var(--border-subtle)] transition">Edit Icon</button>
        <div class="h-[1px] bg-[var(--border-subtle)] my-1"></div>
      {/if}
      <button on:click={() => handleContextAction('rename')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest hover:bg-[var(--border-subtle)] transition">Rename</button>
      <button on:click={() => handleContextAction('delete')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest hover:bg-red-500/10 text-red-500 transition">Delete</button>
    </div>
  {/if}
</div>

<!-- Rename Modal -->
{#if showRenameModal}
  <div class="fixed inset-0 bg-black/20 dark:bg-white/5 backdrop-blur-sm flex items-center justify-center z-50">
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
  <div class="fixed inset-0 bg-black/20 dark:bg-white/5 backdrop-blur-sm flex items-center justify-center z-50">
    <div class="bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-8 w-[28rem] shadow-2xl">
      <h2 class="text-2xl font-serif mb-8 tracking-tight">Section Icon</h2>
      <div class="grid grid-cols-6 gap-3">
        <button on:click={() => setFolderIcon(null)} class="aspect-square flex items-center justify-center border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] transition text-[9px] uppercase tracking-tighter opacity-50">None</button>
        {#each iconOptions as icon}
          <button 
            on:click={() => setFolderIcon(icon)}
            class="aspect-square flex items-center justify-center hover:bg-[var(--border-subtle)] transition rounded border border-transparent hover:border-[var(--border-subtle)]"
          >
            <svg class="w-6 h-6 text-[var(--text-primary)]" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              {@html heroIcons[icon]}
            </svg>
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
  <div class="fixed inset-0 bg-black/20 dark:bg-white/5 backdrop-blur-sm flex items-center justify-center z-50">
    <div class="bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-8 w-96 shadow-2xl">
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
          <input id="folder-name" type="text" bind:value={newFolderNameInput} placeholder="e.g. AI" class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none" />
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
  <div class="fixed inset-0 bg-black/20 dark:bg-white/5 backdrop-blur-sm flex items-center justify-center z-50">
    <div class="bg-[var(--bg-primary)] border border-[var(--border-subtle)] p-8 w-96 shadow-2xl">
      <h2 class="text-2xl font-serif mb-8 tracking-tight">New Note</h2>
      <div class="space-y-8">
        <div>
          <label for="note-title" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">Title</label>
          <input id="note-title" type="text" bind:value={newNoteTitle} placeholder="Name your thought..." class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none" />
        </div>
        <div>
          <label for="note-location" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">Location</label>
          <select id="note-location" bind:value={newNoteCategory} class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 text-sm outline-none appearance-none cursor-pointer">
            {#each directoryList as dir}
              <option value={dir}>{dir || 'Root'}</option>
            {/each}
          </select>
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
