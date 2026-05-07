<script>
  import { onMount, onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Placeholder from '@tiptap/extension-placeholder';
  import Table from '@tiptap/extension-table';
  import TableRow from '@tiptap/extension-table-row';
  import TableCell from '@tiptap/extension-table-cell';
  import TableHeader from '@tiptap/extension-table-header';
  import { Markdown } from 'tiptap-markdown';
  import {
    Undo2, Redo2, Bold, Italic, Strikethrough, Code,
    Heading1, Heading2, Heading3, Heading4,
    List, ListOrdered, Quote, Code2, Minus, Link, Table2
  } from 'lucide-svelte';

  export let content = '';
  export let onUpdate = (md) => {};
  export let placeholder = 'Begin writing...';

  let editorEl;
  let editor;
  let canUndo = false;
  let canRedo = false;
  let active = { bold: false, italic: false, strike: false, code: false, heading: 0, bullet: false, ordered: false, quote: false, codeBlock: false };

  function createEditor() {
    if (editor) return;
    editor = new Editor({
      element: editorEl,
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
        Placeholder.configure({ placeholder }),
        Table.configure({ resizable: false }),
        TableRow,
        TableCell,
        TableHeader,
        Markdown.configure({ html: false, tightLists: true, bulletListMarker: '-', linkify: true, breaks: false, transformPastedText: true }),
      ],
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
      bullet: ed.isActive('bulletList'), ordered: ed.isActive('orderedList'),
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
      else if (method === 'link') { const url = prompt('URL:'); if (url) c.extendMarkRange('link').setLink({ href: url }).run(); }
      else if (method === 'image') { const url = prompt('Image URL:'); if (url) c.setImage({ src: url, alt: '' }).run(); }
      else if (method === 'table') c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      else c[method](attrs).run();
    };
  }

  export function getMarkdown() { return editor?.storage.markdown?.getMarkdown?.() || content; }
  export function setMarkdown(md) { if (editor) editor.commands.setContent(md || ''); }

  onMount(createEditor);
  onDestroy(() => editor?.destroy());
</script>

<div class="flex flex-col flex-1 min-h-0">
  <!-- Toolbar -->
  <div class="flex items-center gap-0.5 px-2 lg:px-3 py-1.5 lg:py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] overflow-x-auto toolbar-scroll" on:mousedown|preventDefault>
    <!-- Undo/Redo -->
    <button on:click={cmd('undo')} disabled={!canUndo} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition disabled:opacity-20" title="Undo (Ctrl+Z)"><Undo2 size="16"/></button>
    <button on:click={cmd('redo')} disabled={!canRedo} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition disabled:opacity-20" title="Redo (Ctrl+Shift+Z)"><Redo2 size="16"/></button>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <button on:click={cmd('toggleBold')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.bold ? 'bg-[var(--bg-secondary)]' : ''}" title="Bold (Ctrl+B)"><Bold size="16"/></button>
    <button on:click={cmd('toggleItalic')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.italic ? 'bg-[var(--bg-secondary)]' : ''}" title="Italic (Ctrl+I)"><Italic size="16"/></button>
    <button on:click={cmd('toggleStrike')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.strike ? 'bg-[var(--bg-secondary)]' : ''}" title="Strikethrough"><Strikethrough size="16"/></button>
    <button on:click={cmd('toggleCode')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.code ? 'bg-[var(--bg-secondary)]' : ''}" title="Inline Code (Ctrl+E)"><Code size="16"/></button>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <button on:click={cmd('toggleHeading', { level: 1 })} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.heading === 1 ? 'bg-[var(--bg-secondary)]' : ''}" title="Heading 1"><Heading1 size="16"/></button>
    <button on:click={cmd('toggleHeading', { level: 2 })} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.heading === 2 ? 'bg-[var(--bg-secondary)]' : ''}" title="Heading 2"><Heading2 size="16"/></button>
    <button on:click={cmd('toggleHeading', { level: 3 })} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.heading === 3 ? 'bg-[var(--bg-secondary)]' : ''}" title="Heading 3"><Heading3 size="16"/></button>
    <button on:click={cmd('toggleHeading', { level: 4 })} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.heading === 4 ? 'bg-[var(--bg-secondary)]' : ''}" title="Heading 4"><Heading4 size="16"/></button>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <button on:click={cmd('toggleBulletList')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.bullet ? 'bg-[var(--bg-secondary)]' : ''}" title="Bullet List"><List size="16"/></button>
    <button on:click={cmd('toggleOrderedList')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.ordered ? 'bg-[var(--bg-secondary)]' : ''}" title="Numbered List"><ListOrdered size="16"/></button>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <button on:click={cmd('toggleBlockquote')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.quote ? 'bg-[var(--bg-secondary)]' : ''}" title="Blockquote"><Quote size="16"/></button>
    <button on:click={cmd('toggleCodeBlock')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition {active.codeBlock ? 'bg-[var(--bg-secondary)]' : ''}" title="Code Block"><Code2 size="16"/></button>
    <button on:click={cmd('hr')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition" title="Horizontal Rule"><Minus size="16"/></button>
    <button on:click={cmd('table')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition" title="Insert Table"><Table2 size="16"/></button>
    <span class="w-px h-5 bg-[var(--border-subtle)] mx-1.5"></span>

    <button on:click={cmd('link')} class="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition" title="Add Link"><Link size="16"/></button>
  </div>

  <!-- Editor -->
  <div bind:this={editorEl}
    class="flex-1 overflow-y-auto overscroll-contain px-4 lg:px-12 py-4 lg:py-10 cursor-text touch-pan-y
      [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-full [&_.ProseMirror_p]:my-2 [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-[var(--text-secondary)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:opacity-30
      [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:my-4
      [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:my-3
      [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-bold [&_.ProseMirror_h3]:my-2
      [&_.ProseMirror_h4]:text-base [&_.ProseMirror_h4]:font-bold [&_.ProseMirror_h4]:my-1.5
      [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:ml-6 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:ml-6
      [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-[var(--text-primary)] [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:my-4
      [&_.ProseMirror_code]:bg-[var(--bg-secondary)] [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:text-sm [&_.ProseMirror_code]:font-mono
      [&_.ProseMirror_pre]:bg-[var(--bg-secondary)] [&_.ProseMirror_pre]:p-4 [&_.ProseMirror_pre]:rounded [&_.ProseMirror_pre]:my-4 [&_.ProseMirror_pre]:overflow-x-auto
      [&_.ProseMirror_hr]:border-[var(--border-subtle)] [&_.ProseMirror_hr]:my-6
      [&_.ProseMirror_a]:underline [&_.ProseMirror_s]:line-through
      [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:my-4 [&_.ProseMirror_table]:text-sm
      [&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-[var(--border-subtle)] [&_.ProseMirror_th]:px-3 [&_.ProseMirror_th]:py-2 [&_.ProseMirror_th]:text-left [&_.ProseMirror_th]:font-semibold [&_.ProseMirror_th]:bg-[var(--bg-secondary)]
      [&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-[var(--border-subtle)] [&_.ProseMirror_td]:px-3 [&_.ProseMirror_td]:py-2"
  ></div>
</div>

<style>
  :global(.ProseMirror p.is-editor-empty:first-child::before) { content: attr(data-placeholder); float: left; pointer-events: none; height: 0; color: var(--text-secondary); opacity: 0.3; }
  :global(.ProseMirror) { min-height: 100%; outline: none; }
  :global(.ProseMirror hr) { border: none; border-top: 1px solid var(--border-subtle); margin: 1.5rem 0; }
  button { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; min-height: 36px; }
  @media (min-width: 640px) { button { min-width: 28px; min-height: 28px; } }

  .toolbar-scroll::-webkit-scrollbar { height: 3px; }
  .toolbar-scroll::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 2px; }
  .toolbar-scroll { scrollbar-width: thin; scrollbar-color: var(--border-subtle) transparent; }
</style>
