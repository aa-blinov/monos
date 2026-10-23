<script>
  import UrlPromptModal from './UrlPromptModal.svelte';
  import { onMount, tick } from 'svelte';
  import { Button, IconButton } from '@monos/ui';
  import { createEventDispatcher } from 'svelte';
  import { Editor } from '@tiptap/core';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { createRichEditorExtensions } from '../lib/richEditorExtensions.js';
  import { markdownToEditorContent } from '../lib/markdown-editor-content.js';
  import { unescapeCalloutMarkers } from '../lib/callouts.js';
  import { markdownTextFromClipboard } from '../lib/rich-editor-paste.js';
  import { isMarkdownBurst } from '../lib/markdown-burst.js';
  import { shortcutLabel } from '../lib/shortcut-label.js';
  import { findHeadingPos } from '../lib/outline.js';
  import { scrollBehavior } from '../lib/motion.js';
  import { firstImageFileFromDataTransfer, firstPdfFileFromDataTransfer, imageDisplayName, markdownLinkPath } from '../lib/attachments.js';
  import { NOTE_LINK_DRAG_TYPE, wikiLinkForNote } from '../lib/drag-data.js';
  import { fitMenuHeight } from '../lib/context-menu-position.js';
  import { SEARCH_BUTTON_COMPACT_CLASS, SEARCH_ICON_COMPACT_CLASS, SEARCH_INPUT_COMPACT_CLASS } from '../lib/search-field.js';
  import { SearchQuery, setSearchState, getSearchState, findNext as searchNextMatch, findPrev as searchPrevMatch } from 'prosemirror-search';
  import { localizedText } from '../lib/strings.js';
  import {
    Undo2, Redo2, Bold, Italic, Strikethrough, Code,
    Heading1, Heading2, Heading3, Heading4,
    List, ListOrdered, Quote, Code2, Minus, Link, Table2, CheckSquare,
    MoreHorizontal, ArrowUpRight, FilePlus,
    Maximize2, WrapText, ALargeSmall, Check,
    Search, ChevronUp, ChevronDown, X
  } from 'lucide-svelte';
  import { contentWidth, lineHeight, editorFontSize } from '../stores.js';
  import { contentWidthOptions, lineHeightOptions, editorFontSizeOptions } from '../lib/fonts.js';
  import { externalLinkAt, wikiLinksKey } from '../lib/richEditorExtras.js';
  import { isOpenableUrl, wikiLinkAt, wikiLinkKey, wikiLinkStatus } from '../lib/wiki-link-decorations.js';
  import { newNoteForWikiLink } from '../lib/wiki-links.js';
  import { resolveWikiLink } from '../lib/editor-api.js';

  // Everyday formatting stays in the toolbar. The rarer tools (`extraTools`) join it while the row has room for
  // them and move into "More tools" as it narrows, so nothing is hidden that would have fitted.
  let moreOpen = false;
  // The view of the text — its width and the line spacing — sits in the panel itself, at its right edge.
  // It lived in the "…" menu, and the menu is only there when the row overflows: a setting that is only in
  // Settings is a setting that is lost. Settings keeps them too.
  let viewPanel = null;
  let toolbarEl;
  let extrasEl;
  let visibleExtras = 0;
  const EXTRA_BUTTON_WIDTH = 30;
  const EXTRA_GROUP_GAP = 15;
  function fitExtras() {
    if (!toolbarEl) return;
    // The row without the extras: the span its buttons cover now (scrollWidth would read as the whole row
    // while there is room), less the extras' own width and their divider.
    const first = toolbarEl.firstElementChild;
    const last = toolbarEl.lastElementChild;
    if (!first || !last) return;
    const span = last.getBoundingClientRect().right - first.getBoundingClientRect().left;
    const base = span - (extrasEl ? extrasEl.offsetWidth + EXTRA_GROUP_GAP : 0);
    const room = toolbarEl.clientWidth - base - EXTRA_GROUP_GAP;
    const next = Math.max(0, Math.min(extraTools.length, Math.floor(room / EXTRA_BUTTON_WIDTH)));
    if (next !== visibleExtras) visibleExtras = next;
  }
  // The menu holds what the row had no room for. Nothing hidden, no button: the text settings it used to
  // carry live in Settings now, so a dots-only menu on a wide window was a button that opened four choices.
  $: hiddenTools = extraTools.length - visibleExtras;
  // Widening the window takes the last tool out of the menu; its trigger goes with it, so the open menu closes.
  $: if (!hiddenTools) moreOpen = false;
  onMount(() => {
    if (typeof ResizeObserver === 'undefined' || !toolbarEl) return undefined;
    const observer = new ResizeObserver(() => fitExtras());
    observer.observe(toolbarEl);
    fitExtras();
    return () => observer.disconnect();
  });
  // The block tools (table, code) take room too: fit again when they come and go.
  $: blockToolsShown = active.table || active.codeBlock;
  $: if (toolbarEl) { blockToolsShown; tick().then(fitExtras); }
  function runMore(action) {
    action();
    moreOpen = false;
  }
  function closeMoreOnOutsideClick(event) {
    if (moreOpen && !event.target.closest?.('[data-more-tools]')) moreOpen = false;
    if (viewPanel && !event.target.closest?.('[data-view-panel]')) viewPanel = null;
  }
  function closeMoreOnEscape(event) {
    if (moreOpen && event.key === 'Escape') moreOpen = false;
    if (viewPanel && event.key === 'Escape') viewPanel = null;
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
  let active = { bold: false, italic: false, strike: false, code: false, heading: 0, bullet: false, ordered: false, task: false, quote: false, codeBlock: false, table: false, codeLanguage: '' };
  let slashMenuOpen = false;

  // While the menu is open the text box says so and names the highlighted command, which a screen reader
  // cannot see: focus stays in the text.
  $: syncSlashAria(slashMenuOpen, activeSlashIndex);
  function syncSlashAria(open, index) {
    const dom = editor?.view?.dom;
    if (!dom) return;
    if (open) {
      dom.setAttribute('aria-haspopup', 'listbox');
      dom.setAttribute('aria-expanded', 'true');
      dom.setAttribute('aria-controls', 'slash-menu');
      dom.setAttribute('aria-activedescendant', `slash-option-${index}`);
    } else {
      for (const name of ['aria-haspopup', 'aria-expanded', 'aria-controls', 'aria-activedescendant']) dom.removeAttribute(name);
    }
  }
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

  // The toolbar reads by meaning: what the text looks like, what it is called, what shape it has, and
  // what is inserted. The rare tools follow the everyday ones and go into "More tools" as the row narrows.
  $: extraTools = [
    { id: 'quote', icon: Quote, label: $localizedText.richEditor.blockquote, run: cmd('toggleBlockquote'), on: active.quote },
    { id: 'codeblock', icon: Code2, label: $localizedText.richEditor.codeBlock, run: cmd('toggleCodeBlock'), on: active.codeBlock },
    { id: 'hr', icon: Minus, label: $localizedText.richEditor.horizontalRule, run: cmd('hr'), on: false },
    { id: 'code', icon: Code, label: shortcutLabel($localizedText.richEditor.inlineCode), run: cmd('toggleCode'), on: active.code },
    { id: 'link', icon: Link, label: $localizedText.richEditor.addLink, run: cmd('link'), on: false },
    { id: 'table', icon: Table2, label: $localizedText.richEditor.insertTable, run: cmd('table'), on: active.table },
  ];

  $: localizedWidthOptions = contentWidthOptions.map((option) => ({ ...option, label: $localizedText.optionLabels.contentWidth[option.value] || option.name }));
  $: localizedSpacingOptions = lineHeightOptions.map((option) => ({ ...option, label: $localizedText.optionLabels.lineHeight[option.value] || option.name }));
  $: localizedFontSizeOptions = editorFontSizeOptions.map((option) => ({ ...option, label: $localizedText.optionLabels.fontSize[option.value] || option.name }));
  $: viewControls = [
    { id: 'fontSize', icon: ALargeSmall, label: $localizedText.richEditor.fontSize, value: $editorFontSize, store: editorFontSize, options: localizedFontSizeOptions },
    { id: 'width', icon: Maximize2, label: $localizedText.richEditor.contentWidth, value: $contentWidth, store: contentWidth, options: localizedWidthOptions },
    { id: 'spacing', icon: WrapText, label: $localizedText.richEditor.lineHeight, value: $lineHeight, store: lineHeight, options: localizedSpacingOptions },
  ];

  const slashCommands = [
    // `markdown`: what typed at the start of a line makes the same block, shown beside the item so the menu
    // also teaches the shortcut. A table has none.
    { id: 'heading1', markdown: '#', run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { id: 'heading2', markdown: '##', run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { id: 'bulletList', markdown: '-', run: () => editor.chain().focus().toggleBulletList().run() },
    { id: 'numberedList', markdown: '1.', run: () => editor.chain().focus().toggleOrderedList().run() },
    { id: 'checklist', markdown: '[ ]', run: () => editor.chain().focus().toggleTaskList().run() },
    { id: 'blockquote', markdown: '>', run: () => editor.chain().focus().toggleBlockquote().run() },
    { id: 'codeBlock', markdown: '```', run: () => editor.chain().focus().toggleCodeBlock().run() },
    { id: 'table', markdown: '', run: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: 'horizontalRule', markdown: '---', run: () => editor.chain().focus().setHorizontalRule().run() },
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

  // Поиск по тексту заметки. Плагин prosemirror-search считает совпадения и подсвечивает их;
  // панель показывает, сколько их и где каретка.
  let findOpen = false;
  let findTerm = '';
  let findTotal = 0;
  let findAt = 0;
  let findInput;
  let findNotePath = '';

  function updateFindState() {
    const view = editor?.view;
    if (!view) return;
    const matches = getSearchState(view.state)?.deco?.find() || [];
    findTotal = matches.length;
    const { from, to } = view.state.selection;
    const index = matches.findIndex((match) => match.from === from && match.to === to);
    findAt = index < 0 ? 0 : index + 1;
  }

  function applyFindTerm() {
    const view = editor?.view;
    if (!view) return;
    view.dispatch(setSearchState(view.state.tr, new SearchQuery({ search: findTerm })));
    updateFindState();
  }

  function stepFind(backwards) {
    const view = editor?.view;
    if (!view || !findTerm) return;
    const command = backwards ? searchPrevMatch : searchNextMatch;
    command(view.state, view.dispatch);
    updateFindState();
  }

  export function openFind() {
    findOpen = true;
    tick().then(() => { findInput?.focus(); findInput?.select(); });
  }

  export function closeFind({ focus = false } = {}) {
    findOpen = false;
    findTerm = '';
    findTotal = 0;
    findAt = 0;
    const view = editor?.isDestroyed ? null : editor?.view;
    if (view) view.dispatch(setSearchState(view.state.tr, new SearchQuery({ search: '' })));
    // Как в macOS: панель закрылась — каретка снова в тексте, можно печатать дальше.
    // Фокус возвращается после того, как поле убрано из страницы: иначе он уйдёт вместе с ним.
    if (focus) tick().then(() => { if (editor && !editor.isDestroyed) editor.view?.focus?.(); });
  }

  function findKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      stepFind(event.shiftKey);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeFind({ focus: true });
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g') {
      event.preventDefault();
      stepFind(event.shiftKey);
    }
  }

  $: findLabel = $localizedText.richEditor.findCount(findAt, findTotal);
  // Другая заметка: искать в ней нечего, панель закрывается.
  $: if (notePath !== findNotePath) {
    findNotePath = notePath;
    closeFind();
  }

  function createEditor() {
    if (editor) return;
    editor = new Editor({
      element: null,
      extensions: createRichEditorExtensions(placeholder || $localizedText.richEditor.beginWriting, {
        resolveImageSrc,
        resolveImagePath,
        onWikiLinkActivate: ({ target }) => activateWikiLink(target),
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
        updateFindState();
      },
      onSelectionUpdate: ({ editor: ed }) => {
        updateActive(ed);
        updateFindState();
      },
      onTransaction: () => updateWikiLinkHere(),
      onFocus: () => updateWikiLinkHere(),
      onBlur: () => updateWikiLinkHere(),
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
    // Another note: what its links lead to is looked up afresh.
    editor.storage.wikiLinks?.statuses.clear();
    editor
      .chain()
      .setMeta('addToHistory', false)
      .setContent(markdownToEditorContent(nextContent), { emitUpdate: false })
      .run();
  }

  // The link the caret is in. While the editor has focus a small bar under it opens the note, offers to
  // create a missing one, or lists the notes that share the name. Clicking a link only places the caret,
  // so its text stays editable; Ctrl/⌘+click and Ctrl/⌘+Enter open it at once.
  let wikiLinkHere = null;
  let wikiBarPosition = { left: 0, top: 0 };
  let wikiBarEl;

  function wikiStatusOf(target) {
    return editor?.storage.wikiLinks?.statuses.get(wikiLinkKey(target)) || { kind: 'pending' };
  }

  function updateWikiLinkHere() {
    if (!editor || !editable || !editor.view.hasFocus() || !editor.state.selection.empty) {
      wikiLinkHere = null;
      return;
    }
    const state = wikiLinksKey.getState(editor.state);
    const caret = editor.state.selection.from;
    const link = state ? wikiLinkAt(state.links, caret) : null;
    if (!link) {
      // A web address under the caret gets the same bar, with one action: open it in the browser.
      const external = externalLinkAt(editor.state, caret);
      if (external && isOpenableUrl(external.href)) {
        wikiLinkHere = { from: external.from ?? caret, to: external.to ?? caret, target: external.href, status: { kind: 'external', href: external.href } };
        placeWikiBar(wikiLinkHere);
      } else {
        wikiLinkHere = null;
      }
      return;
    }
    wikiLinkHere = { ...link, status: wikiStatusOf(link.target) };
    placeWikiBar(link);
  }

  function placeWikiBar(link) {
    if (!surfaceEl) return;
    try {
      const surface = surfaceEl.getBoundingClientRect();
      const start = editor.view.coordsAtPos(link.from);
      const end = editor.view.coordsAtPos(link.to);
      // The bar is 18rem wide, or the surface less a margin on each side when that is narrower.
      const barWidth = Math.min(wikiBarEl?.offsetWidth || 288, surface.width - 16);
      wikiBarPosition = {
        left: Math.max(8, Math.min(start.left - surface.left, surface.width - barWidth - 8)),
        top: Math.max(start.bottom, end.bottom) - surface.top + 6,
      };
    } catch {
      // No layout to measure: the bar keeps its last place.
    }
  }

  async function activateWikiLink(target) {
    let status = wikiStatusOf(target);
    if (status.kind === 'pending' || status.kind === 'unknown') {
      try {
        status = wikiLinkStatus(await resolveWikiLink(target));
      } catch {
        return;
      }
    }
    if (status.kind === 'found') {
      openWikiNote(status);
    } else if (status.kind === 'missing') {
      createWikiNote(target);
    } else if (status.kind === 'ambiguous') {
      // Several notes answer: the caret goes into the link, and the bar under it lists them.
      const link = wikiLinksKey.getState(editor.state).links.find((item) => wikiLinkKey(item.target) === wikiLinkKey(target));
      if (link) editor.chain().focus().setTextSelection(link.from + 2).run();
    }
  }

  // Tools for the block the caret is in: a table grows and shrinks here, a code block picks its language
  // and copies its text. They appear under the toolbar only while they apply.
  const CODE_LANGUAGES = ['', 'javascript', 'typescript', 'python', 'bash', 'json', 'html', 'css', 'sql', 'go', 'rust', 'java', 'swift', 'kotlin', 'c', 'cpp', 'csharp', 'php', 'ruby', 'xml', 'diff', 'yaml', 'markdown'];
  $: codeLanguages = active.codeLanguage && !CODE_LANGUAGES.includes(active.codeLanguage)
    ? [...CODE_LANGUAGES, active.codeLanguage]
    : CODE_LANGUAGES;
  let codeCopied = false;
  let codeCopiedTimer = null;

  function tableCommand(name) {
    editor?.chain().focus()[name]().run();
  }

  function setCodeLanguage(language) {
    editor?.chain().focus().updateAttributes('codeBlock', { language: language || null }).run();
  }

  async function copyCodeBlock() {
    const block = editor?.state.selection.$from.parent;
    if (!block || block.type.name !== 'codeBlock') return;
    try {
      await navigator.clipboard.writeText(block.textContent);
      codeCopied = true;
      if (codeCopiedTimer) clearTimeout(codeCopiedTimer);
      codeCopiedTimer = setTimeout(() => { codeCopied = false; }, 1500);
    } catch (error) {
      console.error('Failed to copy the code block:', error);
    }
  }

  function openExternal(href) {
    if (!isOpenableUrl(href)) return;
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  function openWikiNote(note) {
    wikiLinkHere = null;
    dispatch('openNote', { path: note.path, name: note.name });
  }

  function createWikiNote(target) {
    wikiLinkHere = null;
    dispatch('createLinkedNote', { target, ...newNoteForWikiLink(target) });
  }

  function updateActive(ed) {
    active = {
      bold: ed.isActive('bold'), italic: ed.isActive('italic'), strike: ed.isActive('strike'), code: ed.isActive('code'),
      heading: ed.isActive('heading') ? ed.getAttributes('heading').level : 0,
      bullet: ed.isActive('bulletList'), ordered: ed.isActive('orderedList'), task: ed.isActive('taskList'),
      quote: ed.isActive('blockquote'), codeBlock: ed.isActive('codeBlock'),
      table: ed.isActive('table'), codeLanguage: ed.getAttributes('codeBlock')?.language || '',
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

  // Команды форматирования из родного меню «Формат»: те же, что и на панели над текстом.
  const FORMAT_COMMANDS = {
    bold: ['toggleBold'],
    italic: ['toggleItalic'],
    strikethrough: ['toggleStrike'],
    code: ['toggleCode'],
    'heading-1': ['toggleHeading', { level: 1 }],
    'heading-2': ['toggleHeading', { level: 2 }],
    'bullet-list': ['toggleBulletList'],
    'numbered-list': ['toggleOrderedList'],
    'task-list': ['toggleTaskList'],
  };

  export function runFormat(name) {
    const command = FORMAT_COMMANDS[name];
    if (!command) return;
    cmd(command[0], command[1])();
  }

  // «Выделить всё» из меню «Правка»: текст заметки, а не страница.
  export function selectAllText() {
    if (!editor) return;
    editor.chain().focus().selectAll().run();
  }

  // «Удалить» из меню «Правка»: удаляет выделенное в тексте. Нативная роль браузера в редакторе
  // ничего не удаляет, поэтому удаляем сами.
  export function deleteSelectionText() {
    if (!editor) return;
    editor.chain().focus().deleteSelection().run();
  }

  export async function insertImageFile(file) {
    if (!file || !onImageFile || !editor) return false;
    const image = await onImageFile(file);
    if (!image?.relativePath) return false;
    editor.chain().focus().insertContent({
      type: 'paragraph',
      content: [{
        type: 'image',
        // Spaces escaped: a Markdown link must not hold them, or other editors and GitHub will not show the picture.
        attrs: { src: markdownLinkPath(image.relativePath), alt: imageDisplayName(image.name) },
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
    tick().then(placeWikiMenu);
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

  // Suggestions open while a link is being typed (the input event). Moving the caret, by click or by
  // arrow keys, only updates or closes a list that is already open: placing the caret in a finished link
  // shows the bar that opens it, not a list of other notes.
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

  // A menu that belongs to what is being typed opens under it: left edge at the trigger (`/` or `[[`),
  // top just below the caret line, or above it when the bottom of the editor has no room.
  function menuPositionAt(anchorPos, menuEl, fallbackWidth) {
    if (!editor || !surfaceEl) return null;
    const surface = surfaceEl.getBoundingClientRect();
    const edge = 8;
    const gap = 6;
    const menuWidth = menuEl?.offsetWidth || fallbackWidth;
    const menuHeight = menuEl?.offsetHeight || 0;
    let anchor;
    let caret;
    try {
      const { from } = editor.state.selection;
      anchor = editor.view.coordsAtPos(Math.max(0, Math.min(anchorPos, from)));
      caret = editor.view.coordsAtPos(from);
    } catch {
      // No layout to measure (a detached or hidden editor): the menu keeps its last place.
      return null;
    }
    const left = anchor.left - surface.left;
    const below = caret.bottom - surface.top + gap;
    const above = caret.top - surface.top - menuHeight - gap;
    const fitsBelow = below + menuHeight <= surface.height - edge;
    const top = fitsBelow || above < edge ? below : above;
    return {
      left: Math.min(Math.max(edge, left), Math.max(edge, surface.width - menuWidth - edge)),
      top: Math.min(Math.max(edge, top), Math.max(edge, surface.height - menuHeight - edge)),
    };
  }

  function placeSlashMenu() {
    if (!editor) return;
    const position = menuPositionAt(editor.state.selection.from - 1, slashMenuEl, 256);
    if (position) slashMenuPosition = position;
  }

  let wikiMenuEl;
  // Measured again once the list is drawn: its height decides whether it fits below the line.
  $: if (wikiSuggestionsOpen && wikiSuggestions) tick().then(placeWikiMenu);
  let wikiMenuPosition = { left: 16, top: 56 };
  function placeWikiMenu() {
    if (!editor || !wikiSuggestionRange) return;
    // The list starts under the `[[` that opened it.
    const position = menuPositionAt(wikiSuggestionRange.from - 2, wikiMenuEl, 448);
    if (position) wikiMenuPosition = position;
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
    submitLabel={$localizedText.richEditor.insertButton}
    on:submit={(e) => applyUrlPrompt(e.detail)}
    on:cancel={cancelUrlPrompt}
  />
{/if}

<svelte:window on:click={closeMoreOnOutsideClick} on:keydown={closeMoreOnEscape} on:resize={() => { if (slashMenuOpen) placeSlashMenu(); if (wikiSuggestionsOpen) placeWikiMenu(); }} />
<div class="flex flex-col flex-1 min-h-0">
  <!-- Поиск по тексту заметки: поле, счётчик совпадений и шаги по ним. -->
  {#if findOpen}
    <div class="flex items-center gap-2 border-b border-[var(--note-page-border,var(--border-subtle))] bg-[var(--note-page-panel,var(--bg-primary))] px-4 py-1.5 lg:py-2" data-testid="note-find">
      <div class="relative w-64 max-w-full">
        <Search size={14} strokeWidth="1.7" class={SEARCH_ICON_COMPACT_CLASS} aria-hidden="true" />
        <input
          bind:this={findInput}
          value={findTerm}
          on:input={(event) => { findTerm = event.currentTarget.value; applyFindTerm(); }}
          on:keydown={findKeydown}
          placeholder={$localizedText.richEditor.findPlaceholder}
          aria-label={$localizedText.richEditor.find}
          class="h-8 {SEARCH_INPUT_COMPACT_CLASS} pr-2"
          data-testid="note-find-input"
        />
      </div>
      <span class="shrink-0 text-xs tabular-nums text-[var(--text-tertiary)]" data-testid="note-find-count">{findLabel}</span>
      <IconButton bare tooltipText="" class={SEARCH_BUTTON_COMPACT_CLASS} label={$localizedText.richEditor.findPrevious} on:click={() => stepFind(true)}><ChevronUp size={14} strokeWidth="1.7" aria-hidden="true" /></IconButton>
      <IconButton bare tooltipText="" class={SEARCH_BUTTON_COMPACT_CLASS} label={$localizedText.richEditor.findNext} on:click={() => stepFind(false)}><ChevronDown size={14} strokeWidth="1.7" aria-hidden="true" /></IconButton>
      <IconButton bare tooltipText="" class={SEARCH_BUTTON_COMPACT_CLASS} label={$localizedText.richEditor.findClose} on:click={() => closeFind({ focus: true })}><X size={14} strokeWidth="1.7" aria-hidden="true" /></IconButton>
    </div>
  {/if}
  <!-- Toolbar: one scrolling row on a phone, the everyday buttons plus "More tools" on a desktop -->
  <div class="relative flex items-center gap-1 px-4 py-1.5 lg:py-2 border-b border-[var(--note-page-border,var(--border-subtle))] bg-[var(--note-page-panel,var(--bg-primary))]" role="presentation" on:mousedown|preventDefault data-more-tools>
    <div class="flex min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-x-auto toolbar-scroll" role="toolbar" aria-label={$localizedText.richEditor.toolbar} tabindex="0" bind:this={toolbarEl}>
    <!-- Undo/Redo -->
    <TooltipIconButton on:click={cmd('undo')} disabled={!canUndo} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition disabled:opacity-20" label={shortcutLabel($localizedText.richEditor.undo)}><Undo2 size="16" strokeWidth="1.7" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('redo')} disabled={!canRedo} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition disabled:opacity-20" label={shortcutLabel($localizedText.richEditor.redo)}><Redo2 size="16" strokeWidth="1.7" aria-hidden="true" /></TooltipIconButton>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <TooltipIconButton on:click={cmd('toggleBold')} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.bold ? 'bg-[var(--bg-secondary)]' : ''}" label={shortcutLabel($localizedText.richEditor.bold)}><Bold size="16" strokeWidth="1.7" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleItalic')} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.italic ? 'bg-[var(--bg-secondary)]' : ''}" label={shortcutLabel($localizedText.richEditor.italic)}><Italic size="16" strokeWidth="1.7" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleStrike')} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.strike ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.strikethrough}><Strikethrough size="16" strokeWidth="1.7" aria-hidden="true" /></TooltipIconButton>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <TooltipIconButton on:click={cmd('toggleHeading', { level: 1 })} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.heading === 1 ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.heading1}><Heading1 size="16" strokeWidth="1.7" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleHeading', { level: 2 })} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.heading === 2 ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.heading2}><Heading2 size="16" strokeWidth="1.7" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleHeading', { level: 3 })} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.heading === 3 ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.heading3}><Heading3 size="16" strokeWidth="1.7" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleHeading', { level: 4 })} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.heading === 4 ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.heading4}><Heading4 size="16" strokeWidth="1.7" aria-hidden="true" /></TooltipIconButton>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <TooltipIconButton on:click={cmd('toggleBulletList')} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.bullet ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.bulletList}><List size="16" strokeWidth="1.7" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleOrderedList')} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.ordered ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.numberedList}><ListOrdered size="16" strokeWidth="1.7" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleTaskList')} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {active.task ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.checklist}><CheckSquare size="16" strokeWidth="1.7" aria-hidden="true" /></TooltipIconButton>
    {#if visibleExtras > 0}
      <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>
      <div class="flex shrink-0 items-center gap-0.5" bind:this={extrasEl} data-testid="toolbar-extras">
        {#each extraTools.slice(0, visibleExtras) as tool (tool.id)}
          <TooltipIconButton on:click={tool.run} class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition {tool.on ? 'bg-[var(--bg-secondary)]' : ''}" label={tool.label}><svelte:component this={tool.icon} size="16" strokeWidth="1.7" aria-hidden="true" /></TooltipIconButton>
        {/each}
      </div>
    {/if}
    {#if active.table || active.codeBlock}
      <!-- Tools for the block the caret is in sit in the same row, so the text never jumps when they appear. -->
      <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>
      <div class="flex shrink-0 items-center gap-1 text-xs" role="group" aria-label={active.table ? $localizedText.richEditor.blockTools.table : $localizedText.richEditor.blockTools.code} data-testid="block-tools">
      <span class="mr-1 text-[length:var(--text-whisper)] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{active.table ? $localizedText.richEditor.blockTools.table : $localizedText.richEditor.blockTools.code}</span>
      {#if active.table}
        {#each [['addRowAfter', 'addRow'], ['addColumnAfter', 'addColumn'], ['deleteRow', 'deleteRow'], ['deleteColumn', 'deleteColumn']] as [command, label]}
          <span role="presentation" on:mousedown|preventDefault><Button variant="ghost" size="sm" class="normal-case" on:click={() => tableCommand(command)}>{$localizedText.richEditor.blockTools[label]}</Button></span>
        {/each}
        <span role="presentation" on:mousedown|preventDefault><Button variant="ghost" size="sm" class="normal-case text-danger-text" on:click={() => tableCommand('deleteTable')}>{$localizedText.richEditor.blockTools.deleteTable}</Button></span>
      {:else}
        <select
          aria-label={$localizedText.richEditor.blockTools.language}
          value={active.codeLanguage}
          on:change={(event) => setCodeLanguage(event.currentTarget.value)}
          class="h-7 rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 text-xs text-[var(--text-primary)]"
          on:mousedown|stopPropagation
          on:pointerdown|stopPropagation
        >
          {#each codeLanguages as language}
            <option value={language}>{language || $localizedText.richEditor.blockTools.plainText}</option>
          {/each}
        </select>
        <span role="presentation" on:mousedown|preventDefault><Button variant="ghost" size="sm" class="normal-case" on:click={copyCodeBlock}>{codeCopied ? $localizedText.richEditor.blockTools.copied : $localizedText.richEditor.blockTools.copy}</Button></span>
      {/if}
      </div>
    {/if}
    </div>

    <!-- The view of the text: its width and the line spacing. Pinned at the right, so they are always at hand. -->
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5 shrink-0"></span>
    {#each viewControls as control (control.id)}
      <div class="relative shrink-0" data-view-panel={control.id}>
        <TooltipIconButton
          on:click={() => { viewPanel = viewPanel === control.id ? null : control.id; moreOpen = false; }}
          class="p-1.5 rounded-ui hover:bg-[var(--bg-secondary)] transition"
          label={control.label}
          tooltip="{control.label}: {control.options.find((option) => option.value === control.value)?.label || ''}"
        >
          <svelte:component this={control.icon} size="16" strokeWidth="1.7" aria-hidden="true" />
        </TooltipIconButton>
        {#if viewPanel === control.id}
          <div class="absolute right-0 top-full z-30 mt-1 w-44 rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-1 shadow-2xl" role="menu" aria-label={control.label}>
            {#each control.options as option (option.value)}
              <Button
                variant="ghost"
                size="sm"
                role="menuitemradio"
                aria-checked={control.value === option.value}
                class="w-full justify-start gap-2 px-3 normal-case"
                on:click={() => { control.store.set(option.value); viewPanel = null; }}
              >
                <span class="w-3.5 shrink-0">{#if control.value === option.value}<Check size="14" strokeWidth="1.7" aria-hidden="true" />{/if}</span>
                {option.label}
              </Button>
            {/each}
          </div>
        {/if}
      </div>
    {/each}

    {#if hiddenTools > 0}
      <IconButton
        bare
        tooltipText=""
        class="h-8 w-8 shrink-0 {moreOpen ? 'bg-surface text-ink' : 'text-ink-soft'}"
        label={$localizedText.richEditor.more}
        aria-haspopup="menu"
        aria-expanded={moreOpen}
        on:click={() => moreOpen = !moreOpen}
      >
        <MoreHorizontal size="16" strokeWidth="1.7" aria-hidden="true" />
      </IconButton>
    {/if}

    {#if moreOpen}
      <div use:fitMenuHeight class="absolute right-2 top-full z-30 mt-1 w-72 rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-1 shadow-2xl" role="menu" aria-label={$localizedText.richEditor.more}>
        {#each extraTools as tool, index (tool.id)}
          {#if index >= visibleExtras}
            <Button variant="ghost" size="sm" role="menuitem" class="w-full justify-start gap-3 px-3 normal-case" on:click={() => runMore(tool.run)}>
              <svelte:component this={tool.icon} size="16" strokeWidth="1.7" aria-hidden="true" />{tool.label}
            </Button>
          {/if}
        {/each}
      </div>
    {/if}
  </div>


  <!-- Editor -->
  <div
    bind:this={surfaceEl}
    class="relative flex flex-col flex-1 min-h-0 overflow-hidden"
    data-testid="rich-editor-surface"
  >
  {#if wikiLinkHere && !wikiSuggestionsOpen && !slashMenuOpen && ['found', 'missing', 'ambiguous', 'external'].includes(wikiLinkHere.status.kind)}
    <div
      bind:this={wikiBarEl}
      class="absolute z-20 w-max min-w-72 max-w-[min(28rem,calc(100%-1rem))] rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-1 text-left shadow-xl shadow-black/15"
      style="left: {wikiBarPosition.left}px; top: {wikiBarPosition.top}px"
      role="group"
      aria-label={$localizedText.richEditor.wikiLink.label}
      data-testid="wiki-link-bar"
    >
      {#if wikiLinkHere.status.kind === 'external'}
        <span role="presentation" on:mousedown|preventDefault>
        <Button variant="ghost" size="sm" class="w-full justify-start gap-2 normal-case" on:click={() => openExternal(wikiLinkHere.status.href)}>
          <ArrowUpRight size="16" strokeWidth="1.7" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{$localizedText.richEditor.wikiLink.openExternal}<span class="ml-2 text-[var(--text-tertiary)]">{wikiLinkHere.status.href.replace(/^https?:\/\//, '')}</span></span>
          <kbd class="hidden shrink-0 font-sans text-[length:var(--text-whisper)] text-[var(--text-tertiary)] sm:inline">{shortcutLabel($localizedText.richEditor.wikiLink.shortcut)}</kbd>
        </Button>
        </span>
      {:else if wikiLinkHere.status.kind === 'found'}
        <span role="presentation" on:mousedown|preventDefault>
        <Button variant="ghost" size="sm" class="w-full justify-start gap-2 normal-case" on:click={() => openWikiNote(wikiLinkHere.status)}>
          <ArrowUpRight size="16" strokeWidth="1.7" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{$localizedText.richEditor.wikiLink.open(wikiLinkHere.status.name)}</span>
          <kbd class="hidden shrink-0 font-sans sm:inline text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{shortcutLabel($localizedText.richEditor.wikiLink.shortcut)}</kbd>
        </Button>
        </span>
      {:else if wikiLinkHere.status.kind === 'missing'}
        <span role="presentation" on:mousedown|preventDefault>
        <Button variant="ghost" size="sm" class="w-full justify-start gap-2 normal-case" on:click={() => createWikiNote(wikiLinkHere.target)}>
          <FilePlus size="16" strokeWidth="1.7" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{$localizedText.richEditor.wikiLink.create(newNoteForWikiLink(wikiLinkHere.target).title)}</span>
          <kbd class="hidden shrink-0 font-sans sm:inline text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{shortcutLabel($localizedText.richEditor.wikiLink.shortcut)}</kbd>
        </Button>
        </span>
      {:else}
        <p class="px-2.5 py-1.5 text-[length:var(--text-whisper)] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{$localizedText.richEditor.wikiLink.ambiguous}</p>
        {#each wikiLinkHere.status.matches as match}
          <span role="presentation" on:mousedown|preventDefault>
          <Button variant="ghost" size="sm" class="w-full flex-col items-start justify-start gap-0 normal-case" on:click={() => openWikiNote(match)}>
            <span class="max-w-full truncate text-sm">{match.name}</span>
            <span class="max-w-full truncate text-[length:var(--text-whisper)] text-[var(--text-tertiary)]">{match.path.startsWith('notes/') ? match.path.slice(6) : match.path}</span>
          </Button>
        </span>
        {/each}
      {/if}
    </div>
  {/if}
  {#if slashMenuOpen}
    <div
      bind:this={slashMenuEl}
      class="absolute z-20 w-64 rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-2xl p-1"
      style="left: {slashMenuPosition.left}px; top: {slashMenuPosition.top}px"
      id="slash-menu"
      role="listbox"
      aria-label={$localizedText.richEditor.slashMenuLabel}
    >
      <div class="px-3 py-2 text-[length:var(--text-whisper)] uppercase tracking-widest text-[var(--text-secondary)]">{$localizedText.richEditor.slashHint}</div>
      {#each slashCommands as slashCommand, index}
        <Button variant="ghost" size="sm"
          type="button"
          id="slash-option-{index}"
          tabindex="-1"
          role="option"
          aria-selected={activeSlashIndex === index}
          class="flex w-full items-center justify-between gap-3 rounded-ui px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)] {activeSlashIndex === index ? 'bg-[var(--bg-secondary)]' : ''}"
          on:mouseenter={() => activeSlashIndex = index}
          on:click={() => executeSlashCommand(slashCommand)}
        >
          <span>{$localizedText.richEditor.slashCommands[slashCommand.id]}</span>
          {#if slashCommand.markdown}<kbd aria-hidden="true" class="shrink-0 font-mono text-xs text-[var(--text-tertiary)]">{slashCommand.markdown}</kbd>{/if}
        </Button>
      {/each}
    </div>
  {/if}
  <div bind:this={editorEl}
    role="textbox"
    aria-multiline="true"
    tabindex="-1"
    data-testid="rich-editor-input"
    on:scroll={(event) => { if (slashMenuOpen) placeSlashMenu(); if (wikiSuggestionsOpen) placeWikiMenu(); dispatch('scrolled', { top: event.currentTarget.scrollTop, room: event.currentTarget.scrollHeight - event.currentTarget.clientHeight }); }}
    on:keydown|capture={handleEditorKeydown}
    on:keyup|capture={(event) => { handleEditorKeyup(event); if (wikiSuggestionsOpen && shouldRefreshWikiSuggestions(event)) refreshWikiSuggestionsAfterDomUpdate(); }}
    on:input|capture={refreshWikiSuggestionsAfterDomUpdate}
    on:paste|capture={handlePaste}
    on:dragover|capture={handleDragOver}
    on:dragleave={() => isImageDragging = false}
    on:drop|capture={handleDrop}
    on:click={(event) => { handleClick(event); if (wikiSuggestionsOpen) refreshWikiSuggestionsAfterDomUpdate(); }}
    class="min-h-0 h-full flex-1 overflow-y-auto overscroll-contain px-4 lg:px-12 pt-4 pb-4 lg:py-10 cursor-text touch-pan-y [&_.ProseMirror>:first-child]:mt-0
      {isImageDragging ? 'ring-1 ring-inset ring-[color-mix(in_srgb,var(--text-secondary)_35%,transparent)]' : ''}
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
      [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:my-4
      [&_.ProseMirror_th]:px-3 [&_.ProseMirror_th]:py-2 [&_.ProseMirror_th]:text-left [&_.ProseMirror_th]:font-semibold [&_.ProseMirror_th]:bg-[var(--bg-secondary)]
      [&_.ProseMirror_td]:px-3 [&_.ProseMirror_td]:py-2"
  ></div>
  {#if wikiSuggestionsOpen}
    <div
      bind:this={wikiMenuEl}
      class="absolute z-20 max-h-56 w-[min(28rem,calc(100%-1rem))] overflow-y-auto rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-1 text-left shadow-2xl shadow-black/15"
      style="left: {wikiMenuPosition.left}px; top: {wikiMenuPosition.top}px"
      role="listbox"
      aria-label={$localizedText.sourceEditor.wikiSuggestions}
      tabindex="-1"
      on:mousedown|preventDefault
    >
      <div class="px-2.5 py-1.5 text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
        {$localizedText.sourceEditor.wikiSuggestions}
      </div>
      {#each wikiSuggestions as suggestion, index}
        <Button variant="ghost" size="sm"
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
        </Button>
      {/each}
    </div>
  {/if}
  </div>
</div>

<style>
  :global(.ProseMirror p.is-editor-empty:first-child::before) { content: attr(data-placeholder); float: left; pointer-events: none; height: 0; color: var(--text-secondary); opacity: 0.3; }
  /* A table is one rectangle with the one radius: the outer frame carries the corner, the cells draw only the lines between them.
     A collapsed border cannot take a corner, so the table keeps its borders separate with no spacing. */
  :global(.ProseMirror table) { border-collapse: separate; border-spacing: 0; border: 1px solid var(--border-subtle); border-radius: var(--radius); overflow: hidden; }
  :global(.ProseMirror th), :global(.ProseMirror td) { border-right: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); }
  :global(.ProseMirror tr > :last-child) { border-right: 0; }
  /* A cell holds a paragraph; its block margins would make every row twice as tall as its text. */
  :global(.ProseMirror td > p), :global(.ProseMirror th > p) { margin: 0; }
  :global(.ProseMirror table > :last-child > tr:last-child > *) { border-bottom: 0; }
  /* A wiki link reads as a link; one that leads nowhere is drawn dashed and quieter, like a draft. */
  :global(.ProseMirror .wiki-link) { color: var(--text-primary); text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--text-primary) 40%, transparent); text-underline-offset: 3px; text-decoration-thickness: 1px; }
  :global(.ProseMirror .external-link) { text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--text-primary) 40%, transparent); text-underline-offset: 3px; text-decoration-thickness: 1px; }
  :global(.ProseMirror .wiki-link-bracket) { font-size: 0; }
  :global(.ProseMirror .wiki-link-missing) { color: var(--text-secondary); text-decoration-style: dashed; }
  :global(.ProseMirror .wiki-link-ambiguous) { text-decoration-style: double; }
  /* flow-root keeps the paragraphs' margins inside the editor: a collapsed margin would stick out past min-height and show a scrollbar on a short note. */
  :global(.ProseMirror) { --editor-caret: color-mix(in srgb, var(--text-primary) 82%, var(--yellow) 18%); display: flow-root; min-height: 100%; outline: none; caret-color: var(--editor-caret); }
  :global(.ProseMirror ::selection) { background: color-mix(in srgb, var(--editor-caret) 18%, transparent); color: var(--text-primary); }
  /* Совпадения поиска по заметке: тем же жёлтым, что и в справке. */
  :global(.ProseMirror-search-match) { background: color-mix(in srgb, var(--yellow) 35%, transparent); }
  :global(.ProseMirror-active-search-match) { background: color-mix(in srgb, var(--yellow) 60%, transparent); }
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
  /* Toolbar buttons are square icons; the items of the menus here are rows and keep their own layout. */
  /* The toolbar's buttons are TooltipIconButtons, children of this component, so a plain selector never reached
     them and they stayed 28px on a phone. On a phone they are 40px (the strip scrolls sideways, so a larger
     button costs tools on screen: 40 keeps seven in view, 44 would show six); with a pointer they tighten to 28px. */
  [data-more-tools] :global(button:not([role='menuitem']):not([role='menuitemradio']):not([role='option'])) { display: inline-flex; align-items: center; justify-content: center; min-width: 40px; min-height: 40px; }
  @media (min-width: 640px) { [data-more-tools] :global(button:not([role='menuitem']):not([role='menuitemradio']):not([role='option'])) { min-width: 28px; min-height: 28px; } }

  .toolbar-scroll::-webkit-scrollbar { height: 3px; }
  .toolbar-scroll::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: var(--radius); }
  .toolbar-scroll { scrollbar-width: thin; scrollbar-color: var(--border-subtle) transparent; }
</style>
