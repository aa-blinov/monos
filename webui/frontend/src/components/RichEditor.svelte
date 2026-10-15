<script>
  import UrlPromptModal from './UrlPromptModal.svelte';
  import { onMount, tick } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { Editor } from '@tiptap/core';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import TooltipIconSelect from './TooltipIconSelect.svelte';
  import { lineHeight, contentWidth, editorFontSize } from '../stores.js';
  import { lineHeightOptions, contentWidthOptions, editorFontSizeOptions } from '../lib/fonts.js';
  import { createRichEditorExtensions } from '../lib/richEditorExtensions.js';
  import { markdownToEditorContent } from '../lib/markdown-editor-content.js';
  import { unescapeCalloutMarkers } from '../lib/callouts.js';
  import { markdownTextFromClipboard } from '../lib/rich-editor-paste.js';
  import { isMarkdownBurst } from '../lib/markdown-burst.js';
  import { shortcutLabel } from '../lib/shortcut-label.js';
  import { findHeadingPos } from '../lib/outline.js';
  import { scrollBehavior } from '../lib/motion.js';
  import { firstImageFileFromDataTransfer, firstPdfFileFromDataTransfer, imageDisplayName } from '../lib/attachments.js';
  import { NOTE_LINK_DRAG_TYPE, wikiLinkForNote } from '../lib/drag-data.js';
  import { localizedText } from '../lib/strings.js';
  import {
    Undo2, Redo2, Bold, Italic, Strikethrough, Code,
    Heading1, Heading2, Heading3, Heading4,
    List, ListOrdered, Quote, Code2, Minus, Link, Table2, CheckSquare,
    Maximize2, WrapText, Type, MoreHorizontal
  } from 'lucide-svelte';

  // Everyday formatting stays in the toolbar; the rest sits behind "More tools".
  let moreOpen = false;
  function runMore(action) {
    action();
    moreOpen = false;
  }
  function closeMoreOnOutsideClick(event) {
    if (moreOpen && !event.target.closest?.('[data-more-tools]')) moreOpen = false;
  }
  function closeMoreOnEscape(event) {
    if (moreOpen && event.key === 'Escape') moreOpen = false;
  }

  export let content = '';
  export let onUpdate = (md) => {};
  export let placeholder = null;
  export let onImageFile = null;
  // Uploads a PDF next to the note and answers with its name and note-relative path.
  export let onDocumentFile = null;
  export let resolveImageSrc = (src) => src;
  export let resolveImagePath = () => '';
  export let notePath = '';
  export let editable = true;

  const dispatch = createEventDispatcher();

  let editorEl;
  let pendingUrl = null;
  let editor;
  let canUndo = false;
  let canRedo = false;
  let active = { bold: false, italic: false, strike: false, code: false, heading: 0, bullet: false, ordered: false, task: false, quote: false, codeBlock: false };
  let slashMenuOpen = false;
  let activeSlashIndex = 0;
  let slashMenuEl;
  let surfaceEl;
  let slashMenuPosition = { left: 0, top: 0 };
  let isImageDragging = false;
  let wikiSuggestions = [];
  let wikiSuggestionRange = null;
  let activeWikiSuggestionIndex = 0;
  let wikiSuggestionRequestId = 0;
  let lastWikiSuggestionKey = '';
  let lastAppliedContent = '';
  /** Markdown, который мы сами отдали родителю последним. */
  let lastEmittedMarkdown = null;
  // Markdown собирается не на каждое нажатие, а один раз после паузы: полная
  // сериализация заметки стоила ~2 мс на символ, и на длинных заметках ввод
  // заметно подтормаживал. Всё, что читает содержимое наружу (сохранение,
  // переключение заметки, сырой режим, выгрузка), сперва вызывает flushMarkdown().
  const MARKDOWN_FLUSH_DELAY = 250;
  let markdownTimer = null;
  let pendingMarkdown = null;

  const WIKI_SUGGESTION_LIMIT = 8;

  $: localizedContentWidthOptions = contentWidthOptions.map(option => ({
    ...option,
    label: $localizedText.optionLabels.contentWidth[option.value] || option.name,
  }));
  $: localizedLineHeightOptions = lineHeightOptions.map(option => ({
    ...option,
    label: $localizedText.optionLabels.lineHeight[option.value] || option.name,
  }));
  $: localizedEditorFontSizeOptions = editorFontSizeOptions.map(option => ({
    ...option,
    label: $localizedText.optionLabels.fontSize[option.value] || option.name,
  }));

  const slashCommands = [
    { id: 'heading1', run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { id: 'heading2', run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { id: 'bulletList', run: () => editor.chain().focus().toggleBulletList().run() },
    { id: 'numberedList', run: () => editor.chain().focus().toggleOrderedList().run() },
    { id: 'checklist', run: () => editor.chain().focus().toggleTaskList().run() },
    { id: 'blockquote', run: () => editor.chain().focus().toggleBlockquote().run() },
    { id: 'codeBlock', run: () => editor.chain().focus().toggleCodeBlock().run() },
    { id: 'table', run: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: 'horizontalRule', run: () => editor.chain().focus().setHorizontalRule().run() },
  ];

  function normalizeWikiLinkMarkdown(markdown) {
    return String(markdown || '')
      .replace(/\\\[\\\[/g, '[[')
      .replace(/\\\]\\\]/g, ']]');
  }

  function editorMarkdown(ed = editor) {
    return unescapeCalloutMarkers(normalizeWikiLinkMarkdown(ed?.storage.markdown?.getMarkdown?.() || ''));
  }

  /**
   * Отдать накопленную разметку немедленно, не дожидаясь паузы в печати.
   * Обязателен перед сохранением и уходом из заметки: иначе последние
   * нажатия остались бы в редакторе, но не в файле.
   */
  export function flushMarkdown() {
    if (markdownTimer) {
      clearTimeout(markdownTimer);
      markdownTimer = null;
    }
    if (pendingMarkdown === null || !editor) return;
    const md = pendingMarkdown;
    pendingMarkdown = null;
    lastEmittedMarkdown = md;
    onUpdate(md);
  }

  function createEditor() {
    if (editor) return;
    editor = new Editor({
      element: null,
      extensions: createRichEditorExtensions(placeholder || $localizedText.richEditor.beginWriting, {
        resolveImageSrc,
        resolveImagePath,
      }),
      content: markdownToEditorContent(content),
      editable,
      onUpdate: ({ editor: ed }) => {
        if (!editable) return;
        pendingMarkdown = editorMarkdown(ed);
        if (markdownTimer) clearTimeout(markdownTimer);
        markdownTimer = setTimeout(() => {
          markdownTimer = null;
          flushMarkdown();
        }, MARKDOWN_FLUSH_DELAY);
        updateActive(ed);
      },
      onSelectionUpdate: ({ editor: ed }) => updateActive(ed),
      editorProps: {
        attributes: { 'aria-label': $localizedText.richEditor.bodyLabel },
        // Dictation, an IME commit or a tool can insert a whole line in one text event,
        // and input rules only see the keystroke that completes a marker. Such a burst
        // is parsed like a paste, so `# Title` becomes a heading, not escaped text.
        handleTextInput(_view, from, to, text) {
          if (!isMarkdownBurst(text)) return false;
          const documentContent = markdownToEditorContent(text).content || [];
          if (!documentContent.length) return false;
          // Replace the range the input event names, which is not always the selection
          // (autocorrect and IME rewrite the word before the caret).
          editor.chain().focus().setTextSelection({ from, to }).insertContent(documentContent).run();
          return true;
        },
      },
    });
    editor.mount(editorEl);
    lastAppliedContent = content || '';
  }

  $: if (editor && editor.isEditable !== editable) editor.setEditable(editable);

  function applyEditorContent(nextContent) {
    if (!editor) return;
    editor
      .chain()
      .setMeta('addToHistory', false)
      .setContent(markdownToEditorContent(nextContent), { emitUpdate: false })
      .run();
  }

  function updateActive(ed) {
    active = {
      bold: ed.isActive('bold'), italic: ed.isActive('italic'), strike: ed.isActive('strike'), code: ed.isActive('code'),
      heading: ed.isActive('heading') ? ed.getAttributes('heading').level : 0,
      bullet: ed.isActive('bulletList'), ordered: ed.isActive('orderedList'), task: ed.isActive('taskList'),
      quote: ed.isActive('blockquote'), codeBlock: ed.isActive('codeBlock'),
    };
    canUndo = ed.can().undo(); canRedo = ed.can().redo();
  }

  function cmd(method, attrs) {
    return () => {
      if (!editor) return;
      // Opening a modal must not queue an editor focus: TipTap applies it on
      // the next tick and would pull the caret out of the URL field.
      if (method === 'link' || method === 'image') {
        slashMenuOpen = false;
        wikiSuggestions = [];
        pendingUrl = { kind: method };
        return;
      }
      const c = editor.chain().focus();
      if (method === 'undo') c.undo().run();
      else if (method === 'redo') c.redo().run();
      else if (method === 'hr') c.setHorizontalRule().run();
      else if (method === 'table') c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      else c[method](attrs).run();
    };
  }

  export async function insertImageFile(file) {
    if (!file || !onImageFile || !editor) return false;
    const image = await onImageFile(file);
    if (!image?.relativePath) return false;
    editor.chain().focus().insertContent({
      type: 'paragraph',
      content: [{
        type: 'image',
        attrs: { src: image.relativePath, alt: imageDisplayName(image.name) },
      }],
    }).run();
    return true;
  }

  async function handlePaste(event) {
    const file = firstImageFileFromDataTransfer(event.clipboardData);
    if (file) {
      event.preventDefault();
      await insertImageFile(file);
      return;
    }

    const markdown = markdownTextFromClipboard(event.clipboardData);
    if (!markdown || !editor) return;
    const documentContent = markdownToEditorContent(markdown).content || [];
    if (!documentContent.length) return;
    event.preventDefault();
    editor.chain().focus().insertContent(documentContent).run();
  }

  function draggedNotePayload(dataTransfer) {
    const rawPayload = dataTransfer?.getData?.(NOTE_LINK_DRAG_TYPE);
    if (!rawPayload) return null;
    try {
      return JSON.parse(rawPayload);
    } catch {
      return null;
    }
  }

  function insertTextAtDropPosition(event, text) {
    if (!editor || !text) return false;
    const dropPosition = Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
      ? editor.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
      : null;
    const chain = editor.chain().focus();
    if (Number.isFinite(dropPosition)) chain.setTextSelection(dropPosition);
    chain.insertContent(text).run();
    return true;
  }

  // Puts a node where the file was dropped, or at the caret when the drop position is unknown.
  function insertNodeAtDropPosition(event, node) {
    if (!editor) return false;
    const dropPosition = Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)
      ? editor.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
      : null;
    const chain = editor.chain().focus();
    if (Number.isFinite(dropPosition)) chain.setTextSelection(dropPosition);
    chain.insertContent(node).run();
    return true;
  }

  // The PDF is attached to the note first; the embed is written where it was dropped.
  async function insertPdfFile(file, event) {
    if (!file || !onDocumentFile || !editor) return false;
    const uploaded = await onDocumentFile(file);
    if (!uploaded?.name || !uploaded.relativePath) return false;
    return insertNodeAtDropPosition(event, {
      type: 'pdfEmbed',
      attrs: { name: uploaded.name, src: uploaded.relativePath },
    });
  }

  export function insertNoteLink(note, event = {}) {
    return insertTextAtDropPosition(event, wikiLinkForNote(note));
  }

  function handleDragOver(event) {
    const hasNoteLink = Boolean(wikiLinkForNote(draggedNotePayload(event.dataTransfer)));
    if (!hasNoteLink && !firstImageFileFromDataTransfer(event.dataTransfer) && !firstPdfFileFromDataTransfer(event.dataTransfer)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = hasNoteLink ? 'copy' : 'copy';
    isImageDragging = !hasNoteLink;
  }

  async function handleDrop(event) {
    const notePayload = draggedNotePayload(event.dataTransfer);
    if (wikiLinkForNote(notePayload)) {
      event.preventDefault();
      event.stopPropagation();
      isImageDragging = false;
      insertNoteLink(notePayload, event);
      return;
    }

    const file = firstImageFileFromDataTransfer(event.dataTransfer);
    const pdf = file ? null : firstPdfFileFromDataTransfer(event.dataTransfer);
    isImageDragging = false;
    if (pdf) {
      event.preventDefault();
      await insertPdfFile(pdf, event);
      return;
    }
    if (!file) return;
    event.preventDefault();
    await insertImageFile(file);
  }

  function handleClick(event) {
    const image = event.target.closest('img[data-attachment-path]');
    if (!image) return;
    dispatch('imageClick', {
      path: image.dataset.attachmentPath,
      src: image.getAttribute('src'),
      alt: image.getAttribute('alt') || '',
    });
  }

  $: wikiSuggestionsOpen = wikiSuggestionRange && wikiSuggestions.length > 0;

  function wikiLinkContext() {
    if (!editor) return null;
    const { from } = editor.state.selection;
    const selectionHead = editor.state.selection.$from;
    const beforeCursor = selectionHead.parent.textBetween(0, selectionHead.parentOffset, '\n', '\n');
    const openIndex = beforeCursor.lastIndexOf('[[');
    if (openIndex === -1) return null;

    const query = beforeCursor.slice(openIndex + 2);
    if (query.includes(']]') || query.includes('\n') || query.includes('[') || query.includes('|')) return null;

    return {
      from: from - query.length,
      to: from,
      query,
    };
  }

  async function updateWikiSuggestions() {
    const context = wikiLinkContext();
    const previousKey = lastWikiSuggestionKey;
    const previousIndex = activeWikiSuggestionIndex;
    if (!context) {
      wikiSuggestionRange = null;
      wikiSuggestions = [];
      activeWikiSuggestionIndex = 0;
      lastWikiSuggestionKey = '';
      return;
    }

    const contextKey = `${context.from}:${context.to}:${context.query}`;
    wikiSuggestionRange = context;
    const requestId = ++wikiSuggestionRequestId;
    try {
      const params = new URLSearchParams({
        query: context.query.trim(),
        limit: String(WIKI_SUGGESTION_LIMIT),
      });
      if (notePath) params.set('exclude', notePath);
      const response = await fetch(`/api/notes/suggest?${params.toString()}`);
      const suggestions = response.ok ? await response.json() : [];
      if (requestId !== wikiSuggestionRequestId) return;
      wikiSuggestions = Array.isArray(suggestions) ? suggestions : [];
      lastWikiSuggestionKey = contextKey;
      activeWikiSuggestionIndex = contextKey === previousKey
        ? Math.min(previousIndex, Math.max(0, wikiSuggestions.length - 1))
        : 0;
    } catch {
      if (requestId === wikiSuggestionRequestId) wikiSuggestions = [];
    }
  }

  function shouldRefreshWikiSuggestions(event) {
    if (!wikiSuggestionsOpen) return true;
    return !['ArrowDown', 'ArrowUp', 'Escape', 'Enter', 'Tab'].includes(event.key);
  }

  function refreshWikiSuggestionsAfterDomUpdate() {
    tick().then(updateWikiSuggestions);
  }

  function closeWikiSuggestions() {
    wikiSuggestionRange = null;
    wikiSuggestions = [];
    activeWikiSuggestionIndex = 0;
    lastWikiSuggestionKey = '';
  }

  function selectWikiSuggestion(suggestion) {
    if (!editor || !suggestion || !wikiSuggestionRange) return;
    const insertText = suggestion.insertText || suggestion.name || '';
    if (!insertText) return;
    // `[[` в конце абзаца: читать на 2 символа дальше нельзя, там конец
    // документа — пикер падал на «nodeSize of undefined» и ссылка не вставлялась.
    const rangeEnd = wikiSuggestionRange.to;
    const hasClosing = rangeEnd + 2 <= editor.state.doc.content.size
      && editor.state.doc.textBetween(rangeEnd, rangeEnd + 2) === ']]';
    const to = hasClosing ? rangeEnd + 2 : rangeEnd;
    editor.chain().focus().deleteRange({ from: wikiSuggestionRange.from, to }).insertContent(`${insertText}]]`).run();
    closeWikiSuggestions();
  }

  function deleteSlashTrigger() {
    if (!editor) return;
    const { from } = editor.state.selection;
    const previousChar = editor.state.doc.textBetween(Math.max(0, from - 1), from);
    if (previousChar === '/') {
      editor.commands.deleteRange({ from: from - 1, to: from });
    }
  }

  // The menu opens under the caret, where the slash was typed: its left edge is the slash's, and it
  // opens above the line when the editor has no room below it. It never leaves the editor surface.
  async function openSlashMenu() {
    slashMenuOpen = true;
    activeSlashIndex = 0;
    await tick();
    placeSlashMenu();
  }

  function placeSlashMenu() {
    if (!editor || !surfaceEl) return;
    const surface = surfaceEl.getBoundingClientRect();
    const edge = 8;
    const gap = 6;
    const menuWidth = slashMenuEl?.offsetWidth || 256;
    const menuHeight = slashMenuEl?.offsetHeight || 0;
    let slash;
    let caret;
    try {
      const { from } = editor.state.selection;
      slash = editor.view.coordsAtPos(Math.max(0, from - 1));
      caret = editor.view.coordsAtPos(from);
    } catch {
      // No layout to measure (a detached or hidden editor): the menu keeps its last place.
      return;
    }
    const left = slash.left - surface.left;
    const below = caret.bottom - surface.top + gap;
    const above = caret.top - surface.top - menuHeight - gap;
    const fitsBelow = below + menuHeight <= surface.height - edge;
    const top = fitsBelow || above < edge ? below : above;
    slashMenuPosition = {
      left: Math.min(Math.max(edge, left), Math.max(edge, surface.width - menuWidth - edge)),
      top: Math.min(Math.max(edge, top), Math.max(edge, surface.height - menuHeight - edge)),
    };
  }

  function executeSlashCommand(command) {
    if (!command) return;
    slashMenuOpen = false;
    activeSlashIndex = 0;
    if (!editor) return;
    deleteSlashTrigger();
    command.run();
  }

  function handleEditorKeydown(event) {
    if (wikiSuggestionsOpen) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeWikiSuggestions();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        activeWikiSuggestionIndex = (activeWikiSuggestionIndex + 1) % wikiSuggestions.length;
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        activeWikiSuggestionIndex = (activeWikiSuggestionIndex - 1 + wikiSuggestions.length) % wikiSuggestions.length;
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        selectWikiSuggestion(wikiSuggestions[activeWikiSuggestionIndex]);
        return;
      }
    }

    if (slashMenuOpen) {
      if (event.key === 'Escape') {
        event.preventDefault();
        slashMenuOpen = false;
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        activeSlashIndex = (activeSlashIndex + 1) % slashCommands.length;
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        activeSlashIndex = (activeSlashIndex - 1 + slashCommands.length) % slashCommands.length;
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        executeSlashCommand(slashCommands[activeSlashIndex]);
        return;
      }
    }

    if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      // The slash is inserted after this keydown, so the menu is placed on the next tick, under the caret.
      window.setTimeout(openSlashMenu);
    }
  }

  function handleEditorKeyup(event) {
    if (!slashMenuOpen || event.key !== 'Enter') return;
    event.preventDefault();
    executeSlashCommand(slashCommands[activeSlashIndex]);
  }

  export function getMarkdown() { return editor ? editorMarkdown(editor) : content; }

  /**
   * Scroll the editor to the `occurrence`-th heading (0-based) whose text
   * matches `headingText`. Used by the OutlinePanel for click-to-jump: a note
   * can repeat a heading, and the occurrence tells the repeats apart.
   * Returns true if found and scrolled, false otherwise.
   */
  export function scrollToHeadingText(headingText, occurrence = 0) {
    if (!editor || !headingText) return false;
    const headings = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') headings.push({ text: node.textContent, pos });
    });
    const headingPos = findHeadingPos(headings, headingText, occurrence);
    const found = headingPos !== null;
    const targetPos = found ? headingPos + 1 : null;
    if (found && targetPos !== null) {
      try {
        // scrollIntoView: false — иначе focus() в следующем кадре вызовет
        // минимальную прокрутку к выделению и оборвёт плавную прокрутку ниже:
        // дальний заголовок оказывался у низа экрана, а не у верха.
        editor.commands.focus(null, { scrollIntoView: false });
        editor.commands.setTextSelection(targetPos);
        // Выделение само страницу не двигает. Ставим заголовок в начало поля
        // редактора, а не «как можно меньше»: минимальная прокрутка оставляла
        // его у верхнего края, иногда под самой шапкой заметки.
        const { node } = editor.view.domAtPos(targetPos);
        const element = node instanceof HTMLElement ? node : node?.parentElement;
        element?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      } catch (_) {
        // ignore
      }
    }
    return found;
  }
  /** Put the caret at the start of the note, for a note that was just created. */
  export function focusStart() {
    editor?.commands.focus('start');
  }

  export function setMarkdown(md) {
    const nextContent = md || '';
    if (!editor) {
      lastAppliedContent = nextContent;
      return;
    }
    applyEditorContent(nextContent);
    lastAppliedContent = nextContent;
    updateActive(editor);
  }

  $: if (editor) {
    const nextContent = content || '';
    if (nextContent !== lastAppliedContent) {
      // Разметка, которую мы сами отдали родителю мигновением назад, — это не
      // внешнее изменение. Её не нужно ни сериализовать заново, ни применять
      // обратно через setContent: это лишняя полная сериализация и лишняя
      // пересборка документа на каждое нажатие.
      if (nextContent !== lastEmittedMarkdown) {
        const currentMarkdown = editorMarkdown(editor);
        if (currentMarkdown !== nextContent) {
          applyEditorContent(nextContent);
          updateActive(editor);
        }
      }
      lastAppliedContent = nextContent;
    }
  }

  onMount(() => {
    tick().then(createEditor);
    return () => editor?.destroy();
  });
  function cancelUrlPrompt() {
    pendingUrl = null;
  }

  function applyUrlPrompt(url) {
    const kind = pendingUrl?.kind;
    pendingUrl = null;
    if (!kind || !url) return;
    const c = editor.chain().focus();
    if (kind === 'link') c.extendMarkRange('link').setLink({ href: url }).run();
    else c.setImage({ src: url, alt: '' }).run();
  }
