<script>
  import { extractOutline, withOccurrences, clampOutlineWidth, OUTLINE_WIDTH } from '../lib/outline.js';
  import { outlineWidth } from '../stores.js';
  import { scrollBehavior } from '../lib/motion.js';
  import { localizedText } from '../lib/strings.js';
  import { createEventDispatcher, onDestroy, tick } from 'svelte';
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

  // Desktop column: its left edge is a handle. Dragging left widens the column, double click restores the
  // default, arrows nudge it by 16px.
  let resizing = false;
  let stopDrag = null;
  onDestroy(() => stopDrag?.());
  function startResize(event) {
    if (event.button > 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = $outlineWidth;
    resizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const move = (e) => outlineWidth.set(clampOutlineWidth(startWidth + startX - e.clientX));
    const stop = () => {
      stopDrag = null;
      resizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    stopDrag = stop;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }
  function resizeKeydown(event) {
    const step = event.key === 'ArrowLeft' ? 16 : event.key === 'ArrowRight' ? -16 : 0;
    if (!step) return;
    event.preventDefault();
    outlineWidth.set(clampOutlineWidth($outlineWidth + step));
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
  class="{open ? 'fixed inset-y-0 right-0 z-40 block w-64 max-w-[85vw] overflow-y-auto shadow-2xl' : 'hidden w-56'} {collapsed ? 'lg:hidden' : 'lg:block'} shrink-0 border-l border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-6 text-xs lg:relative lg:z-auto lg:w-[var(--outline-width)] lg:max-w-none lg:overflow-visible lg:shadow-none"
  style="--outline-width: min({$outlineWidth}px, 45vw)"
  data-testid="outline-panel"
>
  <button
    type="button"
    aria-label={$localizedText.editor.resizeOutline}
    title={$localizedText.editor.resizeOutline}
    data-testid="outline-resize"
    class="group absolute inset-y-0 -left-1.5 z-10 hidden w-3 cursor-col-resize touch-none border-0 bg-transparent p-0 outline-none lg:block"
    on:pointerdown={startResize}
    on:dblclick={() => outlineWidth.set(OUTLINE_WIDTH.DEFAULT)}
    on:keydown={resizeKeydown}
  >
    <span class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition group-hover:bg-[color-mix(in_srgb,var(--text-secondary)_30%,transparent)] group-focus:bg-[color-mix(in_srgb,var(--text-secondary)_40%,transparent)] {resizing ? 'bg-[color-mix(in_srgb,var(--text-secondary)_40%,transparent)]' : ''}"></span>
  </button>
  <div class="mb-3 flex items-center justify-between gap-2">
    <h3 class="text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
      {$localizedText.editor.outline}
    </h3>
    <!-- The close button is for the phone, where the panel covers the note: on a wide window the column
         is closed from the note's header, where the button that opened it stands. -->
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
    <ol class="space-y-1 lg:space-y-0">
      {#each items as item (item.anchor)}
        <li
          class="truncate leading-snug text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          style="padding-left: {(item.level - 1) * 12}px"
        >
          <a
            href="#{item.anchor}"
            on:click={(e) => clickAnchor(e, item)}
            class="flex min-h-11 items-center lg:min-h-7"
            data-testid="outline-item"
            data-anchor={item.anchor}
          >
            <!-- The ellipsis needs a block-level text box: it does not work on a flex container itself. -->
            <span class="block min-w-0 truncate">{item.text}</span>
          </a>
        </li>
      {/each}
    </ol>
  {/if}
</aside>
