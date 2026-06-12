<script>
  import { onDestroy, onMount, tick } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { marked } from 'marked';
  import TooltipIconButton from './TooltipIconButton.svelte';
  import {
    displayImageSrc,
    firstImageFileFromDataTransfer,
    markdownImage,
    resolveMarkdownImagePath,
  } from '../lib/attachments.js';
  import { localizedText } from '../lib/strings.js';

  const dispatch = createEventDispatcher();

  const SOURCE_SPLIT_WIDTH_KEY = 'sourceEditorContentWidth';
  const DEFAULT_EDITOR_PERCENT = 50;
  const FALLBACK_MIN_PERCENT = 35;
  const FALLBACK_MAX_PERCENT = 65;
  const MIN_PANE_WIDTH = 360;
  const RESIZER_WIDTH = 12;
  const DESKTOP_BREAKPOINT = 1024;
  const KEYBOARD_STEP = 2;

  export let content = '';
  export let backlinks = [];
  export let notePath = '';
  export let onImageFile = null;

  let editorRef;
  let previewRef;
  let sourceShellRef;
  let activePane = null;
  let isDesktop = typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT;
  let sourceShellWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
  let editorPercent = getInitialEditorPercent();
  let isResizingContent = false;
  let isImageDragging = false;
  let resizeObserver;

  const allowedTags = new Set([
    'A', 'B', 'BLOCKQUOTE', 'BR', 'BUTTON', 'CODE', 'DEL', 'EM', 'H1', 'H2',
    'H3', 'H4', 'H5', 'H6', 'HR', 'I', 'LI', 'OL', 'P', 'PRE', 'S', 'STRONG',
    'IMG', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL',
  ]);
  const dropWithChildrenTags = new Set(['IFRAME', 'OBJECT', 'SCRIPT', 'STYLE']);

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isSafeHref(value) {
    const href = String(value || '').trim();
    return /^(https?:|mailto:|tel:|#|\/(?!\/)|\.{0,2}\/)/i.test(href);
  }

  function sanitizeHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html;

    for (const node of [...template.content.querySelectorAll('*')]) {
      if (dropWithChildrenTags.has(node.tagName)) {
        node.remove();
        continue;
      }

      if (!allowedTags.has(node.tagName)) {
        node.replaceWith(...node.childNodes);
        continue;
      }

      for (const attr of [...node.attributes]) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || name === 'style') {
          node.removeAttribute(attr.name);
          continue;
        }

        const isWikiButton = node.tagName === 'BUTTON'
          && (name === 'class' || name === 'data-target' || name === 'type');
        const isLinkAttr = node.tagName === 'A'
          && (name === 'href' || name === 'title' || name === 'target' || name === 'rel');
        const isImageAttr = node.tagName === 'IMG'
          && (name === 'src' || name === 'alt' || name === 'title' || name === 'loading' || name === 'data-attachment-path' || name === 'class');
        const isTableAttr = ['TH', 'TD'].includes(node.tagName)
          && (name === 'align' || name === 'colspan' || name === 'rowspan');

        if (!isWikiButton && !isLinkAttr && !isImageAttr && !isTableAttr) {
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

      if (node.tagName === 'BUTTON') {
        node.setAttribute('type', 'button');
      }

      if (node.tagName === 'IMG') {
        const originalSrc = node.getAttribute('src') || '';
        const attachmentPath = resolveMarkdownImagePath(notePath, originalSrc);
        const displaySrc = displayImageSrc(notePath, originalSrc);
        if (!displaySrc) {
          node.remove();
          continue;
        }
        node.setAttribute('src', displaySrc);
        node.setAttribute('loading', 'lazy');
        node.setAttribute('class', 'attachment-image');
        if (attachmentPath?.startsWith('notes/')) {
          node.setAttribute('data-attachment-path', attachmentPath);
        }
      }
    }

    return template.innerHTML;
  }

  function stripFrontmatter(md) {
    return String(md || '').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  }

  function renderMarkdown(md) {
    const html = stripFrontmatter(md)
      .replace(/\[\[(.*?)\]\]/g, (_, p1) => {
        const [target, label] = p1.split('|');
        const linkTarget = target.trim();
        const text = (label || target).trim();
        return `<button type="button" class="wikilink" data-target="${escapeHtml(linkTarget)}">${escapeHtml(text)}</button>`;
      });
    return sanitizeHtml(marked.parse(html));
  }

  $: previewHtml = renderMarkdown(content || '');
  $: canResizeContent = canResizeForCurrentMetrics();
  $: editorPaneStyle = canResizeContent ? `flex: 0 0 ${editorPercent}%;` : '';

  function canResizeForCurrentMetrics() {
    return isDesktop && sourceShellWidth >= MIN_PANE_WIDTH * 2 + RESIZER_WIDTH;
  }

  function getInitialEditorPercent() {
    if (typeof localStorage === 'undefined') return DEFAULT_EDITOR_PERCENT;
    return clampEditorPercent(localStorage.getItem(SOURCE_SPLIT_WIDTH_KEY));
  }

  function minEditorPercent() {
    if (!sourceShellWidth) return FALLBACK_MIN_PERCENT;
    return Math.ceil((MIN_PANE_WIDTH / sourceShellWidth) * 100);
  }

  function maxEditorPercent() {
    if (!sourceShellWidth) return FALLBACK_MAX_PERCENT;
    return Math.floor(((sourceShellWidth - RESIZER_WIDTH - MIN_PANE_WIDTH) / sourceShellWidth) * 100);
  }

  function clampEditorPercent(value) {
    const numericValue = Number(value) || DEFAULT_EDITOR_PERCENT;
    const canResize = canResizeForCurrentMetrics();
    const min = canResize ? minEditorPercent() : FALLBACK_MIN_PERCENT;
    const max = canResize ? maxEditorPercent() : FALLBACK_MAX_PERCENT;
    if (max < min) return DEFAULT_EDITOR_PERCENT;
    return Math.min(max, Math.max(min, numericValue));
  }

  function saveEditorPercent(value) {
    localStorage.setItem(SOURCE_SPLIT_WIDTH_KEY, String(Math.round(value)));
  }

  function updateSourceShellMetrics() {
    if (typeof window === 'undefined') return;
    isDesktop = window.innerWidth >= DESKTOP_BREAKPOINT;
    const measuredWidth = sourceShellRef?.clientWidth || sourceShellRef?.getBoundingClientRect().width || 0;
    sourceShellWidth = measuredWidth || sourceShellWidth;
    editorPercent = clampEditorPercent(editorPercent);
  }

  function handleContentResize(event) {
    if (!sourceShellRef) return;
    const rect = sourceShellRef.getBoundingClientRect();
    if (!rect.width) return;
    editorPercent = clampEditorPercent(((event.clientX - rect.left) / rect.width) * 100);
  }

  function stopContentResize() {
    if (!isResizingContent) return;
    isResizingContent = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    saveEditorPercent(editorPercent);
    window.removeEventListener('pointermove', handleContentResize);
    window.removeEventListener('pointerup', stopContentResize);
    window.removeEventListener('mousemove', handleContentResize);
    window.removeEventListener('mouseup', stopContentResize);
  }

  function startContentResize(event) {
    if (!canResizeContent || isResizingContent) return;
    event.preventDefault();
    isResizingContent = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handleContentResize);
    window.addEventListener('pointerup', stopContentResize);
    window.addEventListener('mousemove', handleContentResize);
    window.addEventListener('mouseup', stopContentResize);
  }

  function setEditorPercent(value) {
    editorPercent = clampEditorPercent(value);
    saveEditorPercent(editorPercent);
  }

  function resetEditorPercent() {
    setEditorPercent(DEFAULT_EDITOR_PERCENT);
  }

  function handleResizeKeydown(event) {
    if (!canResizeContent) return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setEditorPercent(editorPercent - KEYBOARD_STEP);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setEditorPercent(editorPercent + KEYBOARD_STEP);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setEditorPercent(minEditorPercent());
    } else if (event.key === 'End') {
      event.preventDefault();
      setEditorPercent(maxEditorPercent());
    } else if (event.key === 'Enter') {
      event.preventDefault();
      resetEditorPercent();
    }
  }

  function handleEditorScroll() {
    if (activePane !== 'editor' || !editorRef || !previewRef) return;
    const pct = editorRef.scrollTop / (editorRef.scrollHeight - editorRef.clientHeight);
    previewRef.scrollTop = pct * (previewRef.scrollHeight - previewRef.clientHeight);
  }

  function handlePreviewScroll() {
    if (activePane !== 'preview' || !editorRef || !previewRef) return;
    const pct = previewRef.scrollTop / (previewRef.scrollHeight - previewRef.clientHeight);
    editorRef.scrollTop = pct * (editorRef.scrollHeight - editorRef.clientHeight);
  }

  function handlePreviewClick(e) {
    const target = e.target.closest('.wikilink');
    if (target) {
      dispatch('wikiLinkClick', target.dataset.target);
      return;
    }

    const image = e.target.closest('img[data-attachment-path]');
    if (image) {
      dispatch('imageClick', {
        path: image.dataset.attachmentPath,
        src: image.getAttribute('src'),
        alt: image.getAttribute('alt') || '',
      });
    }
  }

  function insertTextAtCursor(text) {
    const start = editorRef?.selectionStart ?? content.length;
    const end = editorRef?.selectionEnd ?? start;
    content = `${content.slice(0, start)}${text}${content.slice(end)}`;
    tick().then(() => {
      editorRef?.focus();
      const nextPosition = start + text.length;
      editorRef?.setSelectionRange(nextPosition, nextPosition);
    });
  }

  async function insertImageFile(file) {
    if (!file || !onImageFile) return false;
    const image = await onImageFile(file);
    if (!image?.relativePath) return false;
    const separator = content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n';
    insertTextAtCursor(`${separator}${markdownImage(image.name, image.relativePath)}\n`);
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

  onMount(async () => {
    await tick();
    updateSourceShellMetrics();
    window.addEventListener('resize', updateSourceShellMetrics);
    if (typeof ResizeObserver !== 'undefined' && sourceShellRef) {
      resizeObserver = new ResizeObserver(updateSourceShellMetrics);
      resizeObserver.observe(sourceShellRef);
    }
  });

  onDestroy(() => {
    stopContentResize();
    window.removeEventListener('resize', updateSourceShellMetrics);
    resizeObserver?.disconnect();
  });
</script>

<div bind:this={sourceShellRef} class="flex-1 flex overflow-hidden" data-testid="source-editor-shell">
  <!-- Editor -->
  <div
    class="flex-1 flex flex-col min-w-0 border-r border-[var(--border-subtle)] pt-3 lg:pt-6 {isResizingContent ? '' : 'transition-[flex-basis] duration-200 ease-out'}"
    style={editorPaneStyle}
    data-testid="source-editor-pane"
  >
    <textarea
      bind:this={editorRef}
      bind:value={content}
      on:scroll={handleEditorScroll}
      on:mouseenter={() => activePane = 'editor'}
      on:paste={handlePaste}
      on:dragover={handleDragOver}
      on:dragleave={() => isImageDragging = false}
      on:drop={handleDrop}
      class="flex-1 px-4 lg:px-12 pb-3 lg:pb-6 bg-transparent font-mono text-xs lg:text-sm leading-relaxed resize-none focus:outline-none placeholder-[var(--text-secondary)]/30 overscroll-contain {isImageDragging ? 'ring-1 ring-inset ring-[var(--text-secondary)]/35' : ''}"
      placeholder={$localizedText.sourceEditor.beginWriting}
    />
  </div>

  {#if canResizeContent}
    <TooltipIconButton
      type="button"
      label={$localizedText.sourceEditor.resizeContent}
      tooltip={$localizedText.sourceEditor.resizeContent}
      class="relative z-10 hidden w-3 shrink-0 cursor-col-resize touch-none border-0 bg-transparent p-0 outline-none group lg:block"
      on:pointerdown={startContentResize}
      on:mousedown={startContentResize}
      on:dblclick={resetEditorPercent}
      on:keydown={handleResizeKeydown}
    >
      <span class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition group-hover:bg-[var(--text-secondary)]/35 group-focus:bg-[var(--text-secondary)]/45"></span>
    </TooltipIconButton>
  {/if}

  <!-- Preview -->
  <div on:mouseenter={() => activePane = 'preview'} class="flex-1 flex-col min-w-0 bg-[var(--bg-primary)] hidden sm:flex" role="presentation">
    <div bind:this={previewRef} on:scroll={handlePreviewScroll} on:click={handlePreviewClick} class="flex-1 overflow-y-auto px-6 lg:px-12 pt-3 lg:pt-6 pb-6 lg:pb-8" role="presentation">
      <div class="max-w-[var(--content-width,56rem)] mx-auto prose-preview">
        {@html previewHtml}
        {#if backlinks.length > 0}
          <div class="mt-20 pt-12 border-t border-[var(--border-subtle)]">
            <h3 class="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)] mb-8">{$localizedText.sourceEditor.linkedMentions}</h3>
            <div class="grid grid-cols-1 gap-8">
              {#each backlinks as link}
                <button class="text-left group" on:click={() => dispatch('wikiLinkClick', link.name)}>
                  <div class="flex items-center gap-3">
                    <span class="text-lg font-serif group-hover:underline decoration-[var(--border-subtle)]">{link.name}</span>
                    <span class="text-[9px] uppercase tracking-widest text-[var(--text-secondary)]/60">
                      {link.type === 'mention' ? $localizedText.sourceEditor.mention : $localizedText.sourceEditor.backlink}
                    </span>
                  </div>
                  <div class="text-[9px] uppercase tracking-widest text-[var(--text-secondary)] mt-1 opacity-50">{link.path?.startsWith('notes/') ? link.path.slice(6) : link.path}</div>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  textarea { --editor-caret: color-mix(in srgb, var(--text-primary) 82%, var(--yellow) 18%); scrollbar-width: none; caret-color: var(--editor-caret); }
  textarea::selection { background: color-mix(in srgb, var(--editor-caret) 18%, transparent); color: var(--text-primary); }
  textarea::-webkit-scrollbar { display: none; }
  :global(.wikilink) { cursor: pointer; background: none; border: none; padding: 0; font: inherit; color: inherit; }
  :global(.wikilink:hover) { text-decoration: underline; }
  :global(.prose-preview) { line-height: 1.725; font-size: 0.875rem; }
  :global(.prose-preview h1) { font-size: 1.25rem; font-weight: 700; margin-bottom: 1.5rem; }
  :global(.prose-preview h2) { font-size: 1.125rem; font-weight: 700; margin-top: 2rem; margin-bottom: 1rem; }
  :global(.prose-preview h3) { font-size: 1rem; font-weight: 700; margin-top: 1.5rem; margin-bottom: 0.75rem; }
  :global(.prose-preview p) { margin-bottom: 1rem; }
  :global(.prose-preview ul) { list-style-type: disc; margin-left: 1.5rem; margin-bottom: 1rem; }
  :global(.prose-preview ol) { list-style-type: decimal; margin-left: 1.5rem; margin-bottom: 1rem; }
  :global(.prose-preview li) { margin-bottom: 0.25rem; }
  :global(.prose-preview blockquote) { border-left: 2px solid var(--text-primary); padding-left: 1.5rem; font-style: italic; margin: 1.5rem 0; color: var(--text-secondary); }
  :global(.prose-preview pre) { background: var(--bg-secondary); padding: 1rem; border-radius: 0; margin-bottom: 1rem; overflow-x: auto; font-size: 0.75rem; line-height: 1.625; font-family: monospace; }
  :global(.prose-preview code) { background: var(--bg-secondary); padding: 0.125rem 0.375rem; border-radius: 0; font-size: 0.75rem; font-family: monospace; }
  :global(.prose-preview pre code) { background: none; padding: 0; font-size: inherit; }
  :global(.prose-preview table) { width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 0.8125rem; }
  :global(.prose-preview th) { border-bottom: 1px solid var(--border-subtle); padding: 0.5rem 0.75rem; text-align: left; font-weight: 600; text-transform: uppercase; font-size: 0.6875rem; letter-spacing: 0.05em; color: var(--text-secondary); }
  :global(.prose-preview td) { border-bottom: 1px solid var(--border-subtle); padding: 0.5rem 0.75rem; }
  :global(.prose-preview hr) { border: none; border-top: 1px solid var(--border-subtle); margin: 2rem 0; }
  :global(.prose-preview strong) { font-weight: 600; }
  :global(.prose-preview em) { font-style: italic; }
  :global(.prose-preview img.attachment-image) { max-width: 100%; height: auto; margin: 1.25rem 0; border-radius: 0.75rem; border: 1px solid var(--border-subtle); cursor: pointer; }
  :global(.prose-preview img.attachment-image:hover) { opacity: 0.9; }
  :global(.prose-preview a) { text-decoration: underline; text-underline-offset: 0.25rem; text-decoration-color: var(--text-secondary); }
  :global(.prose-preview a:hover) { text-decoration-color: var(--text-primary); }
</style>
