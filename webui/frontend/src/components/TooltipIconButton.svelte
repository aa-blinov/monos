<script>
  import { tick } from 'svelte';

  export let label;
  export let tooltip = label;
  export let type = 'button';
  export let disabled = false;
  export let tooltipPosition = 'bottom';
  export let tooltipAlign = 'center';

  let className = '';
  export { className as class };

  // A label ("Trash") reads as a small capital tag; a sentence explaining something wraps inside the box
  // in ordinary case, or it runs past its own background.
  $: sentence = String(tooltip || '').length > 32;

  const TOOLTIP_GAP = 8;
  const VIEWPORT_MARGIN = 12;

  let buttonEl;
  let tooltipEl;
  let tooltipVisible = false;
  let tooltipStyle = '';

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function placeTooltip() {
    if (!buttonEl || !tooltipEl || typeof window === 'undefined') return;

    const anchorRect = buttonEl.getBoundingClientRect();
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

  // The pointer passing over a button on its way elsewhere should not set off a tooltip: it waits a moment.
  // Keyboard focus shows it at once — that is someone asking what the button is.
  const HOVER_DELAY = 450;
  let hoverTimer = null;

  async function reveal() {
    if (!tooltip) return;
    if (typeof window !== 'undefined' && window.innerWidth < 640) return;
    tooltipVisible = true;
    await tick();
    placeTooltip();
  }

  function showTooltip(event) {
    if (!tooltip) return;
    clearTimeout(hoverTimer);
    if (event?.type === 'focus' || event?.type === 'focusin') {
      void reveal();
      return;
    }
    hoverTimer = setTimeout(() => { void reveal(); }, HOVER_DELAY);
  }

  function hideTooltip() {
    clearTimeout(hoverTimer);
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
  <button
    bind:this={buttonEl}
    type={type}
    disabled={disabled}
    {...$$restProps}
    class="{className} inline-flex items-center justify-center"
    aria-label={label}
    on:mouseenter={showTooltip}
    on:mouseleave={hideTooltip}
    on:focus={showTooltip}
    on:blur={hideTooltip}
    on:click
    on:click={hideTooltip}
    on:pointerdown
    on:mousedown
    on:dblclick
    on:keydown
  >
    <slot />
  </button>

  {#if tooltipVisible}
    <span
      bind:this={tooltipEl}
      role="tooltip"
      class="pointer-events-none fixed z-[120] rounded-ui border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-[var(--text-primary)] shadow-lg shadow-black/10 {sentence ? 'w-max max-w-xs whitespace-normal text-xs font-normal normal-case tracking-normal leading-relaxed' : 'whitespace-nowrap text-[length:var(--text-whisper)] font-bold uppercase tracking-[0.14em]'}"
      style={tooltipStyle}
    >
      {tooltip}
    </span>
  {/if}
</span>
