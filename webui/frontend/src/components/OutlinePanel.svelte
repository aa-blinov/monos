<script>
  import { extractOutline } from '../lib/outline.js';
  import { localizedText } from '../lib/strings.js';
  import { createEventDispatcher } from 'svelte';

  /** The markdown source to extract the outline from. */
  export let content = '';
  /** Maximum heading level to show (1-6). Default 3 (h1-h3). */
  export let maxLevel = 3;

  const dispatch = createEventDispatcher();

  $: items = extractOutline(content).filter((it) => it.level <= maxLevel);

  function clickAnchor(event, item) {
    // Заголовки в ProseMirror без id, поэтому getElementById почти всегда
    // пуст. Родитель умеет прокручивать по тексту заголовка — значит, текст
    // обязан уйти вместе с якорем, иначе цепочка обрывается молча.
    const target = document.getElementById(item.anchor);
    if (target) {
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', `#${item.anchor}`);
    } else {
      dispatch('navigate', { anchor: item.anchor, text: item.text });
    }
  }
</script>

<aside
  class="w-56 shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-6 text-xs"
  data-testid="outline-panel"
>
  <h3 class="mb-3 text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
    {$localizedText.editor.outline}
  </h3>
  {#if items.length === 0}
    <p class="text-[var(--text-tertiary)]">
      {$localizedText.editor.outlineEmpty}
    </p>
  {:else}
    <ol class="space-y-1.5">
      {#each items as item (item.anchor)}
        <li
          class="truncate leading-snug text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          style="padding-left: {(item.level - 1) * 12}px"
        >
          <a
            href="#{item.anchor}"
            on:click={(e) => clickAnchor(e, item)}
            class="block truncate"
            data-testid="outline-item"
            data-anchor={item.anchor}
          >
            {item.text}
          </a>
        </li>
      {/each}
    </ol>
  {/if}
</aside>
