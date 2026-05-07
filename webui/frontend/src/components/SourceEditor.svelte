<script>
  import { createEventDispatcher } from 'svelte';
  import { marked } from 'marked';
  import { syncScroll } from '../stores.js';

  const dispatch = createEventDispatcher();

  export let content = '';
  export let backlinks = [];

  let editorRef;
  let previewRef;
  let activePane = null;

  function renderMarkdown(md) {
    let html = md
      .replace(/\[\[(.*?)\]\]/g, (_, p1) => {
        const [target, label] = p1.split('|');
        const t = (label || target).trim();
        return `<button class="wikilink" data-target="${target.trim()}">${t}</button>`;
      });
    return marked.parse(html);
  }

  $: previewHtml = renderMarkdown(content || '');

  function handleEditorScroll() {
    if (!$syncScroll || activePane !== 'editor' || !editorRef || !previewRef) return;
    const pct = editorRef.scrollTop / (editorRef.scrollHeight - editorRef.clientHeight);
    previewRef.scrollTop = pct * (previewRef.scrollHeight - previewRef.clientHeight);
  }

  function handlePreviewScroll() {
    if (!$syncScroll || activePane !== 'preview' || !editorRef || !previewRef) return;
    const pct = previewRef.scrollTop / (previewRef.scrollHeight - previewRef.clientHeight);
    editorRef.scrollTop = pct * (editorRef.scrollHeight - editorRef.clientHeight);
  }

  function handlePreviewClick(e) {
    const target = e.target.closest('.wikilink');
    if (target) dispatch('wikiLinkClick', target.dataset.target);
  }
</script>

<div class="flex-1 flex overflow-hidden">
  <!-- Editor -->
  <div class="flex-1 flex flex-col min-w-0 border-r border-[var(--border-subtle)]">
    <textarea
      bind:this={editorRef}
      bind:value={content}
      on:scroll={handleEditorScroll}
      on:mouseenter={() => activePane = 'editor'}
      class="flex-1 px-4 lg:px-12 py-4 lg:py-10 bg-transparent font-mono text-xs lg:text-sm leading-relaxed resize-none focus:outline-none placeholder-[var(--text-secondary)]/30 overscroll-contain"
      placeholder="Begin writing..."
    />
  </div>

  <!-- Preview -->
  <div on:mouseenter={() => activePane = 'preview'} class="flex-1 flex-col min-w-0 bg-[var(--bg-primary)] hidden sm:flex">
    <div bind:this={previewRef} on:scroll={handlePreviewScroll} on:click={handlePreviewClick} class="flex-1 overflow-y-auto px-6 lg:px-12 py-8 lg:py-12">
      <div class="max-w-2xl mx-auto prose-preview">
        {@html previewHtml}
        {#if backlinks.length > 0}
          <div class="mt-20 pt-12 border-t border-[var(--border-subtle)]">
            <h3 class="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--text-secondary)] mb-8">Linked Mentions</h3>
            <div class="grid grid-cols-1 gap-8">
              {#each backlinks as link}
                <button class="text-left group">
                  <div class="text-lg font-serif group-hover:underline decoration-[var(--border-subtle)]">{link.name}</div>
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
  textarea { scrollbar-width: none; }
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
  :global(.prose-preview a) { text-decoration: underline; text-underline-offset: 0.25rem; text-decoration-color: var(--text-secondary); }
  :global(.prose-preview a:hover) { text-decoration-color: var(--text-primary); }
</style>