</script>

{#if pendingUrl}
  <UrlPromptModal
    title={pendingUrl.kind === 'link' ? $localizedText.richEditor.insertLink : $localizedText.richEditor.insertImage}
    label={pendingUrl.kind === 'link' ? $localizedText.richEditor.linkPrompt : $localizedText.richEditor.imagePrompt}
    placeholder="https://"
    on:submit={(e) => applyUrlPrompt(e.detail)}
    on:cancel={cancelUrlPrompt}
  />
{/if}

<svelte:window on:click={closeMoreOnOutsideClick} on:keydown={closeMoreOnEscape} on:resize={() => { if (slashMenuOpen) placeSlashMenu(); }} />
<div class="flex flex-col flex-1 min-h-0">
  <!-- Toolbar: one scrolling row on a phone, the everyday buttons plus "More tools" on a desktop -->
  <div class="relative flex items-center gap-1 px-2 lg:px-3 py-1.5 lg:py-2 border-b border-[var(--note-page-border,var(--border-subtle))] bg-[var(--note-page-panel,var(--bg-primary))]" role="presentation" on:mousedown|preventDefault data-more-tools>
    <div class="flex min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-x-auto toolbar-scroll" role="toolbar" aria-label={$localizedText.richEditor.toolbar} tabindex="0">
    <!-- Undo/Redo -->
    <TooltipIconButton on:click={cmd('undo')} disabled={!canUndo} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition disabled:opacity-20" label={shortcutLabel($localizedText.richEditor.undo)}><Undo2 size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('redo')} disabled={!canRedo} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition disabled:opacity-20" label={shortcutLabel($localizedText.richEditor.redo)}><Redo2 size="16" aria-hidden="true" /></TooltipIconButton>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <TooltipIconButton on:click={cmd('toggleBold')} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.bold ? 'bg-[var(--bg-secondary)]' : ''}" label={shortcutLabel($localizedText.richEditor.bold)}><Bold size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleItalic')} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.italic ? 'bg-[var(--bg-secondary)]' : ''}" label={shortcutLabel($localizedText.richEditor.italic)}><Italic size="16" aria-hidden="true" /></TooltipIconButton>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <TooltipIconButton on:click={cmd('toggleHeading', { level: 1 })} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.heading === 1 ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.heading1}><Heading1 size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleHeading', { level: 2 })} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.heading === 2 ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.heading2}><Heading2 size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleHeading', { level: 3 })} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.heading === 3 ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.heading3}><Heading3 size="16" aria-hidden="true" /></TooltipIconButton>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <TooltipIconButton on:click={cmd('toggleBulletList')} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.bullet ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.bulletList}><List size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleOrderedList')} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.ordered ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.numberedList}><ListOrdered size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleTaskList')} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.task ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.checklist}><CheckSquare size="16" aria-hidden="true" /></TooltipIconButton>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <TooltipIconButton on:click={cmd('toggleBlockquote')} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.quote ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.blockquote}><Quote size="16" aria-hidden="true" /></TooltipIconButton>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <TooltipIconButton on:click={cmd('link')} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition" label={$localizedText.richEditor.addLink}><Link size="16" aria-hidden="true" /></TooltipIconButton>
    </div>

    <button
      type="button"
      class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-ui text-[var(--text-secondary)] transition hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] {moreOpen ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)]' : ''}"
      aria-label={$localizedText.richEditor.more}
      aria-haspopup="menu"
      aria-expanded={moreOpen}
      on:click={() => moreOpen = !moreOpen}
    >
      <MoreHorizontal size="16" aria-hidden="true" />
    </button>

    {#if moreOpen}
      <div class="absolute right-2 top-full z-30 mt-1 w-72 border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-1 shadow-2xl" role="menu" aria-label={$localizedText.richEditor.more}>
        <button type="button" role="menuitem" class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)]" on:click={() => runMore(cmd('toggleStrike'))}>
          <Strikethrough size="16" aria-hidden="true" />{$localizedText.richEditor.strikethrough}
        </button>
        <button type="button" role="menuitem" class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)]" on:click={() => runMore(cmd('toggleCode'))}>
          <Code size="16" aria-hidden="true" />{shortcutLabel($localizedText.richEditor.inlineCode)}
        </button>
        <button type="button" role="menuitem" class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)]" on:click={() => runMore(cmd('toggleHeading', { level: 4 }))}>
          <Heading4 size="16" aria-hidden="true" />{$localizedText.richEditor.heading4}
        </button>
        <button type="button" role="menuitem" class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)]" on:click={() => runMore(cmd('toggleCodeBlock'))}>
          <Code2 size="16" aria-hidden="true" />{$localizedText.richEditor.codeBlock}
        </button>
        <button type="button" role="menuitem" class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)]" on:click={() => runMore(cmd('hr'))}>
          <Minus size="16" aria-hidden="true" />{$localizedText.richEditor.horizontalRule}
        </button>
        <button type="button" role="menuitem" class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)]" on:click={() => runMore(cmd('table'))}>
          <Table2 size="16" aria-hidden="true" />{$localizedText.richEditor.insertTable}
        </button>
        <div class="mt-1 flex flex-col border-t border-[var(--border-subtle)] pt-1">
          <div class="flex items-center gap-3 px-3 py-1.5 text-sm">
            <TooltipIconSelect
              bind:value={$contentWidth}
              options={localizedContentWidthOptions}
              label={$localizedText.richEditor.contentWidth}
              class="relative inline-flex shrink-0 cursor-pointer rounded-ui p-1.5 text-[var(--text-primary)] transition hover:bg-[var(--bg-secondary)] focus-within:bg-[var(--bg-secondary)]"
            >
              <Maximize2 size="16" aria-hidden="true" />
            </TooltipIconSelect>
            <span>{$localizedText.richEditor.contentWidth}</span>
          </div>
          <div class="flex items-center gap-3 px-3 py-1.5 text-sm">
            <TooltipIconSelect
              bind:value={$lineHeight}
              options={localizedLineHeightOptions}
              label={$localizedText.richEditor.lineHeight}
              class="relative inline-flex shrink-0 cursor-pointer rounded-ui p-1.5 text-[var(--text-primary)] transition hover:bg-[var(--bg-secondary)] focus-within:bg-[var(--bg-secondary)]"
            >
              <WrapText size="16" aria-hidden="true" />
            </TooltipIconSelect>
            <span>{$localizedText.richEditor.lineHeight}</span>
          </div>
          <div class="flex items-center gap-3 px-3 py-1.5 text-sm">
            <TooltipIconSelect
              bind:value={$editorFontSize}
              options={localizedEditorFontSizeOptions}
              label={$localizedText.richEditor.fontSize}
              class="relative inline-flex shrink-0 cursor-pointer rounded-ui p-1.5 text-[var(--text-primary)] transition hover:bg-[var(--bg-secondary)] focus-within:bg-[var(--bg-secondary)]"
            >
              <Type size="16" aria-hidden="true" />
            </TooltipIconSelect>
            <span>{$localizedText.richEditor.fontSize}</span>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Editor -->
  <div
    bind:this={surfaceEl}
    class="relative flex flex-col flex-1 min-h-0 overflow-hidden"
    data-testid="rich-editor-surface"
  >
  {#if slashMenuOpen}
    <div
      bind:this={slashMenuEl}
      class="absolute z-20 w-64 border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-2xl p-1"
      style="left: {slashMenuPosition.left}px; top: {slashMenuPosition.top}px"
      role="listbox"
      aria-label={$localizedText.richEditor.slashMenuLabel}
    >
      <div class="px-3 py-2 text-[length:var(--text-whisper)] uppercase tracking-widest text-[var(--text-secondary)]">{$localizedText.richEditor.slashHint}</div>
      {#each slashCommands as slashCommand, index}
        <button
          type="button"
          role="option"
          aria-selected={activeSlashIndex === index}
          class="!flex w-full !min-h-0 !justify-start px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)] {activeSlashIndex === index ? 'bg-[var(--bg-secondary)]' : ''}"
          on:mouseenter={() => activeSlashIndex = index}
          on:click={() => executeSlashCommand(slashCommand)}
        >
          {$localizedText.richEditor.slashCommands[slashCommand.id]}
        </button>
      {/each}
    </div>
  {/if}
  <div bind:this={editorEl}
    role="textbox"
    aria-multiline="true"
    tabindex="-1"
    data-testid="rich-editor-input"
    on:scroll={() => { if (slashMenuOpen) placeSlashMenu(); }}
    on:keydown|capture={handleEditorKeydown}
    on:keyup|capture={(event) => { handleEditorKeyup(event); if (shouldRefreshWikiSuggestions(event)) refreshWikiSuggestionsAfterDomUpdate(); }}
    on:input|capture={refreshWikiSuggestionsAfterDomUpdate}
    on:paste|capture={handlePaste}
    on:dragover|capture={handleDragOver}
    on:dragleave={() => isImageDragging = false}
    on:drop|capture={handleDrop}
    on:click={(event) => { handleClick(event); refreshWikiSuggestionsAfterDomUpdate(); }}
    class="min-h-0 h-full flex-1 overflow-y-auto overscroll-contain px-4 lg:px-12 py-4 lg:py-10 cursor-text touch-pan-y
      {isImageDragging ? 'ring-1 ring-inset ring-[var(--text-secondary)]/35' : ''}
      [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-full [&_.ProseMirror]:max-w-[var(--content-width,56rem)] [&_.ProseMirror]:mx-auto [&_.ProseMirror_p]:my-2
      [&_.ProseMirror]:[line-height:var(--line-height,1.625)] [&_.ProseMirror]:[font-size:var(--editor-font-size,16px)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-[var(--text-secondary)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:opacity-30
      [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:my-4
      [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:my-3
      [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-bold [&_.ProseMirror_h3]:my-2
      [&_.ProseMirror_h4]:text-base [&_.ProseMirror_h4]:font-bold [&_.ProseMirror_h4]:my-1.5
      [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:ml-6 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:ml-6
      [&_.ProseMirror_ul[data-type='taskList']]:list-none [&_.ProseMirror_ul[data-type='taskList']]:ml-0
      [&_label]:flex [&_label]:mt-0.5
      [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-[var(--text-primary)] [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:my-4
      [&_.ProseMirror_code]:bg-[var(--bg-secondary)] [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:rounded-ui [&_.ProseMirror_code]:text-sm [&_.ProseMirror_code]:font-mono
      [&_.ProseMirror_pre]:bg-[var(--bg-secondary)] [&_.ProseMirror_pre]:p-4 [&_.ProseMirror_pre]:rounded-ui [&_.ProseMirror_pre]:my-4 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:font-mono
      [&_.ProseMirror_pre_code]:bg-transparent [&_.ProseMirror_pre_code]:p-0 [&_.ProseMirror_pre_code]:rounded-none [&_.ProseMirror_pre_code]:text-[length:var(--editor-font-size,16px)]
      [&_.ProseMirror_pre_code[class^='language-']]:text-left
      [&_.ProseMirror_hr]:border-[var(--border-subtle)] [&_.ProseMirror_hr]:my-6
      [&_.ProseMirror_a]:underline [&_.ProseMirror_s]:line-through
      [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:my-4
      [&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-[var(--border-subtle)] [&_.ProseMirror_th]:px-3 [&_.ProseMirror_th]:py-2 [&_.ProseMirror_th]:text-left [&_.ProseMirror_th]:font-semibold [&_.ProseMirror_th]:bg-[var(--bg-secondary)]
      [&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-[var(--border-subtle)] [&_.ProseMirror_td]:px-3 [&_.ProseMirror_td]:py-2"
  ></div>
  {#if wikiSuggestionsOpen}
    <div
      class="absolute left-4 right-4 top-14 z-20 max-h-56 overflow-y-auto rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-1 text-left shadow-2xl shadow-black/15 sm:right-auto sm:w-[min(32rem,calc(100%-2rem))] lg:left-12 lg:top-20 lg:w-[min(34rem,calc(100%-6rem))]"
      role="listbox"
      aria-label={$localizedText.sourceEditor.wikiSuggestions}
      tabindex="-1"
      on:mousedown|preventDefault
    >
      <div class="px-2.5 py-1.5 text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
        {$localizedText.sourceEditor.wikiSuggestions}
      </div>
      {#each wikiSuggestions as suggestion, index}
        <button
          type="button"
          role="option"
          aria-selected={activeWikiSuggestionIndex === index}
          class="flex !min-h-0 w-full flex-col !items-start !justify-start gap-0.5 rounded-ui px-2.5 py-1.5 text-left transition hover:bg-[var(--bg-secondary)] {activeWikiSuggestionIndex === index ? 'bg-[var(--bg-secondary)]' : ''}"
          on:mouseenter={() => activeWikiSuggestionIndex = index}
          on:click={() => selectWikiSuggestion(suggestion)}
        >
          <span class="flex w-full items-center gap-1.5">
            <span class="max-w-full truncate text-xs font-medium leading-tight">{suggestion.name}</span>
            {#if suggestion.duplicate}
              <span
                class="shrink-0 text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.1em] text-[var(--red)]"
                title={$localizedText.sourceEditor.duplicateName}
              >{$localizedText.sourceEditor.duplicateNameShort}</span>
            {/if}
          </span>
          <span class="max-w-full truncate text-[length:var(--text-whisper)] uppercase leading-tight tracking-[0.1em] text-[var(--text-tertiary)]">{suggestion.path?.startsWith('notes/') ? suggestion.path.slice(6) : suggestion.path}</span>
        </button>
      {/each}
    </div>
  {/if}
  </div>
</div>

<style>
  :global(.ProseMirror p.is-editor-empty:first-child::before) { content: attr(data-placeholder); float: left; pointer-events: none; height: 0; color: var(--text-secondary); opacity: 0.3; }
  :global(.ProseMirror) { --editor-caret: color-mix(in srgb, var(--text-primary) 82%, var(--yellow) 18%); min-height: 100%; outline: none; caret-color: var(--editor-caret); }
  :global(.ProseMirror ::selection) { background: color-mix(in srgb, var(--editor-caret) 18%, transparent); color: var(--text-primary); }
  :global(.ProseMirror hr) { border: none; border-top: 1px solid var(--border-subtle); margin: 1.5rem 0; }
  :global(.ProseMirror ul[data-type='taskList'] > li[data-checked]) {
    /* TipTap puts data-type on the <ul> and only data-checked on the <li>;
       without this the checkbox and the text stack on separate lines. */
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }
  :global(.ProseMirror ul[data-type='taskList'] > li[data-checked] > label) { display: flex; align-items: flex-start; gap: 0.5rem; }
  :global(.ProseMirror ul[data-type='taskList'] > li[data-checked] > div) { flex: 1 1 auto; min-width: 0; }
  :global(.ProseMirror ul[data-type='taskList'] > li[data-checked] > div > p:first-child) { margin-top: 0; }
  :global(.ProseMirror ul[data-type='taskList'] > li[data-checked] input[type='checkbox']) {
    appearance: none;
    -webkit-appearance: none;
    position: relative;
    flex: 0 0 auto;
    width: 1rem;
    height: 1rem;
    margin: 0.18rem 0 0;
    border: 1px solid color-mix(in srgb, var(--text-secondary) 45%, var(--border-subtle));
    border-radius: var(--radius);
    background: var(--note-page-panel, var(--bg-primary));
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }
  :global(.ProseMirror ul[data-type='taskList'] > li[data-checked] input[type='checkbox']:hover) {
    border-color: color-mix(in srgb, var(--text-primary) 55%, var(--border-subtle));
  }
  :global(.ProseMirror ul[data-type='taskList'] > li[data-checked] input[type='checkbox']:focus-visible) {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--note-accent, var(--text-primary)) 18%, transparent);
  }
  :global(.ProseMirror ul[data-type='taskList'] > li[data-checked] input[type='checkbox']:checked) {
    border-color: var(--note-accent, var(--text-primary));
    background: var(--note-accent, var(--text-primary));
  }
  :global(.ProseMirror ul[data-type='taskList'] > li[data-checked] input[type='checkbox']:checked::after) {
    content: '';
    position: absolute;
    left: 0.31rem;
    top: 0.12rem;
    width: 0.28rem;
    height: 0.55rem;
    border: solid var(--bg-primary);
    border-width: 0 0.12rem 0.12rem 0;
    transform: rotate(45deg);
  }
  :global(.ProseMirror ul[data-type='taskList'] > li[data-checked][data-checked='true'] > div) {
    color: var(--text-secondary);
  }
  :global(.ProseMirror .math-block) {
    display: flex;
    justify-content: center;
    margin: 1rem 0;
    padding: 0.5rem 0;
    overflow-x: auto;
  }
  :global(.ProseMirror .math-block .katex-display) { margin: 0; }
  :global(.ProseMirror .math-error) {
    color: var(--red);
    font-family: var(--font-mono, monospace);
    white-space: pre-wrap;
  }
  :global(.ProseMirror .mermaid-block) {
    margin: 1rem 0;
    padding: 0.75rem;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius);
    background: var(--note-page-panel, var(--bg-primary));
    overflow-x: auto;
  }
  :global(.ProseMirror .mermaid-block svg) { max-width: 100%; height: auto; }
  :global(.ProseMirror .mermaid-block .mermaid-source) {
    margin: 0;
    font-family: var(--font-mono, monospace);
    font-size: 0.85em;
    color: var(--text-secondary);
    white-space: pre;
  }
  :global(.ProseMirror .editor-image-frame) { display: inline-flex; max-width: 100%; flex-direction: column; align-items: center; gap: 0.4rem; margin: 1.25rem 0; vertical-align: top; }
  :global(.ProseMirror img.editor-image) { max-width: 100%; height: auto; border-radius: var(--radius); border: 1px solid var(--border-subtle); }
  :global(.ProseMirror .editor-image-caption) { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 0.72em; line-height: 1.35; opacity: 0.72; }
  button { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; min-height: 36px; }
  @media (min-width: 640px) { button { min-width: 28px; min-height: 28px; } }

  .toolbar-scroll::-webkit-scrollbar { height: 3px; }
  .toolbar-scroll::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: var(--radius); }
  .toolbar-scroll { scrollbar-width: thin; scrollbar-color: var(--border-subtle) transparent; }
</style>
