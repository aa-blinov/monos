<script>
  import { tick } from 'svelte';
  import { HOVER_DELAY, placeTooltip, tooltipClass } from '../lib/tooltip.js';

  export let label;
  export let tooltip = label;
  export let type = 'button';
  export let disabled = false;
  export let tooltipPosition = 'bottom';
  export let tooltipAlign = 'center';

  let className = '';
  export { className as class };

  // The node itself, for a parent that has to hand the focus back when its panel closes.
  export let buttonEl = null;

  $: tooltipClassName = tooltipClass(tooltip);

  let tooltipEl;
  let tooltipVisible = false;
  let tooltipStyle = '';

  function positionTooltip() {
    if (!buttonEl || !tooltipEl || typeof window === 'undefined') return;
    const { left, top } = placeTooltip(buttonEl.getBoundingClientRect(), tooltipEl.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }, { position: tooltipPosition, align: tooltipAlign });
    tooltipStyle = `left: ${left}px; top: ${top}px;`;
  }

  // The pointer passing over a button on its way elsewhere should not set off a tooltip: it waits a moment.
  // Keyboard focus shows it at once — that is someone asking what the button is.
  let hoverTimer = null;

  async function reveal() {
    if (!tooltip) return;
    if (typeof window !== 'undefined' && window.innerWidth < 640) return;
    tooltipVisible = true;
    await tick();
    positionTooltip();
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
      class={tooltipClassName}
      style={tooltipStyle}
    >
      {tooltip}
    </span>
  {/if}
</span>
