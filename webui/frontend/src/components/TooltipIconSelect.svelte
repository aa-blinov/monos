<script>
  // The tooltip is the app's shared one (lib/tooltip.js), read from data-tooltip on the label.
  export let label;
  export let tooltip = label;
  export let options = [];
  export let value = '';
  export let tooltipPosition = 'bottom';

  let className = '';
  export { className as class };
</script>

<span class="inline-flex">
  <label
    class={className}
    data-tooltip={tooltip || undefined}
    data-tooltip-position={tooltipPosition}
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
        <option value={option.value}>{option.label || option.name}</option>
      {/each}
    </select>
  </label>

</span>

<style>
  /* The native select is transparent and takes the focus, so the visible
     control has to show the focus ring for keyboard users. */
  label:has(> select:focus-visible) {
    outline: 1px solid var(--text-primary);
    outline-offset: 2px;
  }
</style>
