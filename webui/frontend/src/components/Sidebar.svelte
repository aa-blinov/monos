<script>
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import { marked } from 'marked';
  import FileTree from './FileTree.svelte';
  import { announceTrashed, trashedNote } from '../lib/trash-undo.js';
  import { loadSavedSearches, savedSearches } from '../lib/saved-searches.js';
  import { conflictedFiles, conflictedNotes, refreshConflicts, revealConflicts } from '../lib/git-conflicts.js';
  import { terminalBridge } from '../lib/terminal.js';
  import { agentReviewOpen, syncBlockedByReview } from '../lib/agent-review.js';
  import { get as getRequest } from '../lib/api/client.js';
  import ModalShell from './ModalShell.svelte';
  import RenameModal from './RenameModal.svelte';
  import IconPickerModal from './IconPickerModal.svelte';
  import {
    isSameOrDescendant,
    basename,
    parentPath,
    displayNoteName,
    renameInputName,
    fileExtension,
    replacePathPrefix,
  } from '../lib/sidebar-utils.js';
  import { pinnedNotes, isPinned, pinNote, unpinNote, setPinnedFromTree, migrateLegacyPins } from '../lib/sidebar-pinned.js';
  import { computeContextMenuPosition } from '../lib/context-menu-position.js';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import ConfirmModal from './ConfirmModal.svelte';
  import { iconOptions } from '../lib/icons.js';
  import { getTemplateContext, noteTemplates } from '../lib/note-templates.js';
  import {
    buildRuntimeTemplateContent,
    customNoteTemplates,
    getTemplateCatalog,
    getTemplateCatalogById,
    hiddenLibraryTemplateIds,
  } from '../lib/template-library.js';
  import { locale, localizedText } from '../lib/strings.js';
  
  export let mobile = false;
  export let gitConfigured = true;
  
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
    checkGitStatus,
  } from '../lib/sidebar-api.js';
  import { bulkTagRequest, duplicateNoteRequest, loadFileContent, saveFileContent, uploadAttachment } from '../lib/editor-api.js';
  import { announceNoteLinksUpdated, announceNotesPulled, flushOpenNote } from '../lib/note-refresh.js';
  import {
    convertImageToWebp,
    imageNameFor,
    firstImageFileFromClipboard,
    firstImageFileFromText,
    markdownImage,
  } from '../lib/attachments.js';
  import { editorState, activeTheme, templateRequest } from '../stores.js';
  import { DEFAULT_ICON_COLOR, getNoteColorOptions } from '../lib/note-colors.js';
  import { getModalButtonClass } from '../lib/modal-button.js';
  import { extractTemplateMetadata, normalizeEmptyListItems } from '../lib/template-preview.js';
  import { localeStamp } from '../lib/date-format.js';
  import { fileNameProblem } from '../lib/file-name.js';
  import { formFieldClass } from '../lib/form-field.js';
  import { Icon } from '../lib/tree-icons.js';

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
  // Ошибка создания из шаблона: видна в самой модалке, а не за её пределами.
  let templateError = '';
  // Путь заметки с тем же названием: модалка предложит открыть её или создать копию.
  let templateDuplicatePath = '';
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

  // A new person sees the tools that have something in them. Tags, saved searches and the table of all
  // properties appear once the first one exists; until then each stays one Ctrl/⌘+K away. A failed check
  // shows the link rather than hide a tool that has content.
  let hasProperties = false;
  async function loadPropertyPresence() {
    try {
      const table = await getRequest('/api/notes/table', { limit: 1 });
      hasProperties = Array.isArray(table?.keys) && table.keys.length > 0;
    } catch {
      hasProperties = true;
    }
  }
  $: showTagsLink = allTags.length > 0;
  $: showSavedSearchesLink = $savedSearches.length > 0;
  $: showPropertiesLink = hasProperties;

  /** @type {Array<string>} */
  let directoryList = [""];

  /** @type {boolean} */
  let showRenameModal = false;
  /** @type {string} */
  let renameNewName = '';
  /** @type {string} */
  let renameOldName = '';
  let renameTarget = null;

  /** @type {boolean} */
  let showIconModal = false;
  /** @type {string} */
  let iconPickerTarget = null;
  /** @type {string} */
  let selectedColor = DEFAULT_ICON_COLOR;

  $: colorOptions = getNoteColorOptions($activeTheme);

  const QUICK_NOTES_CATEGORY = 'Quick Notes';
  const allowedPreviewTags = new Set([
    'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'EM', 'H1', 'H2', 'H3',
    'H4', 'H5', 'H6', 'HR', 'I', 'INPUT', 'LI', 'OL', 'P', 'PRE', 'S',
    'STRONG', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL',
  ]);
  const dropPreviewTags = new Set(['IFRAME', 'OBJECT', 'SCRIPT', 'STYLE']);

  // Context Menu State
  let contextMenu = { show: false, x: 0, y: 0, targetPath: null, targetName: '', isDir: false };
  let pendingDelete = null;
  let contextMenuEl = null;
  let contextMenuPos = { x: 0, y: 0 };
  const CONTEXT_MENU_MARGIN = 4;
  $: if (contextMenu.show && contextMenuEl) adjustContextMenuPosition();
  // Arrow keys move through the items, Escape closes the menu (the mouse path already worked).
  function handleContextMenuKeys(event) {
    const items = [...(contextMenuEl?.querySelectorAll('[role="menuitem"]') ?? [])];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length].focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      contextMenu.show = false;
    }
  }

  async function adjustContextMenuPosition() {
    await tick();
    if (!contextMenu.show || !contextMenuEl) return;
    const rect = contextMenuEl.getBoundingClientRect();
    const next = computeContextMenuPosition({
      x: contextMenu.x,
      y: contextMenu.y,
      menuWidth: rect.width,
      menuHeight: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      margin: CONTEXT_MENU_MARGIN,
    });
    contextMenuPos = { x: next.x, y: next.y };
    // Opened from the keyboard (Menu key, Shift+F10), the first item takes the focus. Opened with the mouse,
    // the menu itself does: a focused first item drew the browser's keyboard ring on it, bright and only
    // sometimes, depending on whether a key had been pressed before.
    if (contextMenu.byKeyboard) contextMenuEl.querySelector('[role="menuitem"]')?.focus();
    else contextMenuEl.focus({ preventScroll: true });
  }
  let isDragOverRoot = false;
  let isSyncing = false;
  export let autoPullState = { conflicts: false, received: 0 };
  let syncError = '';

  let selectedPaths = new Set();
  let showBulkTagPrompt = false;
  let bulkTagValue = '';
  let bulkBusy = false;
  let bulkError = '';
  let bulkTagPaths = [];
  let duplicateTarget = '';

  $: filteredTree = tree;
  $: localizedTemplates = getTemplateCatalog($locale, $hiddenLibraryTemplateIds, $customNoteTemplates);
  $: selectedTemplate = getTemplateCatalogById(selectedTemplateId, $locale, $hiddenLibraryTemplateIds, $customNoteTemplates);
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
    ? buildRuntimeTemplateContent(selectedTemplate, templateTitle || selectedTemplate.title, new Date(), $locale)
    : '';
  $: templatePreviewParts = extractTemplateMetadata(templatePreview);
  $: templateTitleProblem = fileNameProblem(templateTitle);
  $: templatePreviewBodyHtml = sanitizePreviewHtml(marked.parse(normalizeEmptyListItems(templatePreviewParts.rest)));
  $: templatePreviewGridCols = templatePreviewParts.metadata.length >= 3 ? 3 : templatePreviewParts.metadata.length || 1;
  $: if (showTemplatesModal && templateLocale !== $locale) {
    templateLocale = $locale;
    applyTemplateDefaults(getTemplateCatalogById(selectedTemplateId, $locale, $hiddenLibraryTemplateIds, $customNoteTemplates));
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

  function renameRequestName(inputName, oldName = '', isDir = false) {
    const trimmed = String(inputName || '').trim();
    if (isDir) return trimmed;
    const extension = fileExtension(oldName);
    return extension && !trimmed.toLowerCase().endsWith(extension.toLowerCase())
      ? `${trimmed}${extension}`
      : trimmed;
  }


  function closeRenameModal() {
    showRenameModal = false;
    renameTarget = null;
    renameNewName = '';
    renameOldName = '';
  }

  function recentPathLabel(note) {
    const relativePath = note.path?.startsWith('notes/') ? note.path.slice(6) : note.path || '';
    return relativePath.split('/').slice(0, -1).join('/');
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
  $: selectedNoteCount = selectedPaths.size;

  // Заметка «сегодня» и быстрая заметка называются датой по языку интерфейса.
  export function formatTodayNoteTitle(date = new Date()) {
    return localeStamp(date, $locale);
  }

  let pendingSelectedPath = null;
  let treeKey = 0;

  export async function loadTree() {
    try {
      if (!tree) isLoading = true;
      error = '';
      tree = await loadTreeData();
      await loadTags();
      void loadPropertyPresence();
      // Закрепления читаются из самих заметок, поэтому список живёт ровно
      // столько, сколько живёт дерево.
      setPinnedFromTree(tree);
      treeKey++;
      if (pendingSelectedPath) {
        selectedPath = pendingSelectedPath;
        expandToPath(tree, pendingSelectedPath, { replace: false });
        pendingSelectedPath = null;
      }
    } catch (err) {
      error = $localizedText.sidebar.errors.loadTree(err.message);
    } finally {
      isLoading = false;
    }
  }

  function expandToPath(node, targetPath, { replace = true } = {}) {
    const nextExpandedPaths = replace ? new Set() : new Set(expandedPaths);
    if (!node || !targetPath) {
      expandedPaths = nextExpandedPaths;
      return;
    }
    _find(node, targetPath, nextExpandedPaths);
    expandedPaths = nextExpandedPaths;
  }

  function _find(node, targetPath, nextExpandedPaths) {
    if (node.path === targetPath) return true;
    if (node.children) {
      for (const child of node.children) {
        if (_find(child, targetPath, nextExpandedPaths)) {
          nextExpandedPaths.add(child.path);
          return true;
        }
      }
    }
    return false;
  }

  let expandedPaths = new Set();

  export function setSelected(path) {
    clearSelectedNotes();
    // Пересоздавать дерево нужно только когда раскрытие реально изменилось.
    // Безусловный treeKey++ перерисовывал всю ветку при каждом открытии
    // заметки — это и было моргание.
    if (expandToPath(tree, path, { replace: false })) treeKey++;
    selectedPath = path;
  }

  function handleToggleExpand(event) {
    const { path, expanded } = event.detail;
    if (!path) return;
    const next = new Set(expandedPaths);
    if (expanded) next.add(path);
    else {
      for (const expandedPath of [...next]) {
        if (expandedPath === path || expandedPath.startsWith(`${path}/`)) next.delete(expandedPath);
      }
    }
    expandedPaths = next;
  }

  function keepParentsExpanded(paths) {
    for (const itemPath of paths) {
      const parent = parentPath(itemPath);
      if (parent && parent !== 'notes') expandToPath(tree, parent, { replace: false });
    }
  }

  function removeExpandedDescendants(paths) {
    const next = new Set(expandedPaths);
    for (const itemPath of paths) {
      for (const expandedPath of [...next]) {
        if (expandedPath === itemPath || expandedPath.startsWith(`${itemPath}/`)) next.delete(expandedPath);
      }
    }
    expandedPaths = next;
  }

  function clearSelectedNotes() {
    if (selectedPaths.size === 0) return;
    selectedPaths = new Set();
  }

  function toggleSelectedNote(path) {
    const next = new Set(selectedPaths);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    selectedPaths = next;
  }

  function selectedContextPaths(path, isDir) {
    if (isDir) return [];
    return selectedPaths.has(path) ? [...selectedPaths] : [];
  }

  export function openCreateNote() {
    dispatch('openCreateNote');
  }

  function applyTemplateDefaults(template = selectedTemplate) {
    if (!template) return;
    const ctx = getTemplateContext('', new Date(), $locale);
    templateTitle = template.suggestedTitle?.(ctx) || template.title;
    templateCategory = template.category || '';
  }

  // Менеджер шаблонов передаёт сюда id: модалка открывается уже на этом шаблоне.
  $: if ($templateRequest) {
    const requestedId = $templateRequest;
    templateRequest.set(null);
    openTemplates(requestedId);
  }

  export function openTemplates(templateId = selectedTemplateId) {
    templateQuery = '';
    templateError = '';
    templateDuplicatePath = '';
    templateLocale = $locale;
    const template = getTemplateCatalogById(templateId, $locale, $hiddenLibraryTemplateIds, $customNoteTemplates) || selectedTemplate;
    selectedTemplateId = template?.id;
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

  // Имя папки станет именем каталога на диске: то, что ОС не создаст, отклоняем сразу.
  $: folderNameProblem = fileNameProblem(newFolderNameInput);

  async function createFolder() {
    if (!newFolderNameInput.trim() || folderNameProblem) return;
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
      error = err.status === 409 ? $localizedText.sidebar.errors.duplicateNote : $localizedText.sidebar.errors.createNote(err.message);
    } finally {
      isCreating = false;
    }
  }

  async function createNoteFromTemplate() {
    if (!selectedTemplate || !templateTitle.trim() || templateTitleProblem) return;
    try {
      isCreating = true;
      templateError = '';
      templateDuplicatePath = '';
      const title = templateTitle.trim();
      const data = await createNoteRequest({
        title,
        category: templateCategory,
        tags: selectedTemplate.tags || [],
        content: buildRuntimeTemplateContent(selectedTemplate, title, new Date(), $locale),
      });
      await finishTemplateCreate(data, title);
    } catch (err) {
      templateDuplicatePath = err.status === 409 && err.body?.path ? err.body.path : '';
      templateError = err.status === 409
        ? $localizedText.sidebar.errors.duplicateNote
        : $localizedText.sidebar.errors.createNote(err.message);
    } finally {
      isCreating = false;
    }
  }

  // Модалка закрывается, заметка открывается: и для новой, и для уже существующей.
  async function finishTemplateCreate(data, title) {
    showTemplatesModal = false;
    templateTitle = '';
    templateQuery = '';
    await loadTree();
    await loadDirectories();
    dispatch('navigate', { path: data.path, name: title, isDir: false });
  }

  async function openExistingTemplateNote() {
    const path = templateDuplicatePath;
    const title = templateTitle.trim();
    templateError = '';
    templateDuplicatePath = '';
    await finishTemplateCreate({ path }, title);
  }

  // Имя занято: создаём копию с номером — первое свободное из 2…20, как при обычном создании.
  async function createTemplateNumberedCopy() {
    if (isCreating || !selectedTemplate) return;
    const base = templateTitle.trim();
    try {
      isCreating = true;
      templateError = '';
      for (let n = 2; n <= 20; n += 1) {
        const title = `${base} ${n}`;
        try {
          const data = await createNoteRequest({
            title,
            category: templateCategory,
            tags: selectedTemplate.tags || [],
            content: buildRuntimeTemplateContent(selectedTemplate, title, new Date(), $locale),
          });
          await finishTemplateCreate(data, title);
          return;
        } catch (err) {
          if (err.status !== 409) throw err;
        }
      }
      templateError = $localizedText.sidebar.errors.duplicateNote;
    } catch (err) {
      templateError = $localizedText.sidebar.errors.createNote(err.message);
    } finally {
      isCreating = false;
    }
  }

  // Two captures in the same second get the same timestamp title. The backend refuses a
  // taken name with 409, so the capture takes the next free number instead of failing.
  async function createQuickNoteRecord(baseTitle, payload) {
    for (let n = 1; n <= 20; n += 1) {
      const title = n === 1 ? baseTitle : `${baseTitle} ${n}`;
      try {
        return { title, data: await createNoteRequest({ ...payload, title }) };
      } catch (err) {
        if (err.status !== 409) throw err;
      }
    }
    throw new Error(`no free note name for ${baseTitle}`);
  }

  async function createQuickNoteFromImage(file) {
    const { title, data } = await createQuickNoteRecord(formatTodayNoteTitle(), {
      category: QUICK_NOTES_CATEGORY,
      tags: [],
      content: '',
    });

    const converted = await convertImageToWebp(file, { name: imageNameFor(file) });
    const uploaded = await uploadAttachment(data.path, converted, converted.name);
    const created = await loadFileContent(data.path);
    const nextContent = `${created.content.trim()}\n\n${markdownImage(uploaded.name, uploaded.relativePath)}\n`;
    await saveFileContent(data.path, nextContent);

    await loadTree();
    await loadDirectories();
    dispatch('quickNoteSaved', { path: data.path, name: title, isDir: false });
  }

  export async function createQuickNoteFromClipboard() {
    if (!navigator?.clipboard?.readText && !navigator?.clipboard?.read) {
      dispatch('quickNoteIssue', $localizedText.sidebar.modals.quickNoteClipboardUnavailableHint);
      return;
    }

    try {
      isCreating = true;
      error = '';
      try {
        const clipboardImage = await firstImageFileFromClipboard();
        if (clipboardImage) {
          await createQuickNoteFromImage(clipboardImage);
          return;
        }
      } catch {
        if (!navigator?.clipboard?.readText) {
          dispatch('quickNoteIssue', $localizedText.sidebar.modals.quickNoteClipboardUnavailableHint);
          return;
        }
      }

      if (!navigator?.clipboard?.readText) {
        dispatch('quickNoteIssue', $localizedText.sidebar.modals.quickNoteClipboardUnavailableHint);
        return;
      }

      let clipboardText = '';
      try {
        clipboardText = await navigator.clipboard.readText();
      } catch {
        dispatch('quickNoteIssue', $localizedText.sidebar.modals.quickNoteClipboardUnavailableHint);
        return;
      }

      if (!clipboardText.trim()) {
        dispatch('quickNoteIssue', $localizedText.sidebar.modals.quickNoteClipboardEmptyHint);
        return;
      }

      const textImage = firstImageFileFromText(clipboardText);
      if (textImage) {
        await createQuickNoteFromImage(textImage);
        return;
      }

      const { title, data } = await createQuickNoteRecord(formatTodayNoteTitle(), {
        category: QUICK_NOTES_CATEGORY,
        tags: [],
        content: clipboardText,
      });
      await loadTree();
      await loadDirectories();
      dispatch('quickNoteSaved', { path: data.path, name: title, isDir: false });
    } catch (err) {
      error = err.status === 409 ? $localizedText.sidebar.errors.duplicateNote : $localizedText.sidebar.errors.createNote(err.message);
    } finally {
      isCreating = false;
    }
  }

  function handleSelectFile(event) {
    const detail = event.detail;
    setSelected(detail.path);
    dispatch('navigate', detail);
  }

  function handleToggleSelectFile(event) {
    const { path } = event.detail;
    if (!path) return;
    toggleSelectedNote(path);
  }

  function handleRightClick(event) {
    const { x, y, path, name, isDir, byKeyboard = false } = event.detail;
    const selectionPaths = selectedContextPaths(path, isDir);
    if (selectionPaths.length === 0) clearSelectedNotes();
    contextMenu = {
      show: true,
      x,
      y,
      targetPath: path,
      targetName: name,
      isDir,
      selectionPaths,
      byKeyboard,
    };
  }

  function handleBackgroundRightClick(e) {
    e.preventDefault();
    contextMenu = { show: true, x: e.clientX, y: e.clientY, targetPath: 'notes', targetName: 'notes', isDir: true, selectionPaths: [] };
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
      dispatch('openCreateNote', { category: categoryPath });
    } else if (action === 'newFolder') {
      newFolderName = categoryPath;
      showCreateFolderModal = true;
    } else if (action === 'setIcon') {
      iconPickerTarget = path;
      showIconModal = true;
    } else if (action === 'rename') {
      renameTarget = { path, name, isDir: contextMenu.isDir };
      renameOldName = renameInputName(name, contextMenu.isDir);
      renameNewName = renameOldName;
      showRenameModal = true;
    } else if (action === 'pin') {
      pinNote(path, name);
    } else if (action === 'unpin') {
      unpinNote(path);
    } else if (action === 'delete') {
      const deletePaths = contextMenu.selectionPaths?.length ? contextMenu.selectionPaths : [path];
      // One note goes to the trash at once, with an undo notice. A folder is deleted for good and a
      // selection touches many notes, so those still ask first.
      if (!contextMenu.isDir && deletePaths.length === 1) {
        const note = trashedNote(deletePaths[0], displayNoteName(name));
        closeContextMenu();
        void deleteItems(deletePaths).then((done) => { if (done) announceTrashed([note]); });
        return;
      }
      pendingDelete = {
        paths: deletePaths,
        message: deletePaths.length > 1
          ? $localizedText.sidebar.confirmDeleteMany(deletePaths.length)
          : $localizedText.sidebar.confirmDelete(name, contextMenu.isDir),
      };
    }
    closeContextMenu();
  }

  async function renameItem() {
    const target = renameTarget;
    const nextInputName = renameNewName.trim();
    if (!target || !nextInputName || nextInputName === renameOldName) {
      closeRenameModal();
      return;
    }

    try {
      isCreating = true;
      const requestName = renameRequestName(nextInputName, target.name, target.isDir);
      await flushOpenNote();
      const data = await renameItemRequest(target.path, requestName);
      announceNoteLinksUpdated(data);
      closeRenameModal();
      
      const affectedSelectedPath = selectedPath && isSameOrDescendant(selectedPath, target.path)
        ? replacePathPrefix(selectedPath, target.path, data.path)
        : null;
      
      if (affectedSelectedPath) {
        navigateToPath(affectedSelectedPath, target.isDir && affectedSelectedPath === data.path);
      }
      await loadTree();
      await loadDirectories();
    } catch (err) {
      error = $localizedText.sidebar.errors.rename(err.message);
    } finally {
      isCreating = false;
    }
  }

  function cancelPendingDelete() {
    pendingDelete = null;
  }

  function confirmPendingDelete() {
    const paths = pendingDelete?.paths;
    pendingDelete = null;
    if (paths?.length) deleteItems(paths);
  }

  // A note is resolved in the note itself; a file that is not a note (an attachment) in Settings.
  // The "More" row's menu (desktop footer).
  let moreOpen = false;
  let moreAnchor;
  const moreItemClass = 'flex h-8 w-full items-center gap-2.5 px-3 text-left text-sm text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] focus-visible:bg-[var(--bg-secondary)] focus-visible:text-[var(--text-primary)]';
  function pickMore(event) {
    moreOpen = false;
    dispatch(event);
  }
  function closeMoreOutside(event) {
    if (moreOpen && moreAnchor && !moreAnchor.contains(event.target)) moreOpen = false;
  }

  function openFirstConflict() {
    const [path] = [...$conflictedNotes].sort();
    if (!path) {
      revealConflicts.set(true);
      dispatch('openSettings');
      return;
    }
    dispatch('navigate', { path, name: path.split('/').pop(), isDir: false });
  }

  async function deleteItems(paths) {
    const uniquePaths = [...new Set(paths.filter(Boolean))];
    if (uniquePaths.length === 0) return;
    try {
      const deletedActivePath = selectedPath && uniquePaths.some((path) => isSameOrDescendant(selectedPath, path));
      keepParentsExpanded(uniquePaths);
      for (const path of uniquePaths) {
        await deleteItemRequest(path);
        unpinNote(path);
      }
      removeExpandedDescendants(uniquePaths);
      selectedPaths = new Set([...selectedPaths].filter((path) => !uniquePaths.includes(path)));
      await loadTree();
      await loadDirectories();
      if (deletedActivePath) {
        selectedPath = null;
        dispatch('fileDeleted');
      }
      return true;
    } catch (err) {
      error = $localizedText.sidebar.errors.delete(err.message);
      return false;
    }
  }

  async function handleMoveFile(event) {
    const { sourcePath, sourcePaths = [], targetPath } = event.detail;
    const movePaths = [...new Set((sourcePaths.length ? sourcePaths : [sourcePath]).filter(Boolean))]
      .filter((path) => path !== targetPath && !isSameOrDescendant(targetPath, path));
    if (movePaths.length === 0) return;
    try {
      const movedPaths = [];
      const activeMoveIndex = selectedPath ? movePaths.indexOf(selectedPath) : -1;
      for (const path of movePaths) {
        const newSourcePath = movedPath(path, targetPath);
        await moveItemRequest(path, targetPath);
        movedPaths.push(newSourcePath);
      }
      selectedPaths = new Set(movedPaths);
      pendingSelectedPath = movedPaths.length === 1 ? movedPaths[0] : null;
      await loadTree();
      await loadDirectories();
      if (activeMoveIndex >= 0) navigateToPath(movedPaths[activeMoveIndex], false);
      else if (movedPaths.length === 1) navigateToPath(movedPaths[0], false);
    } catch (err) {
      error = $localizedText.sidebar.errors.move(err.message);
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
    let sourcePaths = [];
    try {
      sourcePaths = JSON.parse(e.dataTransfer.getData('application/x-monos-note-paths') || '[]');
    } catch {
      sourcePaths = [];
    }
    if (sourcePath) {
      await handleMoveFile({ detail: { sourcePath, sourcePaths, targetPath: 'notes' } });
    }
  }

  async function handleSync() {
    if (isSyncing) return;
    if ($editorState.saving || $editorState.dirty) {
      syncError = $editorState.saving
        ? $localizedText.sidebar.waitForSaveBeforeSync
        : $localizedText.sidebar.saveBeforeSync;
      return;
    }
    isSyncing = true;
    syncError = '';
    try {
      await syncRequest();
      syncBlockedByReview.set([]);
      await loadTree();
      void refreshConflicts();
      announceNotesPulled();
      await loadDirectories();
      gitConfigured = true;
    } catch (e) {
      if (e?.body?.reason === 'agent-review') {
        // Not a failure to retry: the agent's edits here wait for review and changed elsewhere too.
        const files = Array.isArray(e.body.files) ? e.body.files : [];
        syncBlockedByReview.set(files);
        syncError = $localizedText.agentReview.syncBlocked(files);
      } else {
        syncError = e?.body?.detail || e.message || $localizedText.sidebar.errors.syncFailed;
      }
      dispatch('syncError', syncError);
    } finally {
      isSyncing = false;
    }
  }

  function resetDragOver() { isDragOverRoot = false; }

  async function applyBulkTag() {
    const tag = bulkTagValue.trim();
    if (!tag || bulkTagPaths.length === 0) return;
    bulkBusy = true;
    bulkError = '';
    try {
      const result = await bulkTagRequest(bulkTagPaths, tag);
      showBulkTagPrompt = false;
      selectedPaths = new Set();
      await loadTree();
      dispatch('bulkTagged', { tag, changed: result?.changed?.length ?? 0, missing: result?.missing?.length ?? 0 });
    } catch (error) {
      bulkError = error?.message || String(error);
    } finally {
      bulkBusy = false;
    }
  }

  async function duplicateNote() {
    const target = duplicateTarget;
    if (!target) return;
    duplicateTarget = '';
    bulkBusy = true;
    bulkError = '';
    try {
      const created = await duplicateNoteRequest(target);
      await loadTree();
      dispatch('noteDuplicated', created);
    } catch (error) {
      bulkError = error?.message || String(error);
    } finally {
      bulkBusy = false;
    }
  }

  onMount(async () => {
    // Пины из прежнего localStorage переезжают в файлы один раз.
    migrateLegacyPins().catch(() => {});
    loadTree();
    loadDirectories();
    loadTags();
    void loadSavedSearches();
    window.addEventListener('click', closeContextMenu);
    window.addEventListener('dragend', resetDragOver);
    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('dragend', resetDragOver);
    };
  });
</script>

{#if pendingDelete}
  <ConfirmModal
    danger={true}
    title={$localizedText.sidebar.delete}
    message={pendingDelete.message}
    on:confirm={confirmPendingDelete}
    on:cancel={cancelPendingDelete}
  />
{/if}

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
          class="h-11 w-11 shrink-0 justify-center rounded-ui border border-[var(--border-subtle)] text-[var(--text-secondary)] transition hover:border-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          label={$localizedText.sidebar.close}
          tooltip={$localizedText.sidebar.close}
          tooltipAlign="start"
        >
          <Icon.X class="mx-auto h-5 w-5" strokeWidth="1.7" aria-hidden="true" />
        </TooltipIconButton>
      </div>
    </div>

  <!-- Pinned Notes Section -->
  {#if $pinnedNotes.length > 0}
    <div class="mb-4 shrink-0 px-4">
      <div class="mb-3 flex min-h-10 items-center justify-between text-[length:var(--text-whisper-lg)] uppercase tracking-[0.2em] font-bold text-[var(--text-tertiary)]">
        <span>{$localizedText.sidebar.pinned}</span>
        <span class="text-[length:var(--text-whisper)] tabular-nums text-[var(--text-tertiary)]">{$pinnedNotes.length}</span>
      </div>
      <div class="space-y-2">
        {#each $pinnedNotes as note (note.path)}
          {@const pathLabel = recentPathLabel(note)}
          <button
            on:click={() => handleSelectFile({ detail: { path: note.path, name: note.name, isDir: false } })}
            class="w-full min-h-10 rounded-ui border border-transparent px-2 py-1.5 text-left group hover:border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)]/50 transition"
          >
            <div class="text-xs font-medium truncate group-hover:text-[var(--text-primary)] transition-colors tracking-tight">{note.name}</div>
            {#if pathLabel}
              <div class="text-[length:var(--text-whisper)] uppercase tracking-[0.1em] text-[var(--text-tertiary)] truncate mt-0.5">{pathLabel}</div>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Tree View Header -->
    <div class="mb-2 shrink-0 px-4 lg:mb-4">
      <div class="flex items-center justify-between gap-3 pb-1.5 lg:pb-2">
        <h3 class="text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] lg:text-[length:var(--text-whisper-lg)] lg:tracking-[0.22em]">{$localizedText.sidebar.knowledgeTree}</h3>
        <button
          on:click={() => dispatch('openCreateNote')}
          class="tree-header-action absolute right-4 top-3 min-h-11 shrink-0 rounded-ui px-2 text-[length:var(--text-whisper-lg)] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)] transition hover:opacity-60 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-subtle)] lg:static lg:min-h-8 lg:px-2.5 lg:text-[length:var(--text-whisper)] lg:tracking-[0.16em]"
        >
          <span class="text-sm leading-none">+</span>
          <span class="whitespace-nowrap">{$localizedText.sidebar.new.replace(/^\+\s*/, '')}</span>
        </button>
      </div>
    </div>

  <!-- Tree View or Search Results -->
  <div class="min-h-0 flex-1 overflow-hidden px-3 pb-2 lg:px-4">
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
        <span class="text-xs uppercase tracking-widest motion-safe:animate-pulse">{$localizedText.sidebar.loading}</span>
      </div>
    {:else if tree}
      <div class="space-y-0.5 lg:space-y-1">
        {#if isDragOverRoot}
          <div
            class="mx-2 rounded-ui border-2 border-dashed border-[var(--text-secondary)]/30 py-3 text-center"
            role="presentation"
            on:dragover|preventDefault
            on:drop={handleRootDrop}
          >
            <span class="text-[length:var(--text-whisper)] uppercase tracking-widest text-[var(--text-tertiary)]">{$localizedText.sidebar.dropToRoot}</span>
          </div>
        {/if}
        <!-- Render children directly to hide 'notes' root node -->
        {#key treeKey}
        {#each filteredTree.children || [] as node (node.path)}
          <FileTree 
            {node} 
            {selectedPath} 
            {selectedPaths}
            {expandedPaths}
            searchMode={false}
            expanded={expandedPaths.has(node.path)}
            on:navigate={handleSelectFile} 
            on:toggleSelect={handleToggleSelectFile}
            on:toggleExpand={handleToggleExpand}
            on:rightClick={handleRightClick}
            on:moveFile={handleMoveFile}
          />
        {/each}
        {/key}
      </div>
    {:else}
      <div class="flex items-center justify-center h-32">
        <span class="text-xs uppercase tracking-widest text-[var(--text-tertiary)]">{$localizedText.sidebar.empty}</span>
      </div>
    {/if}
    </div>
  </div>

  <!-- Stats Footer -->
  <div class="{mobile ? 'flex-1 flex flex-col justify-center gap-6 px-6 py-8' : 'flex shrink-0 flex-col gap-1 border-t border-[var(--border-subtle)] px-3 py-2 text-[length:var(--text-whisper-lg)] uppercase tracking-widest'}">
    {#if mobile}
      {#if gitConfigured}
        <button on:click={() => { handleSync(); dispatch('toggleSidebar'); }} disabled={isSyncing || $editorState.saving || $editorState.dirty} class="flex min-h-11 items-center gap-4 text-left text-sm text-[var(--text-primary)] hover:opacity-70 transition disabled:opacity-30">
          {#if isSyncing}
            <span class="block w-5 h-5 rounded-full border-2 border-[var(--text-secondary)] border-t-transparent motion-safe:animate-spin"></span>
          {:else}
            <Icon.RefreshCw size="20" strokeWidth="1.7" />
          {/if}
          <span>{$editorState.saving || $editorState.dirty ? $localizedText.sidebar.saveBeforeSync : $localizedText.sidebar.syncWithGit}</span>
        </button>
      {/if}
      <button on:click={() => { dispatch('openTemplatesManager'); dispatch('toggleSidebar'); }} class="flex min-h-11 items-center gap-4 text-left text-sm text-[var(--text-primary)] hover:opacity-70 transition">
        <Icon.LayoutTemplate size="20" strokeWidth="1.7" />
        <span>{$localizedText.sidebar.templates}</span>
      </button>
      {#if showSavedSearchesLink}
        <button data-testid="open-saved-searches" on:click={() => { dispatch('openSavedSearches'); dispatch('toggleSidebar'); }} class="flex min-h-11 items-center gap-4 text-left text-sm text-[var(--text-primary)] hover:opacity-70 transition">
          <Icon.Bookmark size="20" strokeWidth="1.7" />
          <span>{$localizedText.savedSearches.title}</span>
        </button>
      {/if}
      {#if showTagsLink}
        <button data-testid="open-tags" on:click={() => { dispatch('openTags'); dispatch('toggleSidebar'); }} class="flex min-h-11 items-center gap-4 text-left text-sm text-[var(--text-primary)] hover:opacity-70 transition">
          <Icon.Hash size="20" strokeWidth="1.7" />
          <span>{$localizedText.tags.title}</span>
        </button>
      {/if}
      {#if showPropertiesLink}
        <button data-testid="open-properties" on:click={() => { dispatch('openProperties'); dispatch('toggleSidebar'); }} class="flex min-h-11 items-center gap-4 text-left text-sm text-[var(--text-primary)] hover:opacity-70 transition">
          <Icon.SlidersHorizontal size="20" strokeWidth="1.7" />
          <span>{$localizedText.properties.sidebar}</span>
        </button>
      {/if}
      <button on:click={() => { dispatch('openTrash'); dispatch('toggleSidebar'); }} class="flex min-h-11 items-center gap-4 text-left text-sm text-[var(--text-primary)] hover:opacity-70 transition">
        <Icon.Trash2 size="20" strokeWidth="1.7" />
        <span>{$localizedText.sidebar.trash}</span>
      </button>
      <button data-testid="open-help" on:click={() => { dispatch('openHelp'); dispatch('toggleSidebar'); }} class="flex min-h-11 items-center gap-4 text-left text-sm text-[var(--text-primary)] hover:opacity-70 transition">
        <Icon.LifeBuoy size="20" strokeWidth="1.7" />
        <span>{$localizedText.sidebar.help}</span>
      </button>
      <button on:click={() => { dispatch('openSettings'); dispatch('toggleSidebar'); }} class="flex min-h-11 items-center gap-4 text-left text-sm text-[var(--text-primary)] hover:opacity-70 transition">
        <Icon.Settings size="20" strokeWidth="1.7" />
        <span>{$localizedText.sidebar.settings}</span>
      </button>
    {:else}
      <span class="text-[var(--text-secondary)]">
        {selectedNoteCount > 0 ? $localizedText.sidebar.selectedNotes(selectedNoteCount) : $localizedText.sidebar.notes(tree ? totalNotes : 0)}
      </span>
      <div class="flex flex-col gap-0.5">
        {#if $syncBlockedByReview.length}
          <!-- The sync waits for the agent's edits to be reviewed (they changed on another device too). -->
          <button
            type="button"
            data-testid="sync-blocked-review"
            on:click={() => agentReviewOpen.set(true)}
            class="flex h-7 w-full items-center gap-2 rounded-ui px-2 text-left text-[var(--blue)] transition-colors hover:bg-[color-mix(in_srgb,var(--blue)_10%,transparent)]"
            title={$localizedText.agentReview.syncBlocked($syncBlockedByReview)}
          >
            <span class="h-2 w-2 shrink-0 rounded-full bg-[var(--blue)]" aria-hidden="true"></span>
            <span class="truncate">{$localizedText.agentReview.syncWaits}</span>
          </button>
        {/if}
        {#if $conflictedNotes.size + $conflictedFiles.size > 0}
          <!-- A conflict is resolved inside its note: this opens the first one. -->
          <button
            type="button"
            data-testid="open-conflict"
            on:click={openFirstConflict}
            class="flex h-7 w-full items-center gap-2 rounded-ui px-2 text-left text-[var(--red)] transition-colors hover:bg-[color-mix(in_srgb,var(--red)_10%,transparent)]"
          >
            <span class="h-2 w-2 shrink-0 rounded-full bg-[var(--red)]" aria-hidden="true"></span>
            <span class="truncate">{$conflictedNotes.size > 0 ? $localizedText.sidebar.conflictNotice($conflictedNotes.size) : $localizedText.sidebar.conflictFilesNotice($conflictedFiles.size)}</span>
          </button>
        {/if}
        <!-- These rows show their names, so they carry no tooltip that repeats it; only a row whose name needs
             explaining (the notes table) has one. -->
        {#if gitConfigured}
          <TooltipIconButton
            on:click={handleSync}
            disabled={isSyncing || $editorState.saving || $editorState.dirty}
            class="flex h-7 w-full !justify-start gap-2 px-2 text-left text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-30"
            label={$editorState.saving || $editorState.dirty ? $localizedText.sidebar.saveBeforeSync : $localizedText.sidebar.syncWithGit}
            tooltip=""
            tooltipAlign="end"
          >
            {#if isSyncing}
              <span class="block w-3 h-3 rounded-full border border-[var(--text-secondary)] border-t-transparent motion-safe:animate-spin"></span>
            {:else if autoPullState?.conflicts}
              <Icon.AlertTriangle class="w-4 h-4" strokeWidth="1.7" aria-hidden="true" />
            {:else}
              <Icon.RefreshCw class="w-4 h-4" strokeWidth="1.7" aria-hidden="true" />
            {/if}
            <span class="truncate">{$editorState.saving || $editorState.dirty ? $localizedText.sidebar.saveBeforeSync : $localizedText.sidebar.syncWithGit}</span>
          </TooltipIconButton>
        {/if}
        <!-- The places opened now and then (templates, saved searches, tags, the notes table) share one row, so
             the footer stays short; each is also in the command palette (⌘K). -->
        <div class="relative" bind:this={moreAnchor}>
          <button
            type="button"
            data-testid="open-more"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            on:click={() => { moreOpen = !moreOpen; }}
            class="flex h-7 w-full items-center gap-2 rounded-ui px-2 text-left text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] {moreOpen ? 'text-[var(--text-primary)]' : ''}"
          >
            <Icon.LayoutGrid class="w-4 h-4 shrink-0" strokeWidth="1.7" aria-hidden="true" />
            <span class="truncate">{$localizedText.sidebar.more}</span>
            <Icon.ChevronRight class="ml-auto w-3.5 h-3.5 shrink-0 transition-transform {moreOpen ? '-rotate-90' : ''}" strokeWidth="1.7" aria-hidden="true" />
          </button>
          {#if moreOpen}
            <!-- svelte-ignore a11y-interactive-supports-focus -->
            <div
              role="menu"
              aria-label={$localizedText.sidebar.more}
              data-testid="more-menu"
              on:keydown={(event) => { if (event.key === 'Escape') { moreOpen = false; moreAnchor?.querySelector('button')?.focus(); } }}
              class="absolute bottom-full left-0 z-40 mb-1 w-full rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] py-1 normal-case tracking-normal shadow-2xl"
            >
              {#if showPropertiesLink}
                <button type="button" role="menuitem" data-testid="open-properties" class={moreItemClass} on:click={() => pickMore('openProperties')}>
                  <Icon.SlidersHorizontal class="w-4 h-4 shrink-0" strokeWidth="1.7" aria-hidden="true" />{$localizedText.properties.sidebar}
                </button>
              {/if}
              {#if showTagsLink}
                <button type="button" role="menuitem" data-testid="open-tags" class={moreItemClass} on:click={() => pickMore('openTags')}>
                  <Icon.Hash class="w-4 h-4 shrink-0" strokeWidth="1.7" aria-hidden="true" />{$localizedText.tags.title}
                </button>
              {/if}
              {#if showSavedSearchesLink}
                <button type="button" role="menuitem" data-testid="open-saved-searches" class={moreItemClass} on:click={() => pickMore('openSavedSearches')}>
                  <Icon.Bookmark class="w-4 h-4 shrink-0" strokeWidth="1.7" aria-hidden="true" />{$localizedText.savedSearches.title}
                </button>
              {/if}
              <button type="button" role="menuitem" data-testid="open-templates" class={moreItemClass} on:click={() => pickMore('openTemplatesManager')}>
                <Icon.LayoutTemplate class="w-4 h-4 shrink-0" strokeWidth="1.7" aria-hidden="true" />{$localizedText.sidebar.templates}
              </button>
            </div>
          {/if}
        </div>
        {#if terminalBridge}
          <TooltipIconButton
            data-testid="open-terminal"
            on:click={() => dispatch('openTerminal')}
            class="flex h-7 w-full !justify-start gap-2 px-2 text-left text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            label={$localizedText.terminal.open}
            tooltip={$localizedText.terminal.openDetail}
            tooltipAlign="start"
          >
            <Icon.TerminalSquare class="w-4 h-4 shrink-0" strokeWidth="1.7" aria-hidden="true" />
            <span class="truncate">{$localizedText.terminal.open}</span>
          </TooltipIconButton>
        {/if}
        <TooltipIconButton
          on:click={() => dispatch('openTrash')}
          class="flex h-7 w-full !justify-start gap-2 px-2 text-left text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          label={$localizedText.sidebar.trash}
          tooltip=""
          tooltipAlign="end"
        >
          <Icon.Trash2 class="w-4 h-4 shrink-0" strokeWidth="1.7" aria-hidden="true" />
          <span class="truncate">{$localizedText.sidebar.trash}</span>
        </TooltipIconButton>
        <TooltipIconButton
          data-testid="open-help"
          on:click={() => dispatch('openHelp')}
          class="flex h-7 w-full !justify-start gap-2 px-2 text-left text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          label={$localizedText.sidebar.help}
          tooltip=""
        >
          <Icon.LifeBuoy class="w-4 h-4 shrink-0" strokeWidth="1.7" aria-hidden="true" />
          <span class="truncate">{$localizedText.sidebar.help}</span>
        </TooltipIconButton>
        <TooltipIconButton
          on:click={() => dispatch('openSettings')}
          class="flex h-7 w-full !justify-start gap-2 px-2 text-left text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          label={$localizedText.sidebar.settings}
          tooltip=""
          tooltipAlign="end"
        >
          <Icon.Settings class="w-4 h-4 shrink-0" strokeWidth="1.7" aria-hidden="true" />
          <span class="truncate">{$localizedText.sidebar.settings}</span>
        </TooltipIconButton>
      </div>
    {/if}
    </div>

  <!-- Context Menu -->
  {#if contextMenu.show}
    <div
      bind:this={contextMenuEl}
      role="menu"
      tabindex="-1"
      on:keydown={handleContextMenuKeys}
      class="fixed rounded-ui bg-[var(--bg-primary)] border border-[var(--border-subtle)] shadow-2xl py-2 z-[100] w-48 outline-none"
      style="left: {contextMenuPos.x}px; top: {contextMenuPos.y}px;"
    >
      {#if contextMenu.isDir}
        <button on:click={() => handleContextAction('newNote')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest outline-none hover:bg-[var(--border-subtle)] focus-visible:bg-[var(--border-subtle)] transition" role="menuitem">{$localizedText.sidebar.context.newNote}</button>
        <button on:click={() => handleContextAction('newFolder')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest outline-none hover:bg-[var(--border-subtle)] focus-visible:bg-[var(--border-subtle)] transition" role="menuitem">{$localizedText.sidebar.context.newFolder}</button>
        <div class="h-[1px] bg-[var(--border-subtle)] my-1"></div>
      {/if}
      {#if !contextMenu.isDir}
        {#if isPinned(contextMenu.targetPath)}
          <button on:click={() => handleContextAction('unpin')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest outline-none hover:bg-[var(--border-subtle)] focus-visible:bg-[var(--border-subtle)] transition" role="menuitem">{$localizedText.sidebar.context.unpin}</button>
        {:else}
          <button on:click={() => handleContextAction('pin')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest outline-none hover:bg-[var(--border-subtle)] focus-visible:bg-[var(--border-subtle)] transition" role="menuitem">{$localizedText.sidebar.context.pin}</button>
        {/if}
        <div class="h-[1px] bg-[var(--border-subtle)] my-1"></div>
      {/if}
      <button on:click={() => handleContextAction('setIcon')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest outline-none hover:bg-[var(--border-subtle)] focus-visible:bg-[var(--border-subtle)] transition" role="menuitem">{$localizedText.sidebar.context.editIcon}</button>
      <button on:click={() => handleContextAction('rename')} class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest outline-none hover:bg-[var(--border-subtle)] focus-visible:bg-[var(--border-subtle)] transition" role="menuitem">{$localizedText.sidebar.context.rename}</button>
      {#if !contextMenu.isDir}
        <button
          type="button"
          data-testid="bulk-tag"
          role="menuitem"
          on:click={() => { bulkTagPaths = contextMenu.selectionPaths?.length ? contextMenu.selectionPaths : [contextMenu.targetPath]; showBulkTagPrompt = true; bulkTagValue = ''; bulkError = ''; closeContextMenu(); }}
          class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest outline-none hover:bg-[var(--border-subtle)] focus-visible:bg-[var(--border-subtle)] transition"
        >
          {contextMenu.selectionPaths?.length > 1
            ? $localizedText.sidebar.context.tagSelected(contextMenu.selectionPaths.length)
            : $localizedText.sidebar.context.addTag}
        </button>
        <button
          type="button"
          data-testid="duplicate-note"
          role="menuitem"
          on:click={() => { duplicateTarget = contextMenu.targetPath; closeContextMenu(); duplicateNote(); }}
          class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest outline-none hover:bg-[var(--border-subtle)] focus-visible:bg-[var(--border-subtle)] transition"
        >
          {$localizedText.sidebar.context.duplicate}
        </button>
        <div class="h-[1px] bg-[var(--border-subtle)] my-1"></div>
      {/if}
      <button on:click={() => handleContextAction('delete')} role="menuitem" class="w-full text-left px-4 py-2 text-xs uppercase tracking-widest outline-none hover:bg-[color-mix(in_srgb,var(--red)_12%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--red)_12%,transparent)] text-[var(--red)] transition">
        {contextMenu.selectionPaths?.length > 1 ? $localizedText.sidebar.context.deleteSelected : $localizedText.sidebar.context.delete}
      </button>
    </div>
  {/if}
</div>

<svelte:window on:pointerdown={closeMoreOutside} />

<!-- Bulk Tag Modal -->
{#if showBulkTagPrompt}
  <ModalShell
    title={bulkTagPaths.length > 1
      ? $localizedText.sidebar.modals.tagSelectedTitle(bulkTagPaths.length)
      : $localizedText.sidebar.context.addTag}
    widthClass="w-[min(94vw,28rem)]"
    closeOnEscape={true}
    on:close={() => showBulkTagPrompt = false}
  >
    <div class="space-y-3">
      <p class="text-sm text-[var(--text-secondary)]">{$localizedText.sidebar.modals.tagHint}</p>
      <input
        data-testid="bulk-tag-input"
        type="text"
        class="w-full rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-2 py-1.5 text-sm outline-none placeholder-[var(--text-secondary)]"
        placeholder={$localizedText.sidebar.modals.tagPlaceholder}
        bind:value={bulkTagValue}
        on:keydown={(e) => { if (e.key === 'Enter') applyBulkTag(); }}
      />
      {#if bulkError}
        <p class="text-sm text-[var(--red)]">{bulkError}</p>
      {/if}
      <div class="flex gap-2">
        <button
          type="button"
          data-testid="bulk-tag-apply"
          disabled={bulkBusy || !bulkTagValue.trim()}
          class={getModalButtonClass('primary', { extraClass: 'flex-1 py-2' })}
          on:click={applyBulkTag}
        >
          {$localizedText.sidebar.context.addTag}
        </button>
        <button
          type="button"
          class={getModalButtonClass('secondary', { extraClass: 'flex-1 py-2' })}
          on:click={() => showBulkTagPrompt = false}
        >{$localizedText.editor.cancel}</button>
      </div>
    </div>
  </ModalShell>
{/if}

<!-- Rename Modal -->
{#if showRenameModal}
  <RenameModal
    isDir={renameTarget?.isDir}
    currentName={renameOldName}
    busy={isCreating}
    sectionLabel={$localizedText.sidebar.modals.section}
    noteLabel={$localizedText.sidebar.modals.note}
    on:close={closeRenameModal}
    on:submit={(e) => { renameNewName = e.detail.newName; renameItem(); }}
  />
{/if}

<!-- Icon Picker Modal -->
{#if showIconModal}
  <IconPickerModal
    {colorOptions}
    {iconOptions}
    {iconMap}
    {selectedColor}
    noneLabel={$localizedText.sidebar.modals.none}
    on:close={() => showIconModal = false}
    on:color={(e) => setItemColor(e.detail)}
    on:icon={(e) => setFolderIcon(e.detail)}
  />
{/if}

<!-- Create Folder Modal -->
{#if showCreateFolderModal}
  <ModalShell title={$localizedText.sidebar.modals.newSection} closeOnEscape={true} on:close={() => showCreateFolderModal = false}>
      <div>
        <label for="folder-name" class="block text-xs uppercase tracking-widest text-[var(--text-secondary)] mb-2">{$localizedText.sidebar.modals.folderName}</label>
        <input id="folder-name" type="text" bind:value={newFolderNameInput} placeholder={$localizedText.sidebar.modals.folderPlaceholder} class={formFieldClass()} on:keydown={(e) => { if (e.key === 'Enter' && newFolderNameInput.trim() && !folderNameProblem) createFolder(); if (e.key === 'Escape') showCreateFolderModal = false; }} />
        {#if folderNameProblem && folderNameProblem !== 'empty'}
          <p role="alert" class="mt-3 text-xs leading-relaxed text-[var(--red)]">{$localizedText.sidebar.nameProblem(folderNameProblem)}</p>
        {/if}
      </div>
      <div class="flex gap-6 mt-12">
        <button on:click={() => showCreateFolderModal = false} class={getModalButtonClass('secondary')}>{$localizedText.sidebar.modals.cancel}</button>
        <button
          on:click={createFolder}
          disabled={isCreating || !newFolderNameInput.trim() || Boolean(folderNameProblem)}
          class={getModalButtonClass('primary', { disabled: isCreating || !newFolderNameInput.trim() || Boolean(folderNameProblem) })}
        >
          {isCreating ? $localizedText.sidebar.modals.creating : $localizedText.sidebar.modals.create}
        </button>
      </div>
  </ModalShell>
{/if}

<!-- Templates Modal -->
{#if showTemplatesModal}
  <ModalShell title={$localizedText.sidebar.templateLibrary} subtitle={$localizedText.sidebar.templateLibrarySubtitle} widthClass="w-[min(94vw,68rem)] h-[88vh] max-h-[88vh] overflow-hidden flex flex-col" closeOnEscape={true} on:close={() => showTemplatesModal = false}>
    <div class="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
      <div class="min-h-0 flex flex-col overflow-hidden">
        <div class="mb-3">
          <label for="template-search" class="block text-[length:var(--text-whisper)] uppercase tracking-[0.18em] font-bold text-[var(--text-tertiary)] mb-1.5">{$localizedText.sidebar.templateSearch}</label>
          <input
            id="template-search"
            type="text"
            bind:value={templateQuery}
            placeholder={$localizedText.sidebar.templateSearchPlaceholder}
            class={formFieldClass()}
          />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 space-y-4" data-testid="template-list-scroll">
          {#if templateGroups.length === 0}
            <div class="py-12 text-center text-sm text-[var(--text-secondary)]">{$localizedText.sidebar.noTemplates}</div>
          {/if}

          {#each templateGroups as group}
            <section class="pt-4 first:pt-0">
              <div class="mb-2">
                <div class="flex items-center gap-3">
                  <h3 class="shrink-0 text-[length:var(--text-whisper)] uppercase tracking-[0.22em] font-bold text-[var(--text-tertiary)]">{group.title}</h3>
                  <span class="h-px flex-1 bg-[var(--border-subtle)]"></span>
                </div>
                <p class="mt-1 max-w-xl text-xs leading-relaxed text-[var(--text-tertiary)] line-clamp-2">{group.description}</p>
              </div>
              <div class="grid gap-1.5">
                {#each group.templates as template}
                  <button
                    type="button"
                    on:click={() => selectTemplate(template)}
                    class="w-full rounded-ui border p-2.5 text-left transition {selectedTemplateId === template.id ? 'border-[var(--text-primary)] bg-[var(--bg-secondary)]' : 'border-[var(--border-subtle)] hover:border-[var(--text-secondary)]/50'}"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0 flex-1">
                        <div class="font-serif text-base leading-snug">{template.title}</div>
                        <p class="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)] line-clamp-2">{template.description}</p>
                      </div>
                                          </div>
                    <div class="mt-2 flex flex-wrap gap-1">
                      {#each template.tags as tag}
                        <span class="rounded-ui bg-[var(--bg-secondary)]/60 px-1.5 py-0.5 text-[length:var(--text-whisper)] uppercase tracking-wider text-[var(--text-tertiary)]">#{tag}</span>
                      {/each}
                    </div>
                  </button>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      </div>

      <div class="min-h-0 flex flex-col overflow-hidden border-t border-[var(--border-subtle)] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label for="template-title" class="block text-[length:var(--text-whisper)] uppercase tracking-[0.18em] font-bold text-[var(--text-tertiary)] mb-1.5">{$localizedText.sidebar.modals.title}</label>
            <input
              id="template-title"
              type="text"
              bind:value={templateTitle}
              on:input={() => { templateError = ''; templateDuplicatePath = ''; }}
              class={formFieldClass()}
            />
            {#if templateTitleProblem && templateTitleProblem !== 'empty'}
              <p role="alert" class="mt-2 text-xs leading-relaxed text-[var(--red)]">{$localizedText.sidebar.nameProblem(templateTitleProblem)}</p>
            {/if}
          </div>
          <div>
            <label for="template-category" class="block text-[length:var(--text-whisper)] uppercase tracking-[0.18em] font-bold text-[var(--text-tertiary)] mb-1.5">{$localizedText.sidebar.templateFolder}</label>
            <select
              id="template-category"
              bind:value={templateCategory}
              class={formFieldClass({ extraClass: 'appearance-none cursor-pointer' })}
            >
              {#each templateDirectoryList as dir}
                <option value={dir}>{dir || $localizedText.sidebar.modals.root}</option>
              {/each}
            </select>
            {#if templateCategory && !directoryList.includes(templateCategory)}
              <p class="mt-1.5 text-[length:var(--text-whisper-lg)] leading-relaxed text-[var(--text-tertiary)]">{$localizedText.sidebar.templateNewFolder(templateCategory)}</p>
            {/if}
          </div>
        </div>

        <div class="mt-4 min-h-0 flex flex-1 flex-col overflow-hidden">
          <h3 class="mb-2 text-[length:var(--text-whisper)] uppercase tracking-[0.18em] font-bold text-[var(--text-tertiary)]">{$localizedText.sidebar.templatePreview}</h3>
          <div
            style:--template-empty-label={`"${$localizedText.templates.emptyItem}"`}
            class="template-preview min-h-0 flex-1 overflow-auto overscroll-contain rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/40 p-4 text-[var(--text-secondary)]"
            data-testid="template-preview-scroll"
          >
            {#if selectedTemplate}
              {#if templatePreviewParts.metadata.length > 0}
                <div
                  class="mb-4 grid gap-3 border-b border-[var(--border-subtle)] pb-4"
                  style="grid-template-columns: repeat({templatePreviewGridCols}, minmax(0, 1fr));"
                >
                  {#each templatePreviewParts.metadata as field}
                    <div class="min-w-0">
                      <div class="text-[length:var(--text-whisper)] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{field.label}</div>
                      <div class="mt-1 truncate text-sm text-[var(--text-primary)]" title={field.value}>{field.value || '—'}</div>
                    </div>
                  {/each}
                </div>
              {/if}
              {@html templatePreviewBodyHtml}
            {:else}
              <div class="flex h-full items-center justify-center text-center">
                <div>
                  <div class="text-[length:var(--text-whisper)] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{$localizedText.sidebar.templatePreviewEmpty}</div>
                  <p class="mt-2 max-w-xs text-xs leading-relaxed text-[var(--text-tertiary)]">{$localizedText.sidebar.templatePreviewEmptyHint}</p>
                </div>
              </div>
            {/if}
          </div>
        </div>

        {#if templateError}
          <div role="alert" class="rounded-ui mt-5 border border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-3">
            <p class="text-sm leading-relaxed text-[var(--red)]">{templateError}</p>
            {#if templateDuplicatePath}
              <div class="mt-3 flex flex-wrap gap-4">
                <button type="button" class={getModalButtonClass('secondary')} on:click={openExistingTemplateNote}>{$localizedText.sidebar.modals.openExisting}</button>
                <button type="button" class={getModalButtonClass('primary')} disabled={isCreating} on:click={createTemplateNumberedCopy}>{$localizedText.sidebar.modals.createNumbered(`${templateTitle.trim()} 2`)}</button>
              </div>
            {/if}
          </div>
        {/if}
        <div class="mt-5 flex gap-4">
          <button on:click={() => showTemplatesModal = false} class={getModalButtonClass('secondary')}>{$localizedText.sidebar.modals.cancel}</button>
          <button
            on:click={createNoteFromTemplate}
            style="white-space: nowrap;"
            disabled={isCreating || !templateTitle.trim() || Boolean(templateTitleProblem)}
            class={getModalButtonClass('primary', { disabled: isCreating || !templateTitle.trim() || Boolean(templateTitleProblem) })}
          >
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
    line-height: 1.55;
    font-size: 0.8125rem;
  }

  :global(.template-preview h1) {
    margin-bottom: 1.25rem;
    color: var(--text-primary);
    font-family: var(--font-family, 'JetBrains Mono', ui-monospace, monospace);
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.25;
  }

  :global(.template-preview h2) {
    margin-top: 1.1rem;
    margin-bottom: 0.35rem;
    color: var(--text-primary);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  :global(.template-preview h2:first-child) {
    margin-top: 0;
  }

  :global(.template-preview h3) {
    margin-top: 0.5rem;
    margin-bottom: 0.2rem;
    color: var(--text-secondary);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  :global(.template-preview p) {
    margin: 0 0 0.55rem;
  }

  :global(.template-preview p:last-child) {
    margin-bottom: 0;
  }

  :global(.template-preview ul),
  :global(.template-preview ol) {
    margin: 0.15rem 0 0.55rem 1.1rem;
    padding: 0;
  }

  :global(.template-preview ul) {
    list-style: disc;
  }

  :global(.template-preview ol) {
    list-style: decimal;
  }

  :global(.template-preview li) {
    margin-bottom: 0.15rem;
    line-height: 1.4;
  }

  /* Пустой пункт маркированного списка подписан строкой templates.emptyItem. Пункт нумерованного
     списка остаётся с номером, как в редакторе. */
  :global(.template-preview ul > li:empty),
  :global(.template-preview ul > li > p:only-child:empty) {
    list-style: none;
    margin-left: -1.1rem;
    color: var(--text-secondary);
    opacity: 0.5;
    font-style: italic;
  }

  :global(.template-preview ul > li:empty::before) {
    content: var(--template-empty-label, "");
    font-size: 0.7rem;
  }

  /* Задача рисуется чекбоксом без маркера, как в редакторе. */
  :global(.template-preview li:has(> input[type='checkbox'])) {
    list-style: none;
    margin-left: -1.1rem;
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
