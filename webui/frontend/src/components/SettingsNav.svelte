<script>
  /**
   * (The strip reaches up over the page's own padding, or text would show in the gap above it.)
   * The way round a long Settings page: one button per part, the part in view marked. A strip above the page
   * on a narrow window, a column beside it on a wide one; both stay in sight while the page scrolls.
   */
  import { createEventDispatcher, tick } from 'svelte';
  import { Button } from '@monos/ui';
  import { localizedText } from '../lib/strings.js';

  /** @type {Array<{ id: string, label: string }>} */
  export let items = [];
  export let active = '';

  const dispatch = createEventDispatcher();
  let strip;
  // In the strip of a narrow window the marked part is kept in sight: it must not slip out of view at either end.
  $: if (strip && active) {
    Promise.resolve().then(() => {
      const mark = strip?.querySelector('[aria-current="true"]');
      if (mark && strip.scrollWidth > strip.clientWidth) {
        const left = mark.offsetLeft - 16;
        const right = mark.offsetLeft + mark.offsetWidth + 16;
        if (left < strip.scrollLeft) strip.scrollLeft = left;
        else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
      }
    });
  }
</script>

<nav
  aria-label={$localizedText.settings.navLabel}
  data-testid="settings-nav"
  bind:this={strip}
  class="sticky -top-4 z-10 -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 pb-2 pt-6 sm:-top-6 sm:pt-8 lg:top-8 lg:mx-0 lg:mb-0 lg:flex-col lg:self-start lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0"
>
  {#each items as item (item.id)}
    <Button variant="ghost" size="sm"
      type="button"
      aria-current={active === item.id ? 'true' : undefined}
      on:click={() => dispatch('go', item.id)}
      class="shrink-0 rounded-ui px-3 py-1.5 text-left text-xs uppercase tracking-[0.12em] transition {active === item.id ? 'bg-[var(--bg-secondary)] font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)] hover:text-[var(--text-primary)]'}"
    >{item.label}</Button>
  {/each}
</nav>
