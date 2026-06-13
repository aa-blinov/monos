<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { marked } from 'marked';
  import FileTree from './FileTree.svelte';
  import ModalShell from './ModalShell.svelte';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { iconOptions } from '../lib/icons.js';
  import { buildTemplateContent, getLocalizedTemplates, getTemplateById, getTemplateContext, noteTemplates } from '../lib/note-templates.js';
  import { locale, localizedText } from '../lib/strings.js';
  
  export let mobile = false;
  
  import {
    createFolderRequest,
    createNoteRequest,
    deleteItemRequest,
    loadDirectoriesRequest,
    loadTagsRequest,
    loadTreeData,
    moveItemRequest,
    renameItemRequest,
    setItemIconRequest,
    syncRequest,
  } from '../lib/sidebar-api.js';
  import { loadFileContent, saveFileContent, uploadAttachment } from '../lib/editor-api.js';
  import {
    convertImageToWebp,
    defaultImageName,
    firstImageFileFromClipboard,
    firstImageFileFromText,
    markdownImage,
  } from '../lib/attachments.js';
  import { editorState } from '../stores.js';
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
  let selectedPath = null;
  /** @type {boolean} */
  let isLoading = true;
  /** @type {string} */
  let error = '';

  /** @type {boolean} */
  let showCreateModal = false;
  /** @type {boolean} */
  let showCreateFolderModal = false;
  /** @type {boolean} */
  let showTemplatesModal = false;
  /** @type {string} */
  let newNoteTitle = '';
  /** @type {string} */
  let newNoteCategory = '';
  /** @type {string} */
  let selectedTemplateId = noteTemplates[0]?.id || '';
  /** @type {string} */
  let templateQuery = '';
  /** @type {string} */
  let templateTitle = '';
  /** @type {string} */
  let templateCategory = '';
  /** @type {string} */
  let templateLocale = '';
  /** @type {string} */
  let newFolderName = '';
  /** @type {string} */
  let newFolderNameInput = '';
  /** @type {boolean} */
  let isCreating = false;

  let allTags = [];
  let showTagSuggestions = false;
  let tagFilter = '';

  async function loadTags() {
    try {
      allTags = await loadTagsRequest();
    } catch {}
  }

  /** @type {Array<string>} */
  let directoryList = [""];

  /** @type {boolean} */
  let showRenameModal = false;
  /** @type {string} */
  let renameNewName = '';
  /** @type {string} */
  let renameOldName = '';

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

  const PINNED_NOTES_KEY = 'pinnedNotes';
  const QUICK_NOTES_CATEGORY = 'Quick Notes';
  const allowedPreviewTags = new Set([
    'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'EM', 'H1', 'H2', 'H3',
    'H4', 'H5', 'H6', 'HR', 'I', 'INPUT', 'LI', 'OL', 'P', 'PRE', 'S',
    'STRONG', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL',
  ]);
  const dropPreviewTags = new Set(['IFRAME', 'OBJECT', 'SCRIPT', 'STYLE']);

  // Context Menu State
  let contextMenu = { show: false, x: 0, y: 0, targetPath: null, targetName: '', isDir: false };
  let isDragOverRoot = false;
  let isSyncing = false;
  let pinnedNotes = loadPinnedNotes();
  let savedQuickNote = null;
  let quickNoteIssue = '';

  $: filteredTree = tree;
  $: localizedTemplates = getLocalizedTemplates($locale);
  $: selectedTemplate = getTemplateById(selectedTemplateId, $locale);
  $: normalizedTemplateQuery = templateQuery.trim().toLowerCase();
  $: filteredTemplates = localizedTemplates.filter((template) => {
    if (!normalizedTemplateQuery) return true;
    return [
      template.title,
      template.description,
      template.approachTitle,
      template.approachDescription,
      template.group,
      template.category,
      ...(template.tags || []),
    ].join(' ').toLowerCase().includes(normalizedTemplateQuery);
  });
  $: templateGroups = Array.from(new Set(filteredTemplates.map((template) => template.approach)))
    .map((approach) => {
      const firstTemplate = filteredTemplates.find((template) => template.approach === approach);
      return {
        approach,
        title: firstTemplate?.approachTitle || approach,
        description: firstTemplate?.approachDescription || '',
        templates: filteredTemplates.filter((template) => template.approach === approach),
      };
    });
  $: templateDirectoryList = Array.from(new Set([
    templateCategory,
    selectedTemplate?.category || '',
    ...directoryList,
  ].filter((dir) => dir !== undefined)));
  $: templatePreview = selectedTemplate
    ? buildTemplateContent(selectedTemplate, templateTitle || selectedTemplate.title)
    : '';
  $: templatePreviewHtml = renderTemplateMarkdown(templatePreview);
  $: if (showTemplatesModal && templateLocale !== $locale) {
    templateLocale = $locale;
    applyTemplateDefaults(getTemplateById(selectedTemplateId, $locale));
  }

  function isSameOrDescendant(itemPath, parentPath) {
    return itemPath === parentPath || itemPath.startsWith(`${parentPath}/`);
  }

  function isSafeHref(value) {
    const href = String(value || '').trim();
    return /^(https?:|mailto:|tel:|#|\/(?!\/)|\.{0,2}\/)/i.test(href);
  }

  function sanitizePreviewHtml(html) {
    if (typeof document === 'undefined') return '';
    const template = document.createElement('template');
    template.innerHTML = html;

    for (const node of [...template.content.querySelectorAll('*')]) {
      if (dropPreviewTags.has(node.tagName)) {
        node.remove();
        continue;
      }

      if (!allowedPreviewTags.has(node.tagName)) {
        node.replaceWith(...node.childNodes);
        continue;
      }

      for (const attr of [...node.attributes]) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || name === 'style') {
          node.removeAttribute(attr.name);
          continue;
        }

        const isLinkAttr = node.tagName === 'A'
          && (name === 'href' || name === 'title' || name === 'target' || name === 'rel');
        const isTableAttr = ['TH', 'TD'].includes(node.tagName)
          && (name === 'align' || name === 'colspan' || name === 'rowspan');
        const isCheckboxAttr = node.tagName === 'INPUT'
          && (name === 'type' || name === 'checked' || name === 'disabled');

        if (!isLinkAttr && !isTableAttr && !isCheckboxAttr) {
          node.removeAttribute(attr.name);
        }
      }

      if (node.tagName === 'A') {
        if (node.hasAttribute('href') && !isSafeHref(node.getAttribute('href'))) {
          node.removeAttribute('href');
        }
        if (node.getAttribute('target') === '_blank') {
          node.setAttribute('rel', 'noopener noreferrer');
        }
      }

      if (node.tagName === 'INPUT') {
        node.setAttribute('disabled', '');
      }
    }

    return template.innerHTML;
  }

  function renderTemplateMarkdown(markdown) {
    const previewMarkdown = String(markdown || '').replace(/^#\s+.+(?:\r?\n)+/, '');
    return sanitizePreviewHtml(marked.parse(previewMarkdown));
  }

  function replacePathPrefix(itemPath, oldPrefix, newPrefix) {
    if (itemPath === oldPrefix) return newPrefix;
    return `${newPrefix}${itemPath.slice(oldPrefix.length)}`;
  }

  function basename(itemPath) {
    return itemPath.split('/').filter(Boolean).at(-1) || itemPath;
  }

  function displayNoteName(name = '') {
    return name.replace(/\.md$/i, '');
  }

  function loadPinnedNotes() {
    try {
      const raw = localStorage.getItem(PINNED_NOTES_KEY);
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed.filter((note) => note?.path) : [];
    } catch {
      return [];
    }
  }

  function savePinnedNotes() {
    localStorage.setItem(PINNED_NOTES_KEY, JSON.stringify(pinnedNotes));
  }

  function isPinned(path) {
    return pinnedNotes.some((note) => note.path === path);
  }

  function pinNote(path, name) {
    if (!path || isPinned(path)) return;
    pinnedNotes = [
      { path, name: displayNoteName(name || basename(path)) },
      ...pinnedNotes,
    ];
    savePinnedNotes();
  }

  function unpinNote(path, includeDescendants = false) {
    pinnedNotes = pinnedNotes.filter((note) => includeDescendants ? !isSameOrDescendant(note.path, path) : note.path !== path);
    savePinnedNotes();
  }

  function updatePinnedPath(oldPath, newPath, newName = basename(newPath)) {
    let changed = false;
    pinnedNotes = pinnedNotes.map((note) => {
      if (!isSameOrDescendant(note.path, oldPath)) return note;
      changed = true;
      const path = replacePathPrefix(note.path, oldPath, newPath);
      return { ...note, path, name: displayNoteName(note.path === oldPath ? newName : basename(path)) };
    });
    if (changed) savePinnedNotes();
  }

  function recentPathLabel(note) {
    return note.path?.startsWith('notes/') ? note.path.slice(6) : note.path;
  }

  function movedPath(sourcePath, targetPath) {
    const targetDir = targetPath === 'notes' ? 'notes' : targetPath;
    return `${targetDir}/${basename(sourcePath)}`;
  }

  function navigateToPath(itemPath, isDir = false) {
    if (!itemPath) return;
    setSelected(itemPath);
    dispatch('navigate', { path: itemPath, name: basename(itemPath), isDir });
  }

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

  function padDatePart(value) {
    return String(value).padStart(2, '0');
  }

  export function formatTodayNoteTitle(date = new Date()) {
    return [
      padDatePart(date.getDate()),
      padDatePart(date.getMonth() + 1),
      padDatePart(date.getFullYear() % 100),
      padDatePart(date.getHours()),
      padDatePart(date.getMinutes()),
      padDatePart(date.getSeconds()),
    ].join('-');
  }

  let pendingSelectedPath = null;
  let treeKey = 0;

  export async function loadTree() {
    try {
      if (!tree) isLoading = true;
      error = '';
      tree = await loadTreeData();
      await loadTags();
      treeKey++;
      if (pendingSelectedPath) {
        selectedPath = pendingSelectedPath;
        expandToPath(tree, pendingSelectedPath);
        pendingSelectedPath = null;
      }
    } catch (err) {
      error = $localizedText.sidebar.errors.loadTree(err.message);
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

  export function openCreateNote() {
    dispatch('openCreateNote');
  }

  function applyTemplateDefaults(template = selectedTemplate) {
    if (!template) return;
    const ctx = getTemplateContext('', new Date());
    templateTitle = template.suggestedTitle?.(ctx) || template.title;
    templateCategory = template.category || '';
  }

  export function openTemplates(templateId = selectedTemplateId) {
    templateQuery = '';
    templateLocale = $locale;
    const template = getTemplateById(templateId, $locale) || selectedTemplate;
    selectedTemplateId = template.id;
    applyTemplateDefaults(template);
    showTemplatesModal = true;
  }

  function openTemplatesFromCreate() {
    showCreateModal = false;
    openTemplates();
  }

  function selectTemplate(template) {
    selectedTemplateId = template.id;
    applyTemplateDefaults(template);
  }

  async function loadDirectories() {
    try {
      directoryList = await loadDirectoriesRequest();
    } catch (err) {
      console.error('Failed to load directories:', err);
    }
  }

  async function setFolderIcon(icon) {
    if (!iconPickerTarget) return;
    try {
      const body = { icon: icon || null };
      if (icon) body.color = selectedColor;
      await setItemIconRequest(iconPickerTarget, body);
      showIconModal = false;
      await loadTree();
    } catch (err) {
      console.error('Failed to set icon:', err);
    }
  }

  async function setItemColor(color) {
    if (!iconPickerTarget) return;
    selectedColor = color;
    try {
      await setItemIconRequest(iconPickerTarget, { color });
      await loadTree();
    } catch (err) {
      console.error('Failed to set color:', err);
    }
  }

  async function createFolder() {
    if (!newFolderNameInput.trim()) return;
    const fullPath = newFolderName ? `${newFolderName}/${newFolderNameInput}` : newFolderNameInput;
    try {
      isCreating = true;
      await createFolderRequest(fullPath);
      showCreateFolderModal = false;
      newFolderNameInput = '';
      await loadTree();
      await loadDirectories();
    } catch (err) {
      error = $localizedText.sidebar.errors.createFolder(err.message);
    } finally {
      isCreating = false;
    }
  }

  async function createNewNote() {
    if (!newNoteTitle.trim()) return;
    try {
      isCreating = true;
      const title = newNoteTitle.trim();
      const data = await createNoteRequest({
        title,
        category: newNoteCategory,
        tags: [],
        content: '',
      });
      showCreateModal = false;
      newNoteTitle = '';
      await loadTree();
      dispatch('navigate', { path: data.path, name: title, isDir: false });
    } catch (err) {
      error = $localizedText.sidebar.errors.createNote(err.message);
    } finally {
      isCreating = false;
    }
  }

  async function createNoteFromTemplate() {
    if (!selectedTemplate || !templateTitle.trim()) return;
    try {
      isCreating = true;
      const title = templateTitle.trim();
      const data = await createNoteRequest({
        title,
        category: templateCategory,
        tags: selectedTemplate.tags || [],
        content: buildTemplateContent(selectedTemplate, title),
      });
      showTemplatesModal = false;
      templateTitle = '';
      templateQuery = '';
      await loadTree();
      await loadDirectories();
      dispatch('navigate', { path: data.path, name: title, isDir: false });
    } catch (err) {
      error = $localizedText.sidebar.errors.createNote(err.message);
    } finally {
      isCreating = false;
    }
  }

  export async function createTodayNote() {
    try {
      isCreating = true;
      showCreateModal = false;
      const title = formatTodayNoteTitle();
      const data = await createNoteRequest({
        title,
        category: 'Daily',
        tags: [],
        content: '',
      });
      await loadTree();
      await loadDirectories();
      dispatch('navigate', { path: data.path, name: title, isDir: false });
    } catch (err) {
      error = $localizedText.sidebar.errors.createNote(err.message);
    } finally {
      isCreating = false;
    }
  }

  function openSavedQuickNote() {
    if (!savedQuickNote) return;
    const note = savedQuickNote;
    savedQuickNote = null;
    dispatch('navigate', note);
  }

  async function createQuickNoteFromImage(file) {
    const title = formatTodayNoteTitle();
    const data = await createNoteRequest({
      title,
      category: QUICK_NOTES_CATEGORY,
      tags: [],
      content: '',
    });

    const converted = await convertImageToWebp(file, { name: defaultImageName() });
    const uploaded = await uploadAttachment(data.path, converted, converted.name);
    const created = await loadFileContent(data.path);
    const nextContent = `${created.content.trim()}\n\n${markdownImage(uploaded.name, uploaded.relativePath)}\n`;
    await saveFileContent(data.path, nextContent);

    await loadTree();
    await loadDirectories();
    savedQuickNote = { path: data.path, name: title, isDir: false };
  }

  export async function createQuickNoteFromClipboard() {
    if (!navigator?.clipboard?.readText && !navigator?.clipboard?.read) {
      quickNoteIssue = $localizedText.sidebar.modals.quickNoteClipboardUnavailableHint;
      return;
    }

    try {
      isCreating = true;
      error = '';
      quickNoteIssue = '';
      try {
        const clipboardImage = await firstImageFileFromClipboard();
        if (clipboardImage) {
          await createQuickNoteFromImage(clipboardImage);
          return;
        }
      } catch {
        if (!navigator?.clipboard?.readText) {
          quickNoteIssue = $localizedText.sidebar.modals.quickNoteClipboardUnavailableHint;
          return;
        }
      }

      if (!navigator?.clipboard?.readText) {
        quickNoteIssue = $localizedText.sidebar.modals.quickNoteClipboardUnavailableHint;
        return;
      }

      let clipboardText = '';
      try {
        clipboardText = await navigator.clipboard.readText();
      } catch {
        quickNoteIssue = $localizedText.sidebar.modals.quickNoteClipboardUnavailableHint;
        return;
      }

      if (!clipboardText.trim()) {
        quickNoteIssue = $localizedText.sidebar.modals.quickNoteClipboardEmptyHint;
        return;
      }

      const textImage = firstImageFileFromText(clipboardText);
      if (textImage) {
        await createQuickNoteFromImage(textImage);
        return;
      }

      const title = formatTodayNoteTitle();
      const data = await createNoteRequest({
        title,
        category: QUICK_NOTES_CATEGORY,
        tags: [],
        content: clipboardText,
      });
      await loadTree();
      await loadDirectories();
      savedQuickNote = { path: data.path, name: title, isDir: false };
    } catch (err) {
      error = $localizedText.sidebar.errors.createNote(err.message);
    } finally {
      isCreating = false;
    }
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
      dispatch('openCreateNote');
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
    } else if (action === 'pin') {
      pinNote(path, name);
    } else if (action === 'unpin') {
      unpinNote(path, true);
    } else if (action === 'delete') {
      if (confirm($localizedText.sidebar.confirmDelete(name))) {
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
      const data = await renameItemRequest(contextMenu.targetPath, renameNewName);
      showRenameModal = false;
      
      const affectedSelectedPath = selectedPath && isSameOrDescendant(selectedPath, contextMenu.targetPath)
        ? replacePathPrefix(selectedPath, contextMenu.targetPath, data.path)
        : null;
      
      await loadTree();
      await loadDirectories();
      
      updatePinnedPath(contextMenu.targetPath, data.path, data.name);
      if (affectedSelectedPath) {
        navigateToPath(affectedSelectedPath, contextMenu.isDir && affectedSelectedPath === data.path);
      }
    } catch (err) {
      error = $localizedText.sidebar.errors.rename(err.message);
    } finally {
      isCreating = false;
    }
  }

  async function deleteItem(path) {
    try {
      const deletedActivePath = selectedPath && isSameOrDescendant(selectedPath, path);
      await deleteItemRequest(path);
      unpinNote(path);
      await loadTree();
      await loadDirectories();
      if (deletedActivePath) {
        selectedPath = null;
        dispatch('fileDeleted');
      }
    } catch (err) {
      error = $localizedText.sidebar.errors.delete(err.message);
    }
  }

  async function handleMoveFile(event) {
    const { sourcePath, targetPath } = event.detail;
    try {
      const newSourcePath = movedPath(sourcePath, targetPath);
      const affectedSelectedPath = selectedPath && isSameOrDescendant(selectedPath, sourcePath)
        ? replacePathPrefix(selectedPath, sourcePath, newSourcePath)
        : null;
      await moveItemRequest(sourcePath, targetPath);
      updatePinnedPath(sourcePath, newSourcePath);
      await loadTree();
      await loadDirectories();
      if (affectedSelectedPath) {
        navigateToPath(affectedSelectedPath, false);
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
    if ($editorState.saving || $editorState.dirty) {
      error = $editorState.saving
        ? $localizedText.sidebar.waitForSaveBeforeSync
        : $localizedText.sidebar.saveBeforeSync;
      return;
    }
    isSyncing = true;
    try {
      await syncRequest();
      await loadTree();
      await loadDirectories();
    } catch (e) {
      console.error($localizedText.sidebar.errors.syncFailed, e);
    } finally {
      isSyncing = false;
    }
  }

  function resetDragOver() { isDragOverRoot = false; }

  onMount(() => {
    loadTree();
    loadDirectories();
    loadTags();
    window.addEventListener('click', closeContextMenu);
    window.addEventListener('dragend', resetDragOver);
    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('dragend', resetDragOver);
    };
  });
</script>

  <div
    class="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-primary)]"
    role="presentation"
    on:contextmenu|self={handleBackgroundRightClick}
  >
    <!-- Mobile Navigation Sheet Header -->
    <div class="px-4 pb-1 pt-3 lg:hidden">
      <div class="flex min-h-11 items-center justify-between gap-3">
        <TooltipIconButton
          on:click={() => dispatch('toggleSidebar')}
          class="h-11 w-11 shrink-0 justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] transition hover:border-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          label={$localizedText.sidebar.close}
          tooltip={$localizedText.sidebar.close}
          tooltipAlign="start"
        >
          <Icon.X class="mx-auto h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
        </TooltipIconButton>
      </div>
    </div>

  <!-- Pinned Notes Section -->
  {#if pinnedNotes.length > 0}
    <div class="mb-4 shrink-0 px-4">
      <div class="mb-3 flex min-h-10 items-center justify-between text-[11px] uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)] opacity-60">
        <span>{$localizedText.sidebar.pinned}</span>
        <span class="rounded-full border border-[var(--border-subtle)] px-2 py-1 text-[10px] tabular-nums">{pinnedNotes.length}</span>
      </div>
      <div class="space-y-2">
        {#each pinnedNotes as note (note.path)}
          <button
            on:click={() => handleSelectFile({ detail: { path: note.path, name: note.name, isDir: false } })}
            class="w-full min-h-10 rounded-lg border border-transparent px-2 py-1.5 text-left group hover:border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)]/50 transition"
          >
            <div class="text-xs font-medium truncate group-hover:text-[var(--text-primary)] transition-colors tracking-tight">{note.name}</div>
            <div class="text-[10px] uppercase tracking-[0.1em] text-[var(--text-secondary)] opacity-40 truncate mt-0.5">{recentPathLabel(note)}</div>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if !mobile}
  <!-- Tree View Header -->
    <div class="mb-2 shrink-0 px-4 lg:mb-4">
      <div class="flex items-center justify-between gap-3 pb-1.5 lg:pb-2">
        <h3 class="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)] opacity-60 lg:text-[11px] lg:tracking-[0.22em]">{$localizedText.sidebar.knowledgeTree}</h3>
        <button
          on:click={() => dispatch('openCreateNote')}
          class="tree-header-action absolute right-4 top-3 min-h-11 shrink-0 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/35 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)] transition hover:border-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]/60 hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-subtle)] lg:static lg:min-h-8 lg:rounded-lg lg:border-transparent lg:bg-transparent lg:px-2.5 lg:text-[10px] lg:tracking-[0.16em]"
        >
          <span class="text-sm leading-none">+</span>
          <span class="whitespace-nowrap">{$localizedText.sidebar.new.replace(/^\+\s*/, '')}</span>
        </button>
      </div>
    </div>

  <!-- Tree View or Search Results -->
  <div class="min-h-0 flex-1 overflow-hidden px-3 pb-6 lg:px-4">
    <div
      data-testid="tree-drop-zone"
      class="h-full overflow-y-auto overscroll-contain pr-2"
      class:bg-[var(--border-subtle)]={isDragOverRoot}
      role="presentation"
      on:contextmenu|self={handleBackgroundRightClick}
      on:dragover={handleRootDragOver}
      on:dragleave={handleRootDragLeave}
      on:drop={handleRootDrop}
    >
    {#if isLoading}
      <div class="flex items-center justify-center h-32">
        <span class="text-xs uppercase tracking-widest animate-pulse">{$localizedText.sidebar.loading}</span>
      </div>
    {:else if tree}
      <div class="space-y-0.5 lg:space-y-1">
        {#if isDragOverRoot}
          <div
            class="mx-2 py-3 border-2 border-dashed border-[var(--text-secondary)]/30 rounded text-center"
            role="presentation"
            on:dragover|preventDefault
            on:drop={handleRootDrop}
          >
            <span class="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]/50">{$localizedText.sidebar.dropToRoot}</span>
          </div>
        {/if}
        <!-- Render children directly to hide 'notes' root node -->
        {#key treeKey}
        {#each filteredTree.children || [] as node (node.path)}
          <FileTree 
            {node} 
            {selectedPath} 
            {expandedPaths}
            searchMode={false}
            expanded={expandedPaths.has(node.path)}
            on:navigate={handleSelectFile} 
            on:rightClick={handleRightClick}
            on:moveFile={handleMoveFile}
          />
        {/each}
        {/key}
      </div>
    {:else}
      <div class="flex items-center justify-center h-32">
        <span class="text-xs uppercase tracking-widest opacity-40">{$localizedText.sidebar.empty}</span>
      </div>
    {/if}
    </div>
  </div>
  {/if}

  <!-- Stats Footer -->
  <div class="{mobile ? 'flex-1 flex flex-col justify-center gap-6 px-6 py-8' : 'flex shrink-0 items-center justify-between border-t border-[var(--border-subtle)] px-4 py-3 text-[11px] uppercase tracking-widest'}">
    {#if mobile}
      <button on:click={createQuickNoteFromClipboard} disabled={isCreating} class="flex items-center gap-4 text-left text-sm text-[var(--text-primary)] hover:opacity-70 transition disabled:opacity-30">
        <Icon.Clipboard size="20" strokeWidth="1.7" />
        <span>{$localizedText.sidebar.quickNoteFromClipboard}</span>
      </button>
      <button on:click={handleSync} disabled={isSyncing || $editorState.saving || $editorState.dirty} class="flex items-center gap-4 text-left text-sm text-[var(--text-primary)] hover:opacity-70 transition disabled:opacity-30">
        {#if isSyncing}
          <span class="block w-5 h-5 rounded-full border-2 border-[var(--text-secondary)] border-t-transparent animate-spin"></span>
        {:else}
          <Icon.RefreshCw size="20" strokeWidth="1.7" />
        {/if}
        <span>{$editorState.saving || $editorState.dirty ? $localizedText.sidebar.saveBeforeSync : $localizedText.sidebar.syncWithGit}</span>
      </button>
      <button on:click={() => dispatch('openSettings')} class="flex items-center gap-4 text-left text-sm text-[var(--text-primary)] hover:opacity-70 transition">
        <Icon.Settings size="20" strokeWidth="1.7" />
        <span>{$localizedText.sidebar.settings}</span>
      </button>
    {:else}
      <span class="text-[var(--text-secondary)]">{$localizedText.sidebar.notes(tree ? totalNotes : 0)}</span>
      <div class="flex items-center gap-3">
        <TooltipIconButton
          on:click={createQuickNoteFromClipboard}
          disabled={isCreating}
          class="h-11 w-11 justify-center text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-30 lg:h-10 lg:w-10"
          label={$localizedText.sidebar.quickNoteFromClipboard}
          tooltip={$localizedText.sidebar.quickNoteFromClipboard}
          tooltipAlign="end"
        >
          {#if isCreating}
            <span class="block w-3 h-3 rounded-full border border-[var(--text-secondary)] border-t-transparent animate-spin"></span>
          {:else}
            <Icon.Clipboard size="16" strokeWidth="1.7" />
          {/if}
        </TooltipIconButton>
        <TooltipIconButton
          on:click={handleSync}
          disabled={isSyncing || $editorState.saving || $editorState.dirty}
          class="h-11 w-11 justify-center text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-30 lg:h-10 lg:w-10"
          label={$editorState.saving || $editorState.dirty ? $localizedText.sidebar.saveBeforeSync : $localizedText.sidebar.syncWithGit}
          tooltip={$editorState.saving || $editorState.dirty ? $localizedText.sidebar.saveBeforeSync : $localizedText.sidebar.syncWithGit}
          tooltipAlign="end"
        >
          {#if isSyncing}
            <span class="block w-3 h-3 rounded-full border border-[var(--text-secondary)] border-t-transparent animate-spin"></span>
          {:else}
            <Icon.RefreshCw class="w-4 h-4" strokeWidth="1.7" aria-hidden="true" />
          {/if}
        </TooltipIconButton>
        <TooltipIconButton
          on:click={() => dispatch('openSettings')}
          class="h-11 w-11 justify-center text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] lg:h-10 lg:w-10"
          label={$localizedText.sidebar.settings}
          tooltip={$localizedText.sidebar.settings}
          tooltipAlign="end"
        >
          <Icon.Settings class="w-4 h-4" strokeWidth="1.7" aria-hidden="true" />
        </TooltipIconButton>
      </div>
    {/if}
    </div>

  <!-- Context Menu -->
  {#if contextMenu.show}
    <div 
      class="fixed bg-[var(--bg-primary)] border border-[var(--border-subtle)] shadow-2xl py-2 z-[100] w-48"
      style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
    >
      {#if contextMenu.isDir}
        <button on:click={() => handleContextAction('newNote')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest hover:bg-[var(--border-subtle)] transition">{$localizedText.sidebar.context.newNote}</button>
        <button on:click={() => handleContextAction('newFolder')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest hover:bg-[var(--border-subtle)] transition">{$localizedText.sidebar.context.newFolder}</button>
        <div class="h-[1px] bg-[var(--border-subtle)] my-1"></div>
      {/if}
      {#if !contextMenu.isDir}
        {#if isPinned(contextMenu.targetPath)}
          <button on:click={() => handleContextAction('unpin')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest hover:bg-[var(--border-subtle)] transition">{$localizedText.sidebar.context.unpin}</button>
        {:else}
          <button on:click={() => handleContextAction('pin')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest hover:bg-[var(--border-subtle)] transition">{$localizedText.sidebar.context.pin}</button>
        {/if}
        <div class="h-[1px] bg-[var(--border-subtle)] my-1"></div>
      {/if}
      <button on:click={() => handleContextAction('setIcon')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest hover:bg-[var(--border-subtle)] transition">{$localizedText.sidebar.context.editIcon}</button>
      <button on:click={() => handleContextAction('rename')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest hover:bg-[var(--border-subtle)] transition">{$localizedText.sidebar.context.rename}</button>
      <button on:click={() => handleContextAction('delete')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest hover:bg-red-500/10 text-red-500 transition">{$localizedText.sidebar.context.delete}</button>
    </div>
  {/if}
</div>

<!-- Quick Note Saved Modal -->
{#if savedQuickNote}
  <ModalShell title={$localizedText.sidebar.modals.quickNoteSaved} widthClass="w-[min(92vw,28rem)]" closeOnEscape={true} on:close={() => savedQuickNote = null}>
    <div class="space-y-4">
      <p class="text-sm leading-relaxed text-[var(--text-secondary)]">
        {$localizedText.sidebar.modals.quickNoteSavedHint}
      </p>
      <div class="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/35 px-4 py-3">
        <div class="truncate text-sm font-semibold">{savedQuickNote.name}</div>
        <div class="mt-1 truncate text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]/60">{savedQuickNote.path.replace(/^notes\//, '')}</div>
      </div>
    </div>
    <div class="mt-8 flex gap-4">
      <button type="button" on:click={() => savedQuickNote = null} class="flex-1 text-sm font-medium transition hover:opacity-60">
        {$localizedText.sidebar.modals.stayHere}
      </button>
      <button type="button" on:click={openSavedQuickNote} class="flex-1 text-sm font-bold uppercase tracking-widest transition hover:opacity-60">
        {$localizedText.sidebar.modals.openNote}
      </button>
    </div>
  </ModalShell>
{/if}

{#if quickNoteIssue}
  <ModalShell title={$localizedText.sidebar.modals.quickNoteNotCreated} widthClass="w-[min(92vw,28rem)]" closeOnEscape={true} on:close={() => quickNoteIssue = ''}>
    <p class="text-sm leading-relaxed text-[var(--text-secondary)]">
      {quickNoteIssue}
    </p>
    <div class="mt-8 flex justify-center">
      <button type="button" on:click={() => quickNoteIssue = ''} class="text-sm font-bold uppercase tracking-widest transition hover:opacity-60">
        {$localizedText.sidebar.modals.understood}
      </button>
    </div>
  </ModalShell>
{/if}

<!-- Rename Modal -->
{#if showRenameModal}
  <ModalShell title={$localizedText.sidebar.modals.renameTitle(contextMenu.isDir ? $localizedText.sidebar.modals.section : $localizedText.sidebar.modals.note)} on:close={() => showRenameModal = false}>
      <div class="space-y-8">
        <div>
          <label for="rename-input" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">{$localizedText.sidebar.modals.newName}</label>
          <input 
            id="rename-input" 
            type="text" 
            bind:value={renameNewName} 
            placeholder={$localizedText.sidebar.modals.newNamePlaceholder}
            class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none"
            on:keydown={(e) => e.key === 'Enter' && renameItem()}
          />
        </div>
      </div>
      <div class="flex gap-6 mt-12">
        <button on:click={() => showRenameModal = false} class="flex-1 text-sm font-medium uppercase tracking-widest hover:opacity-60 transition">{$localizedText.sidebar.modals.cancel}</button>
        <button on:click={renameItem} disabled={isCreating || !renameNewName.trim() || renameNewName === renameOldName} class="flex-1 text-sm font-bold uppercase tracking-widest hover:opacity-60 transition disabled:opacity-30">
          {isCreating ? $localizedText.sidebar.modals.renaming : $localizedText.sidebar.modals.rename}
        </button>
      </div>
  </ModalShell>
{/if}

<!-- Icon Picker Modal -->
{#if showIconModal}
  <ModalShell title={$localizedText.sidebar.modals.iconColor} widthClass="w-[28rem]" on:close={() => showIconModal = false}>
      <div class="mb-6">
        <fieldset>
          <legend class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">{$localizedText.sidebar.modals.color}</legend>
        <div class="flex gap-2 flex-wrap">
          {#each colorOptions as c}
            <TooltipIconButton
              on:click={() => setItemColor(c)}
              class="w-7 h-7 rounded-full border-2 transition-all {selectedColor === c ? 'border-[var(--text-primary)] scale-110' : 'border-transparent hover:scale-105'}"
              style="background: {c}"
              label={c}
              tooltip={c}
            ></TooltipIconButton>
          {/each}
        </div>
        </fieldset>
      </div>
      <div class="grid grid-cols-6 gap-3">
        <TooltipIconButton on:click={() => setFolderIcon(null)} class="w-full aspect-square flex items-center justify-center border border-[var(--border-subtle)] hover:bg-[var(--border-subtle)] transition text-[9px] uppercase tracking-tighter opacity-50" label={$localizedText.sidebar.modals.none}>{$localizedText.sidebar.modals.none}</TooltipIconButton>
        {#each iconOptions as icon}
          <TooltipIconButton
            on:click={() => setFolderIcon(icon)}
            class="w-full aspect-square flex items-center justify-center hover:bg-[var(--border-subtle)] transition rounded border border-transparent hover:border-[var(--border-subtle)]"
            label={icon}
            tooltip={icon}
          >
            {#if iconMap[icon]}
              <svelte:component this={iconMap[icon]} size="20" aria-hidden="true" />
            {/if}
          </TooltipIconButton>
        {/each}
      </div>
      <div class="mt-8">
        <button on:click={() => showIconModal = false} class="w-full text-sm font-medium uppercase tracking-widest hover:opacity-60 transition">{$localizedText.sidebar.modals.cancel}</button>
      </div>
  </ModalShell>
{/if}

<!-- Create Folder Modal -->
{#if showCreateFolderModal}
  <ModalShell title={$localizedText.sidebar.modals.newSection} closeOnEscape={true} on:close={() => showCreateFolderModal = false}>
      <div class="space-y-8">
        <div>
          <label for="parent-folder" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">{$localizedText.sidebar.modals.parentFolder}</label>
          <select id="parent-folder" bind:value={newFolderName} class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 text-sm outline-none appearance-none cursor-pointer">
            {#each directoryList as dir}
              <option value={dir}>{dir || $localizedText.sidebar.modals.root}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="folder-name" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">{$localizedText.sidebar.modals.folderName}</label>
          <input id="folder-name" type="text" bind:value={newFolderNameInput} placeholder={$localizedText.sidebar.modals.folderPlaceholder} class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none" on:keydown={(e) => { if (e.key === 'Enter' && newFolderNameInput.trim()) createFolder(); if (e.key === 'Escape') showCreateFolderModal = false; }} />
        </div>
      </div>
      <div class="flex gap-6 mt-12">
        <button on:click={() => showCreateFolderModal = false} class="flex-1 text-sm font-medium uppercase tracking-widest hover:opacity-60 transition">{$localizedText.sidebar.modals.cancel}</button>
        <button on:click={createFolder} disabled={isCreating || !newFolderNameInput.trim()} class="flex-1 text-sm font-bold uppercase tracking-widest hover:opacity-60 transition disabled:opacity-30">
          {isCreating ? $localizedText.sidebar.modals.creating : $localizedText.sidebar.modals.create}
        </button>
      </div>
  </ModalShell>
{/if}

<!-- Templates Modal -->
{#if showTemplatesModal}
  <ModalShell title={$localizedText.sidebar.templateLibrary} widthClass="w-[min(94vw,68rem)] h-[88vh] max-h-[88vh] overflow-hidden flex flex-col" closeOnEscape={true} on:close={() => showTemplatesModal = false}>
    <div class="grid min-h-0 flex-1 gap-6 overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
      <div class="min-h-0 flex flex-col overflow-hidden">
        <div class="mb-4">
          <label for="template-search" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">{$localizedText.sidebar.templateSearch}</label>
          <input
            id="template-search"
            type="text"
            bind:value={templateQuery}
            placeholder={$localizedText.sidebar.templateSearchPlaceholder}
            class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none"
          />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2 space-y-5" data-testid="template-list-scroll">
          {#if templateGroups.length === 0}
            <div class="py-12 text-center text-sm text-[var(--text-secondary)]">{$localizedText.sidebar.noTemplates}</div>
          {/if}

          {#each templateGroups as group}
            <section class="pt-6 first:pt-0">
              <div class="mb-3">
                <div class="flex items-center gap-3">
                  <h3 class="shrink-0 text-[10px] uppercase tracking-[0.22em] font-bold text-[var(--text-secondary)]/80">{group.title}</h3>
                  <span class="h-px flex-1 bg-[var(--border-subtle)]"></span>
                </div>
                <p class="mt-1.5 max-w-xl text-xs leading-relaxed text-[var(--text-secondary)]/70">{group.description}</p>
              </div>
              <div class="grid gap-2">
                {#each group.templates as template}
                  <button
                    type="button"
                    on:click={() => selectTemplate(template)}
                    class="w-full rounded-xl border p-3 text-left transition {selectedTemplateId === template.id ? 'border-[var(--text-primary)] bg-[var(--bg-secondary)]' : 'border-[var(--border-subtle)] hover:border-[var(--text-secondary)]/50'}"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="font-serif text-base leading-snug">{template.title}</div>
                        <p class="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{template.description}</p>
                      </div>
                      <span class="shrink-0 text-[9px] uppercase tracking-widest text-[var(--text-secondary)]/60">{template.category}</span>
                    </div>
                    <div class="mt-3 flex flex-wrap gap-1.5">
                      {#each template.tags as tag}
                        <span class="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[9px] uppercase tracking-wider text-[var(--text-secondary)]/70">#{tag}</span>
                      {/each}
                    </div>
                  </button>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      </div>

      <div class="min-h-0 flex flex-col overflow-hidden border-t border-[var(--border-subtle)] pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="template-title" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">{$localizedText.sidebar.modals.title}</label>
            <input
              id="template-title"
              type="text"
              bind:value={templateTitle}
              class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 outline-none"
            />
          </div>
          <div>
            <label for="template-category" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">{$localizedText.sidebar.templateFolder}</label>
            <select
              id="template-category"
              bind:value={templateCategory}
              class="w-full bg-transparent border-b border-[var(--border-subtle)] py-2 text-sm outline-none appearance-none cursor-pointer"
            >
              {#each templateDirectoryList as dir}
                <option value={dir}>{dir || $localizedText.sidebar.modals.root}</option>
              {/each}
            </select>
          </div>
        </div>

        <div class="mt-5 min-h-0 flex flex-1 flex-col overflow-hidden">
          <div class="mb-2 flex items-center justify-between gap-3">
            <h3 class="text-xs uppercase tracking-widest text-[var(--text-secondary)]">{$localizedText.sidebar.templatePreview}</h3>
          </div>
          <div
            class="template-preview min-h-0 flex-1 overflow-auto overscroll-contain rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/40 p-4 text-[var(--text-secondary)]"
            data-testid="template-preview-scroll"
          >
            {@html templatePreviewHtml}
          </div>
        </div>

        <div class="mt-6 flex gap-4">
          <button on:click={() => showTemplatesModal = false} class="flex-1 text-sm font-medium hover:opacity-60 transition">{$localizedText.sidebar.modals.cancel}</button>
          <button on:click={createNoteFromTemplate} disabled={isCreating || !templateTitle.trim()} class="flex-1 text-sm font-bold uppercase tracking-widest hover:opacity-60 transition disabled:opacity-30">
            {isCreating ? $localizedText.sidebar.modals.creating : $localizedText.sidebar.useTemplate}
          </button>
        </div>
      </div>
    </div>
  </ModalShell>
{/if}

<style>
  :global(.sidebar button) {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .tree-header-action {
    justify-content: flex-start;
  }

  :global(.template-preview) {
    line-height: 1.7;
    font-size: 0.8125rem;
  }

  :global(.template-preview h1) {
    margin-bottom: 1.25rem;
    color: var(--text-primary);
    font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.25;
  }

  :global(.template-preview h2) {
    margin-top: 1.5rem;
    margin-bottom: 0.6rem;
    color: var(--text-primary);
    font-size: 0.85rem;
    font-weight: 700;
  }

  :global(.template-preview h3) {
    margin-top: 1rem;
    margin-bottom: 0.45rem;
    color: var(--text-primary);
    font-size: 0.8rem;
    font-weight: 700;
  }

  :global(.template-preview p) {
    margin-bottom: 0.75rem;
  }

  :global(.template-preview ul),
  :global(.template-preview ol) {
    margin-left: 1.25rem;
    margin-bottom: 0.75rem;
  }

  :global(.template-preview ul) {
    list-style: disc;
  }

  :global(.template-preview ol) {
    list-style: decimal;
  }

  :global(.template-preview li) {
    margin-bottom: 0.25rem;
  }

  :global(.template-preview table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0.75rem 0 1rem;
    font-size: 0.75rem;
  }

  :global(.template-preview th),
  :global(.template-preview td) {
    border-bottom: 1px solid var(--border-subtle);
    padding: 0.45rem 0.55rem;
    text-align: left;
    vertical-align: top;
  }

  :global(.template-preview th) {
    color: var(--text-primary);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  :global(.template-preview input[type='checkbox']) {
    margin-right: 0.35rem;
    vertical-align: middle;
  }
</style>
