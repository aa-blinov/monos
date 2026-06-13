<script>
  import { tick } from 'svelte';

  export let label;
  export let tooltip = label;
  export let options = [];
  export let value = '';
  export let tooltipPosition = 'bottom';
  export let tooltipAlign = 'center';

  let className = '';
  export { className as class };

  const TOOLTIP_GAP = 8;
  const VIEWPORT_MARGIN = 12;

  let anchorEl;
  let tooltipEl;
  let tooltipVisible = false;
  let tooltipStyle = '';

  function clamp(current, min, max) {
    return Math.min(max, Math.max(min, current));
  }

  function placeTooltip() {
    if (!anchorEl || !tooltipEl || typeof window === 'undefined') return;

    const anchorRect = anchorEl.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN);
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN);

    let left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
    if (tooltipAlign === 'start') left = anchorRect.left;
    if (tooltipAlign === 'end') left = anchorRect.right - tooltipRect.width;

    let top = tooltipPosition === 'top'
      ? anchorRect.top - tooltipRect.height - TOOLTIP_GAP
      : anchorRect.bottom + TOOLTIP_GAP;

    if (top < VIEWPORT_MARGIN) top = anchorRect.bottom + TOOLTIP_GAP;
    if (top > maxTop) top = anchorRect.top - tooltipRect.height - TOOLTIP_GAP;

    tooltipStyle = `left: ${Math.round(clamp(left, VIEWPORT_MARGIN, maxLeft))}px; top: ${Math.round(clamp(top, VIEWPORT_MARGIN, maxTop))}px;`;
  }

  async function showTooltip() {
    if (!tooltip) return;
    if (typeof window !== 'undefined' && window.innerWidth < 640) return;
    tooltipVisible = true;
    await tick();
    placeTooltip();
  }

  function hideTooltip() {
    tooltipVisible = false;
  }
</script>

<span
  class="inline-flex"
  role="presentation"
  on:mouseenter={showTooltip}
  on:mouseleave={hideTooltip}
  on:focusin={showTooltip}
  on:focusout={hideTooltip}
>
  <label
    bind:this={anchorEl}
    class={className}
  >
    <slot />
    <select
      aria-label={label}
      bind:value
      class="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 outline-none"
      on:pointerdown|stopPropagation
      on:mousedown|stopPropagation
      on:click|stopPropagation
    >
      {#each options as option}
        <option value={option.value}>{option.name}</option>
      {/each}
    </select>
  </label>

  {#if tooltipVisible}
    <span
      bind:this={tooltipEl}
      role="tooltip"
      class="pointer-events-none fixed z-[120] max-w-xs whitespace-nowrap rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-primary)] shadow-lg shadow-black/10"
      style={tooltipStyle}
    >
      {tooltip}
    </span>
  {/if}
</span>
