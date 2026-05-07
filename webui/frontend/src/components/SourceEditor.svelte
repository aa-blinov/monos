<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let content = '';
  export let backlinks = [];

  let editorRef;
  let previewRef;
  let activePane = null;
  let isSyncScrollEnabled = true;

  function handleEditorScroll() {
    if (!isSyncScrollEnabled || activePane !== 'editor' || !editorRef || !previewRef) return;
    const pct = editorRef.scrollTop / (editorRef.scrollHeight - editorRef.clientHeight);
    previewRef.scrollTop = pct * (previewRef.scrollHeight - previewRef.clientHeight);
  }

  function handlePreviewScroll() {
    if (!isSyncScrollEnabled || activePane !== 'preview' || !editorRef || !previewRef) return;
    const pct = previewRef.scrollTop / (previewRef.scrollHeight - previewRef.clientHeight);
    editorRef.scrollTop = pct * (editorRef.scrollHeight - editorRef.clientHeight);
  }

  function handlePreviewClick(e) {
    const target = e.target.closest('.wikilink');
    if (target) dispatch('wikiLinkClick', target.dataset.target);
  }
</script>

<div class="flex-1 flex overflow-hidden border-t border-[var(--border-subtle)]">
  <!-- Editor -->
  <div class="flex-1 flex flex-col min-w-0 border-r border-[var(--border-subtle)]">
    <div class="hidden sm:flex px-12 py-4 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]">
      <label class="flex items-center gap-2 cursor-pointer group">
        <input type="checkbox" bind:checked={isSyncScrollEnabled} class="hidden" />
        <div class="w-2 h-2 rounded-full transition-colors {isSyncScrollEnabled ? 'bg-[var(--text-primary)]' : 'bg-transparent border border-[var(--text-secondary)]'} group-hover:opacity-70"></div>
        <span class="text-[10px] uppercase tracking-[0.15em] font-bold {isSyncScrollEnabled ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] opacity-50'}">Sync Scroll</span>
      </label>
      <span class="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] tabular-nums">
        {(content || '').trim() ? (content || '').trim().split(/\s+/).length : 0} words · {(content || '').length} chars
      </span>
    </div>
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
  <div     on:mouseenter={() => activePane = 'preview'} class="flex-1 flex-col min-w-0 bg-[var(--bg-primary)] hidden sm:flex">
    <div class="hidden lg:flex px-12 py-4 items-center border-b border-[var(--border-subtle)]">
      <span class="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] font-medium">Reader</span>
    </div>
    <div bind:this={previewRef} on:scroll={handlePreviewScroll} on:click={handlePreviewClick} class="flex-1 overflow-y-auto px-6 lg:px-12 py-8 lg:py-12 prose-typography">
      <div class="max-w-2xl mx-auto">
        {#each (content || '').split('\n\n') as paragraph}
          {#if paragraph.startsWith('# ')}
            <h1 class="text-xl font-bold mb-6">{paragraph.replace(/^#\s+/, '')}</h1>
          {:else if paragraph.startsWith('## ')}
            <h2 class="text-lg font-bold mt-8 mb-4">{paragraph.replace(/^##\s+/, '')}</h2>
          {:else if paragraph.startsWith('### ')}
            <h3 class="text-base font-bold mt-6 mb-3">{paragraph.replace(/^###\s+/, '')}</h3>
          {:else if paragraph.startsWith('- ')}
            <ul class="list-disc ml-6 space-y-1 mb-4">
              {#each paragraph.split('\n') as item}
                {#if item.startsWith('- ')}
                  <li class="text-sm leading-relaxed">{item.replace(/^-\s+/, '')}</li>
                {/if}
              {/each}
            </ul>
          {:else if paragraph.startsWith('> ')}
            <blockquote class="border-l-2 border-[var(--text-primary)] pl-6 italic my-6 text-sm text-[var(--text-secondary)]">{paragraph.replace(/^>\s+/, '')}</blockquote>
          {:else if paragraph.trim()}
            <p class="text-sm leading-relaxed mb-4">
              {@html paragraph
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\`(.*?)\`/g, '<code class="bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded font-mono text-xs">$1</code>')
                .replace(/\[\[(.*?)\]\]/g, (_, p1) => { const [t, l] = p1.split('|'); return `<button class="wikilink underline underline-offset-4 decoration-[var(--border-subtle)] hover:decoration-[var(--text-primary)] transition-colors" data-target="${t.trim()}">${(l || t).trim()}</button>`; })
                .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="underline underline-offset-4 decoration-[var(--text-secondary)] hover:decoration-[var(--text-primary)]">$1</a>')}
            </p>
          {/if}
        {/each}

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
</style>
