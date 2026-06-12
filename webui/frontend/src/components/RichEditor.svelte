<script>
  import { onMount, onDestroy } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { Editor } from '@tiptap/core';
  import { get } from 'svelte/store';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import { lineHeight, contentWidth, editorFontSize } from '../stores.js';
  import { lineHeightOptions, contentWidthOptions, editorFontSizeOptions } from '../lib/fonts.js';
  import { createRichEditorExtensions } from '../lib/richEditorExtensions.js';
  import { firstImageFileFromDataTransfer, imageDisplayName } from '../lib/attachments.js';
  import { localizedText } from '../lib/strings.js';
  import {
    Undo2, Redo2, Bold, Italic, Strikethrough, Code,
    Heading1, Heading2, Heading3, Heading4,
    List, ListOrdered, Quote, Code2, Minus, Link, Table2, CheckSquare,
    Maximize2, WrapText, Type
  } from 'lucide-svelte';

  export let content = '';
  export let onUpdate = (md) => {};
  export let placeholder = null;
  export let onImageFile = null;
  export let resolveImageSrc = (src) => src;
  export let resolveImagePath = () => '';

  const dispatch = createEventDispatcher();

  let editorEl;
  let editor;
  let canUndo = false;
  let canRedo = false;
  let active = { bold: false, italic: false, strike: false, code: false, heading: 0, bullet: false, ordered: false, task: false, quote: false, codeBlock: false };
  let slashMenuOpen = false;
  let activeSlashIndex = 0;
  let isImageDragging = false;

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

  function cycleOption(store, options) {
    const current = get(store);
    const idx = options.findIndex(o => o.value === current);
    const next = options[(idx + 1) % options.length];
    store.set(next.value);
  }

  function createEditor() {
    if (editor) return;
    editor = new Editor({
      element: editorEl,
      extensions: createRichEditorExtensions(placeholder || $localizedText.richEditor.beginWriting, {
        resolveImageSrc,
        resolveImagePath,
      }),
      content: content,
      onUpdate: ({ editor: ed }) => {
        const md = ed.storage.markdown?.getMarkdown?.() || '';
        onUpdate(md);
        updateActive(ed);
      },
      onSelectionUpdate: ({ editor: ed }) => updateActive(ed),
    });
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
      const c = editor.chain().focus();
      if (method === 'undo') c.undo().run();
      else if (method === 'redo') c.redo().run();
      else if (method === 'hr') c.setHorizontalRule().run();
      else if (method === 'link') { const url = prompt($localizedText.richEditor.linkPrompt); if (url) c.extendMarkRange('link').setLink({ href: url }).run(); }
      else if (method === 'image') { const url = prompt($localizedText.richEditor.imagePrompt); if (url) c.setImage({ src: url, alt: '' }).run(); }
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
    if (!file) return;
    event.preventDefault();
    await insertImageFile(file);
  }

  function handleDragOver(event) {
    if (!firstImageFileFromDataTransfer(event.dataTransfer)) return;
    event.preventDefault();
    isImageDragging = true;
  }

  async function handleDrop(event) {
    const file = firstImageFileFromDataTransfer(event.dataTransfer);
    isImageDragging = false;
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

  function deleteSlashTrigger() {
    if (!editor) return;
    const { from } = editor.state.selection;
    const previousChar = editor.state.doc.textBetween(Math.max(0, from - 1), from);
    if (previousChar === '/') {
      editor.commands.deleteRange({ from: from - 1, to: from });
    }
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
      if (event.key === 'Enter') {
        event.preventDefault();
        executeSlashCommand(slashCommands[activeSlashIndex]);
        return;
      }
    }

    if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      window.setTimeout(() => {
        slashMenuOpen = true;
        activeSlashIndex = 0;
      });
    }
  }

  function handleEditorKeyup(event) {
    if (!slashMenuOpen || event.key !== 'Enter') return;
    event.preventDefault();
    executeSlashCommand(slashCommands[activeSlashIndex]);
  }

  export function getMarkdown() { return editor?.storage.markdown?.getMarkdown?.() || content; }
  export function setMarkdown(md) { if (editor) editor.commands.setContent(md || ''); }

  onMount(createEditor);
  onDestroy(() => editor?.destroy());
</script>

