<script>
  import { extractOutline, withOccurrences } from '../lib/outline.js';
  import { scrollBehavior } from '../lib/motion.js';
  import { localizedText } from '../lib/strings.js';
  import { createEventDispatcher, tick } from 'svelte';
  import { X } from 'lucide-svelte';

  /** The markdown source to extract the outline from. */
  export let content = '';
  /** Maximum heading level to show (1-6). Default 3 (h1-h3). */
  export let maxLevel = 3;
  /**
   * Below the lg breakpoint there is no room beside the note: the panel opens
   * as an overlay over it. From lg up it is a plain column and ignores this.
   */
  export let open = false;
  /** Desktop only: the editor has folded the column into a rail. */
  export let collapsed = false;

  const dispatch = createEventDispatcher();

  let closeButton;
  let openerEl = null;
  let wasOpen = false;

  // Номер повтора считаем по всем заголовкам, а не по видимым: редактор ищет
  // заголовок по тексту во всём документе, и порядок должен совпадать.
  $: allItems = withOccurrences(extractOutline(content));
  $: items = allItems.filter((it) => it.level <= maxLevel);

  // Фокус уходит в оверлей при открытии и возвращается на кнопку, которая его
  // открыла, при закрытии, иначе фокус потерялся бы под затемнением.
  $: if (open !== wasOpen) {
    wasOpen = open;
    if (open) {
      openerEl = document.activeElement;
      tick().then(() => closeButton?.focus());
    } else {
      openerEl?.focus?.();
      openerEl = null;
    }
  }

  function close() {
    dispatch('close');
  }

  function onKeydown(event) {
    if (open && event.key === 'Escape') close();
  }

  function clickAnchor(event, item) {
    // Заголовки в ProseMirror без id, поэтому getElementById почти всегда
    // пуст. Родитель умеет прокручивать по тексту заголовка — значит, текст
    // обязан уйти вместе с якорем, иначе цепочка обрывается молча.
    const target = document.getElementById(item.anchor);
    if (target) {
      event.preventDefault();
      target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      history.replaceState(null, '', `#${item.anchor}`);
    } else {
      dispatch('navigate', { anchor: item.anchor, text: item.text, occurrence: item.occurrence });
    }
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
  <button
    type="button"
    tabindex="-1"
    aria-label={$localizedText.editor.closeOutline}
    class="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden"
    on:click={close}
  ></button>
{/if}

<aside
  class="{open ? 'fixed inset-y-0 right-0 z-40 block w-64 max-w-[85vw] overflow-y-auto shadow-2xl' : 'hidden w-56'} {collapsed ? 'lg:hidden' : 'lg:block'} shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-6 text-xs lg:static lg:z-auto lg:w-56 lg:max-w-none lg:overflow-visible lg:shadow-none"
  data-testid="outline-panel"
>
  <div class="mb-3 flex items-center justify-between gap-2">
    <h3 class="text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
      {$localizedText.editor.outline}
    </h3>
    <button
      type="button"
      bind:this={closeButton}
      aria-label={$localizedText.editor.closeOutline}
      class="-my-2 -mr-2 inline-flex h-11 w-11 items-center justify-center text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] lg:hidden"
      on:click={close}
    >
      <X class="h-4 w-4" strokeWidth="1.7" aria-hidden="true" />
    </button>
  </div>
  {#if items.length === 0}
    <p class="text-[var(--text-tertiary)]">
      {$localizedText.editor.outlineEmpty}
    </p>
  {:else}
    <ol class="space-y-1 lg:space-y-1.5">
      {#each items as item (item.anchor)}
        <li
          class="truncate leading-snug text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          style="padding-left: {(item.level - 1) * 12}px"
        >
          <a
            href="#{item.anchor}"
            on:click={(e) => clickAnchor(e, item)}
            class="block truncate py-3 lg:py-1"
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