<div class="flex flex-col flex-1 min-h-0">
  <!-- Toolbar -->
  <div class="flex items-center gap-0.5 px-2 lg:px-3 py-1.5 lg:py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] overflow-x-auto toolbar-scroll" on:mousedown|preventDefault role="toolbar" aria-label={$localizedText.richEditor.toolbar} tabindex="0">
    <!-- Undo/Redo -->
    <TooltipIconButton on:click={cmd('undo')} disabled={!canUndo} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition disabled:opacity-20" label={$localizedText.richEditor.undo}><Undo2 size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('redo')} disabled={!canRedo} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition disabled:opacity-20" label={$localizedText.richEditor.redo}><Redo2 size="16" aria-hidden="true" /></TooltipIconButton>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <TooltipIconButton on:click={cmd('toggleBold')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.bold ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.bold}><Bold size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleItalic')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.italic ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.italic}><Italic size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleStrike')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.strike ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.strikethrough}><Strikethrough size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleCode')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.code ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.inlineCode}><Code size="16" aria-hidden="true" /></TooltipIconButton>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <TooltipIconButton on:click={cmd('toggleHeading', { level: 1 })} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.heading === 1 ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.heading1}><Heading1 size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleHeading', { level: 2 })} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.heading === 2 ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.heading2}><Heading2 size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleHeading', { level: 3 })} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.heading === 3 ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.heading3}><Heading3 size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleHeading', { level: 4 })} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.heading === 4 ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.heading4}><Heading4 size="16" aria-hidden="true" /></TooltipIconButton>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <TooltipIconButton on:click={cmd('toggleBulletList')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.bullet ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.bulletList}><List size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleOrderedList')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.ordered ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.numberedList}><ListOrdered size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleTaskList')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.task ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.checklist}><CheckSquare size="16" aria-hidden="true" /></TooltipIconButton>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <TooltipIconButton on:click={cmd('toggleBlockquote')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.quote ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.blockquote}><Quote size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('toggleCodeBlock')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.codeBlock ? 'bg-[var(--bg-secondary)]' : ''}" label={$localizedText.richEditor.codeBlock}><Code2 size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('hr')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition" label={$localizedText.richEditor.horizontalRule}><Minus size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={cmd('table')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition" label={$localizedText.richEditor.insertTable}><Table2 size="16" aria-hidden="true" /></TooltipIconButton>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <TooltipIconButton on:click={cmd('link')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition" label={$localizedText.richEditor.addLink}><Link size="16" aria-hidden="true" /></TooltipIconButton>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <TooltipIconButton on:click={() => cycleOption(contentWidth, contentWidthOptions)} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition" label={$localizedText.richEditor.contentWidth}><Maximize2 size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={() => cycleOption(lineHeight, lineHeightOptions)} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition" label={$localizedText.richEditor.lineHeight}><WrapText size="16" aria-hidden="true" /></TooltipIconButton>
    <TooltipIconButton on:click={() => cycleOption(editorFontSize, editorFontSizeOptions)} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition" label={$localizedText.richEditor.fontSize}><Type size="16" aria-hidden="true" /></TooltipIconButton>
  </div>

  <!-- Editor -->
  <div
    class="relative flex flex-col flex-1 min-h-0 overflow-hidden"
    data-testid="rich-editor-surface"
  >
  {#if slashMenuOpen}
    <div
      class="absolute left-4 lg:left-12 top-3 lg:top-6 z-20 w-64 border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-2xl p-1"
      role="listbox"
      aria-label={$localizedText.richEditor.slashMenuLabel}
    >
      <div class="px-3 py-2 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{$localizedText.richEditor.slashHint}</div>
      {#each slashCommands as slashCommand, index}
        <button
          type="button"
          role="option"
          aria-selected={activeSlashIndex === index}
          class="w-full justify-start px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)] {activeSlashIndex === index ? 'bg-[var(--bg-secondary)]' : ''}"
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
    on:keydown|capture={handleEditorKeydown}
    on:keyup|capture={handleEditorKeyup}
    on:paste|capture={handlePaste}
    on:dragover|capture={handleDragOver}
    on:dragleave={() => isImageDragging = false}
    on:drop|capture={handleDrop}
    on:click={handleClick}
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
      [&_.ProseMirror_li[data-type='taskItem']]:flex [&_.ProseMirror_li[data-type='taskItem']]:items-start [&_.ProseMirror_li[data-type='taskItem']]:gap-2
      [&_label]:flex [&_label]:mt-0.5
      [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-[var(--text-primary)] [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:my-4
      [&_.ProseMirror_code]:bg-[var(--bg-secondary)] [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:text-sm [&_.ProseMirror_code]:font-mono
      [&_.ProseMirror_pre]:bg-[var(--bg-secondary)] [&_.ProseMirror_pre]:p-4 [&_.ProseMirror_pre]:rounded-lg [&_.ProseMirror_pre]:my-4 [&_.ProseMirror_pre]:overflow-x-auto
      [&_.ProseMirror_hr]:border-[var(--border-subtle)] [&_.ProseMirror_hr]:my-6
      [&_.ProseMirror_a]:underline [&_.ProseMirror_s]:line-through
      [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:my-4
      [&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-[var(--border-subtle)] [&_.ProseMirror_th]:px-3 [&_.ProseMirror_th]:py-2 [&_.ProseMirror_th]:text-left [&_.ProseMirror_th]:font-semibold [&_.ProseMirror_th]:bg-[var(--bg-secondary)]
      [&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-[var(--border-subtle)] [&_.ProseMirror_td]:px-3 [&_.ProseMirror_td]:py-2"
  ></div>
  </div>
</div>

<style>
  :global(.ProseMirror p.is-editor-empty:first-child::before) { content: attr(data-placeholder); float: left; pointer-events: none; height: 0; color: var(--text-secondary); opacity: 0.3; }
  :global(.ProseMirror) { --editor-caret: color-mix(in srgb, var(--text-primary) 82%, var(--yellow) 18%); min-height: 100%; outline: none; caret-color: var(--editor-caret); }
  :global(.ProseMirror ::selection) { background: color-mix(in srgb, var(--editor-caret) 18%, transparent); color: var(--text-primary); }
  :global(.ProseMirror hr) { border: none; border-top: 1px solid var(--border-subtle); margin: 1.5rem 0; }
  :global(.ProseMirror .editor-image-frame) { display: inline-flex; max-width: 100%; flex-direction: column; align-items: center; gap: 0.4rem; margin: 1.25rem 0; vertical-align: top; }
  :global(.ProseMirror img.editor-image) { max-width: 100%; height: auto; border-radius: 0.75rem; border: 1px solid var(--border-subtle); }
  :global(.ProseMirror .editor-image-caption) { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 0.72em; line-height: 1.35; opacity: 0.72; }
  button { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; min-height: 36px; }
  @media (min-width: 640px) { button { min-width: 28px; min-height: 28px; } }

  .toolbar-scroll::-webkit-scrollbar { height: 3px; }
  .toolbar-scroll::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 2px; }
  .toolbar-scroll { scrollbar-width: thin; scrollbar-color: var(--border-subtle) transparent; }
</style>
